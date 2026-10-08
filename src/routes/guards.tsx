import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { homePathFor, useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/brand/Logo'
import { Spinner } from '@/components/ui'
import type { Role } from '@/types'

export function FullPageLoader({ label = 'Opening your passport…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
      <Logo />
      <div className="flex items-center gap-2 text-sm text-ink-500">
        <Spinner />
        <span>{label}</span>
      </div>
    </div>
  )
}

/**
 * Gate for signed-in areas. Unauthenticated visitors go to the matching login page and
 * come back afterwards; signed-in users on the wrong area are sent to their own home.
 */
export function RequireRole({ role, children }: { role: Role; children?: ReactNode }) {
  const { session, profile, loading, recoveryMode } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />

  if (!session || !profile) {
    const loginPath = role === 'student' ? '/login' : `/${role}/login`
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />
  }

  if (recoveryMode) return <Navigate to="/reset-password" replace />
  if (profile.role !== role) return <Navigate to={homePathFor(profile.role)} replace />

  return children ?? <Outlet />
}

/** Login / register pages: bounce already-signed-in users to their home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (session && profile) {
    const home = homePathFor(profile.role)
    const from = (location.state as { from?: string } | null)?.from
    // Only honour a return-to path inside the user's own area.
    return <Navigate to={from && from.startsWith(home) ? from : home} replace />
  }
  return children
}
