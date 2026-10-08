import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, MailCheck } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { homePathFor, useAuth } from '@/contexts/AuthContext'
import { Alert, Button, EmptyState, LinkButton, PasswordField, TextField, useToast } from '@/components/ui'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { reportError } from '@/lib/errors'
import { sendPasswordReset, updatePassword, validatePassword } from '@/services/authService'

/**
 * Students have a username, not an e-mail address, so there is nowhere to send a reset link yet.
 * TODO(later): username-based recovery for students (for example an administrator-issued reset code or a
 * faculty-assisted reset). Until then the page says so plainly instead of pretending to send something.
 * Faculty and admins have a real address and keep the e-mail reset below — it does not touch the normal login UI.
 */
export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const from = params.get('from')
  return from === 'faculty' || from === 'admin' ? <StaffForgotPassword audience={from} /> : <StudentRecoveryNotice />
}

function StudentRecoveryNotice() {
  useDocumentTitle('Forgot password')
  return (
    <AuthLayout
      eyebrow="Forgot password"
      title="Password recovery"
      footer={
        <Link to="/login" className="font-semibold text-ink-900 underline underline-offset-4">
          Back to Login
        </Link>
      }
    >
      <div className="space-y-5">
        <Alert tone="info" title="Coming soon">
          Password recovery for username accounts isn't available yet. For now, please ask your faculty or an administrator
          to help you get back in.
        </Alert>
        <LinkButton to="/login" size="lg" className="w-full" variant="secondary">
          Back to Login
        </LinkButton>
      </div>
    </AuthLayout>
  )
}

function StaffForgotPassword({ audience }: { audience: 'faculty' | 'admin' }) {
  useDocumentTitle('Forgot password')
  const back = audience === 'faculty' ? '/faculty/login' : '/admin/login'
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(reportError(err, 'sendPasswordReset'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your college email and we'll send you a reset link."
      footer={
        <Link to={back} className="font-semibold text-ink-900 underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <EmptyState
          icon={MailCheck}
          title="Reset link requested"
          description={`If an account exists for ${email.trim()}, a password reset link is on its way. It may take a minute to arrive.`}
        />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label="College email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password')
  const { session, profile, loading, recoveryMode, clearRecoveryMode } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const found = {
      password: validatePassword(password) ?? undefined,
      confirm: confirm !== password ? 'Passwords do not match.' : undefined,
    }
    setErrors(found)
    if (found.password || found.confirm) return

    setBusy(true)
    try {
      await updatePassword(password)
      clearRecoveryMode()
      toast.success('Password updated. You are signed in.')
      navigate(profile ? homePathFor(profile.role) : '/login', { replace: true })
    } catch (err) {
      setError(reportError(err, 'updatePassword'))
    } finally {
      setBusy(false)
    }
  }

  // The reset link signs the user in (recovery session). Without one, the link was invalid or expired.
  const hasRecoverySession = Boolean(session) || recoveryMode

  return (
    <AuthLayout title="Choose a new password" subtitle="Pick something you don't use anywhere else.">
      {loading ? null : !hasRecoverySession ? (
        <div className="space-y-5">
          <Alert tone="warning" title="This reset link is invalid or has expired">
            Request a new link and open it within an hour.
          </Alert>
          <Link to="/forgot-password" className="block text-center text-sm font-semibold text-ink-900 underline underline-offset-4">
            Send me a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <PasswordField
            label="New password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint="8+ characters, with a letter and a number."
          />
          <PasswordField
            label="Confirm new password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <Button type="submit" size="lg" className="w-full" loading={busy} icon={<KeyRound className="size-4" aria-hidden />}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
