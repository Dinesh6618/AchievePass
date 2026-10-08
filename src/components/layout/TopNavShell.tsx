import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationsProvider } from '@/contexts/NotificationsContext'
import { Logo } from '@/components/brand/Logo'
import { Avatar, useToast } from '@/components/ui'
import { reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { getReviewStats } from '@/services/reviewService'
import { NAV } from './navigation'
import { PageOutlet } from './PageOutlet'
import { GlobalSearch, NotificationBell, OfflineBanner } from './parts'

/**
 * Faculty shell. Deliberately different from the student's passport: a dense,
 * top-bar workspace where the queue count is always visible.
 */
export function TopNavShell() {
  return (
    <NotificationsProvider>
      <Inner />
    </NotificationsProvider>
  )
}

function Inner() {
  const { profile, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [queue, setQueue] = useState<number | null>(null)

  // Keep the "pending" counters on the nav fresh as the faculty member moves around.
  useEffect(() => {
    let active = true
    getReviewStats()
      .then((s) => active && setQueue(s.pending_certificates + s.pending_ods))
      .catch(() => active && setQueue(null))
    return () => {
      active = false
    }
  }, [location.pathname])

  const handleSignOut = async () => {
    try {
      navigate('/', { replace: true })
      await signOut()
    } catch (err) {
      toast.error(reportError(err, 'signOut', "We couldn't sign you out. Please try again."))
    }
  }

  return (
    <div className="min-h-screen bg-ink-50/60">
      <a
        href="#main"
        className="sr-only z-[200] rounded-md bg-ink-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <OfflineBanner />
      <header className="no-print sticky top-0 z-30 border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <span className="hidden rounded-sm bg-ink-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-gold-400 sm:inline">
            Faculty
          </span>
          <GlobalSearch role="faculty" className="ml-auto hidden min-w-0 max-w-sm flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <NotificationBell role="faculty" />
            <div className="ml-1 hidden items-center gap-2 border-l border-ink-100 pl-3 sm:flex">
              <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
              <span className="max-w-[10rem] truncate text-sm font-medium">{profile?.full_name}</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-2 text-ink-500 hover:bg-paper-100 hover:text-ink-900"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <nav aria-label="Primary" className="mx-auto max-w-7xl overflow-x-auto px-2 sm:px-4">
          <ul className="flex min-w-max gap-1">
            {NAV.faculty.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-gold-500 text-ink-900'
                        : 'border-transparent text-ink-500 hover:text-ink-900',
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                  {item.to === '/faculty' && queue !== null && queue > 0 && (
                    <span className="rounded-full bg-pending-600 px-1.5 text-[11px] font-bold leading-5 text-white">
                      {queue}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <PageOutlet />
      </main>
    </div>
  )
}
