import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { GraduationCap, LogIn, ShieldCheck, UserCog, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Alert, Button, PasswordField, TextField } from '@/components/ui'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'
import { reportError } from '@/lib/errors'
import { normalizeUsername } from '@/lib/identity'
import type { Role } from '@/types'

const ROLES: { role: Role; label: string; button: string; icon: LucideIcon }[] = [
  { role: 'student', label: 'Student', button: 'Login', icon: GraduationCap },
  { role: 'faculty', label: 'Faculty', button: 'Faculty Login', icon: ShieldCheck },
  { role: 'admin', label: 'Admin', button: 'Admin Login', icon: UserCog },
]

const isRole = (value: string | undefined): value is Role => ROLES.some((r) => r.role === value)

/**
 * One sign-in page for every account type: pick Student, Faculty or Admin, then Username + Password.
 * Only students see "Create Account" — faculty accounts are created by an administrator and the first administrator
 * is set up on the server, so there is deliberately no public sign-up for either.
 * On success <PublicOnly> sends the user to their own area (Passport / Verification Center / Admin Dashboard);
 * the role always comes from the database, and an account used on the wrong tab is refused (see AuthContext).
 */
export default function LoginPage() {
  const { role: param } = useParams()
  useDocumentTitle('Sign in')
  if (param !== undefined && !isRole(param)) return <Navigate to="/login" replace />
  const role = isRole(param) ? param : null

  return (
    <AuthLayout
      title="CertiPass"
      subtitle="Digital Achievement Passport"
      footer={
        role === 'student' ? (
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-ink-900 underline underline-offset-4">
              Create Account
            </Link>
          </p>
        ) : undefined
      }
    >
      <div className="space-y-7">
        <RolePicker selected={role} />
        {role && <CredentialsForm key={role} role={role} />}
      </div>
    </AuthLayout>
  )
}

function RolePicker({ selected }: { selected: Role | null }) {
  const { clearAccountError } = useAuth()
  return (
    <div>
      <p id="account-type" className="text-center text-sm font-medium text-ink-600">
        Choose your account type
      </p>
      <nav aria-labelledby="account-type" className="mt-3 grid grid-cols-3 gap-2">
        {ROLES.map(({ role, label, icon: Icon }) => {
          const active = role === selected
          return (
            <Link
              key={role}
              to={`/login/${role}`}
              // a refusal belongs to the tab it happened on — don't carry it over to the next one
              onClick={clearAccountError}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-sm font-semibold transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900',
                active
                  ? 'border-ink-900 bg-ink-900 text-white shadow-sm'
                  : 'border-paper-300 bg-white text-ink-700 hover:border-ink-400 hover:bg-paper-100',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function CredentialsForm({ role }: { role: Role }) {
  const { signInWithUsername, accountError } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = ROLES.find((r) => r.role === role)!.button

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const found = {
      username: normalizeUsername(username) ? undefined : 'Enter your username.',
      password: password ? undefined : 'Enter your password.',
    }
    setErrors(found)
    if (found.username || found.password) return
    setBusy(true)
    try {
      await signInWithUsername(username, password, role)
    } catch (err) {
      setError(reportError(err, 'signIn'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate aria-label={`${ROLES.find((r) => r.role === role)!.label} sign in`}>
      {(error || accountError) && <Alert tone="error">{error ?? accountError}</Alert>}
      <TextField
        label="Username"
        required
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => {
          setUsername(e.target.value)
          setErrors((cur) => ({ ...cur, username: undefined }))
        }}
        error={errors.username}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setErrors((cur) => ({ ...cur, password: undefined }))
        }}
        error={errors.password}
      />
      <Button type="submit" size="lg" className="w-full" loading={busy} icon={<LogIn className="size-4" aria-hidden />}>
        {label}
      </Button>
      {role === 'student' && (
        <p className="text-center">
          <Link to="/forgot-password" className="text-sm font-medium text-ink-600 underline underline-offset-4 hover:text-ink-900">
            Forgot Password?
          </Link>
        </p>
      )}
    </form>
  )
}
