import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Alert, Button, PasswordField, SelectField, Skeleton, TextField, useToast } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { reportError } from '@/lib/errors'
import { normalizeUsername, USERNAME_MAX, validateUsername } from '@/lib/identity'
import {
  fetchPublicSettings,
  isRegisterNumberAvailable,
  isUsernameAvailable,
  signUpStudent,
  validatePassword,
} from '@/services/authService'
import { listDepartments } from '@/services/referenceService'

interface Form {
  username: string
  password: string
  confirm: string
  fullName: string
  registerNumber: string
  departmentId: string
  year: string
  section: string
}

const EMPTY: Form = { username: '', password: '', confirm: '', fullName: '', registerNumber: '', departmentId: '', year: '', section: '' }

type Errors = Partial<Record<keyof Form, string>>

/** Username + password + student details. No e-mail: the new student is signed in and lands on their passport. */
export default function RegisterPage() {
  useDocumentTitle('Create account')
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useAsync(fetchPublicSettings, [], { context: 'public settings' })
  const departments = useAsync(() => listDepartments(), [], { context: 'departments' })

  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const set = <K extends keyof Form>(key: K) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((cur) => ({ ...cur, [key]: undefined }))
  }

  const closed = settings.data?.allow_student_registration === false

  const validate = (): Errors => {
    const e: Errors = {}
    const u = validateUsername(form.username)
    if (u) e.username = u
    const pw = validatePassword(form.password)
    if (pw) e.password = pw
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match.'
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name.'
    if (!form.registerNumber.trim()) e.registerNumber = 'Enter your register number.'
    if (!form.departmentId) e.departmentId = 'Choose your department.'
    if (!form.year) e.year = 'Choose your year.'
    if (!form.section.trim()) e.section = 'Enter your section.'
    return e
  }

  // Courtesy checks while filling the form; the database enforces uniqueness on submit anyway.
  const checkUsername = async () => {
    if (validateUsername(form.username)) return
    try {
      if (!(await isUsernameAvailable(form.username))) {
        setErrors((cur) => ({ ...cur, username: 'That username is already taken. Please choose another.' }))
      }
    } catch {
      /* ignore */
    }
  }
  const checkRegisterNumber = async () => {
    const value = form.registerNumber.trim()
    if (!value) return
    try {
      if (!(await isRegisterNumberAvailable(value))) {
        setErrors((cur) => ({ ...cur, registerNumber: 'This register number is already registered. Try signing in.' }))
      }
    } catch {
      /* ignore */
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    try {
      await signUpStudent({
        username: form.username,
        password: form.password,
        fullName: form.fullName,
        registerNumber: form.registerNumber,
        departmentId: form.departmentId,
        year: Number(form.year),
        section: form.section,
      })
      // Account + profile exist and the new student is already signed in — straight to the passport.
      toast.success(`Welcome, ${form.fullName.trim().split(/\s+/)[0]}! Your passport is ready.`)
      navigate('/student', { replace: true })
    } catch (err) {
      setFormError(reportError(err, 'signUp'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      wide
      eyebrow="Student registration"
      title="Create Account"
      subtitle="Choose a username and password, then tell us about yourself."
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink-900 underline underline-offset-4">
            Login
          </Link>
        </p>
      }
    >
      {closed ? (
        <Alert tone="warning" title="Registration is closed">
          New student accounts are not being accepted right now. Please contact your administrator.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          {departments.error && <Alert tone="error">{departments.error}</Alert>}

          <TextField
            label="Username"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={form.username}
            onChange={set('username')}
            onBlur={() => {
              setForm((f) => ({ ...f, username: normalizeUsername(f.username) }))
              void checkUsername()
            }}
            error={errors.username}
            hint="3–100 letters, numbers, dots, dashes or underscores; one @ is allowed — e.g. dinesh2024 or name@college.edu"
            maxLength={USERNAME_MAX}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <PasswordField
              label="Password"
              required
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              error={errors.password}
              hint="8+ characters, with a letter and a number."
            />
            <PasswordField
              label="Confirm Password"
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={set('confirm')}
              error={errors.confirm}
            />
          </div>

          <TextField label="Full Name" required autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Register Number"
              required
              value={form.registerNumber}
              onChange={set('registerNumber')}
              onBlur={checkRegisterNumber}
              error={errors.registerNumber}
              autoCapitalize="characters"
            />
            {departments.loading ? (
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-ink-800">Department</span>
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <SelectField label="Department" required value={form.departmentId} onChange={set('departmentId')} error={errors.departmentId}>
                <option value="">Select…</option>
                {departments.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Year" required value={form.year} onChange={set('year')} error={errors.year}>
              <option value="">Select…</option>
              {[1, 2, 3, 4].map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </SelectField>
            <TextField label="Section" required value={form.section} onChange={set('section')} error={errors.section} maxLength={10} placeholder="A" />
          </div>

          <Button type="submit" size="lg" className="w-full" loading={busy} icon={<UserPlus className="size-4" aria-hidden />}>
            Create Account
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
