import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Alert, Button, PasswordField, TextField } from '@/components/ui'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { reportError } from '@/lib/errors'
import { validateUsername } from '@/lib/identity'
import type { Role } from '@/types'

const LOGIN_PATH: Record<Role, string> = { student: '/login', faculty: '/faculty/login', admin: '/admin/login' }

const STAFF_COPY: Record<'faculty' | 'admin', { eyebrow: string; title: string; subtitle: string; emailLabel: string }> = {
  faculty: {
    eyebrow: 'Faculty sign in',
    title: 'Verification Center',
    subtitle: 'Sign in to review certificates and OD requests.',
    emailLabel: 'College email',
  },
  admin: {
    eyebrow: 'Administrator sign in',
    title: 'Admin console',
    subtitle: 'Restricted to authorised administrators.',
    emailLabel: 'Admin email',
  },
}

/**
 * Students sign in with a username + password. Faculty and admins have their own pages and use their e-mail address.
 * On success <PublicOnly> sends the user to their own area (or back to where they came from) — the role always comes
 * from the database, never from which page was used.
 */
export default function LoginPage({ audience }: { audience: Role }) {
  return audience === 'student' ? <StudentLogin /> : <StaffLogin audience={audience} />
}

function StudentLogin() {
  useDocumentTitle('Sign in')
  const { signInWithUsername, accountError } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const problem = validateUsername(username)
    // an address typed into the username box gets a precise hint instead of "incorrect password"
    if (problem && /not an email|enter a username/i.test(problem)) return setUsernameError(problem)
    setUsernameError(null)
    setBusy(true)
    try {
      await signInWithUsername(username, password)
    } catch (err) {
      setError(reportError(err, 'signIn'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Student sign in"
      title="CertiPass"
      subtitle="Your Digital Achievement Passport"
      footer={
        <div className="space-y-3">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-ink-900 underline underline-offset-4">
              Create Account
            </Link>
          </p>
          <p className="text-xs">
            Faculty or admin?{' '}
            <Link to="/faculty/login" className="underline underline-offset-2 hover:text-ink-900">
              Faculty sign in
            </Link>{' '}
            ·{' '}
            <Link to="/admin/login" className="underline underline-offset-2 hover:text-ink-900">
              Admin sign in
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
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
            setUsernameError(null)
          }}
          error={usernameError}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={<LogIn className="size-4" aria-hidden />}>
          Login
        </Button>
        <p className="text-center">
          <Link to="/forgot-password" className="text-sm font-medium text-ink-600 underline underline-offset-4 hover:text-ink-900">
            Forgot Password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

function StaffLogin({ audience }: { audience: 'faculty' | 'admin' }) {
  const copy = STAFF_COPY[audience]
  useDocumentTitle(copy.eyebrow)
  const { signIn, accountError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(reportError(err, 'signIn'))
    } finally {
      setBusy(false)
    }
  }

  const other: Role = audience === 'faculty' ? 'admin' : 'faculty'

  return (
    <AuthLayout
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <p className="text-xs">
          Other portals:{' '}
          <Link to={LOGIN_PATH.student} className="underline underline-offset-2 hover:text-ink-900">
            Student sign in
          </Link>{' '}
          ·{' '}
          <Link to={LOGIN_PATH[other]} className="underline underline-offset-2 hover:text-ink-900">
            {other === 'admin' ? 'Admin' : 'Faculty'} sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {(error || accountError) && <Alert tone="error">{error ?? accountError}</Alert>}
        <TextField
          label={copy.emailLabel}
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@college.edu"
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end">
          <Link
            to={`/forgot-password?from=${audience}`}
            className="text-sm font-medium text-ink-600 underline underline-offset-4 hover:text-ink-900"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={<LogIn className="size-4" aria-hidden />}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
