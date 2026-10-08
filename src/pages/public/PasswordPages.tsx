import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Alert, LinkButton } from '@/components/ui'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/**
 * Nobody has an e-mail address on file (everyone signs in with a username), so there is nowhere to send a reset link.
 * TODO(later): self-service recovery for username accounts (for example security questions or a one-time code issued
 * by an administrator). Until then the page says so plainly instead of pretending to send something, and administrators
 * can set a new password for any student or faculty account (Admin → Students / Faculty → Edit).
 */
export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password')
  return (
    <AuthLayout
      eyebrow="Forgot password"
      title="Password recovery"
      footer={
        <Link to="/login/student" className="font-semibold text-ink-900 underline underline-offset-4">
          Back to Login
        </Link>
      }
    >
      <div className="space-y-5">
        <Alert tone="info" title="Coming soon">
          Self-service password recovery isn't available yet. For now, please ask your faculty or an administrator to set a
          new password for you.
        </Alert>
        <LinkButton to="/login/student" size="lg" className="w-full" variant="secondary">
          Back to Login
        </LinkButton>
      </div>
    </AuthLayout>
  )
}
