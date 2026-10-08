import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { NotificationsProvider, useNotifications } from '@/contexts/NotificationsContext'
import { Logo } from '@/components/brand/Logo'
import { Avatar, useToast } from '@/components/ui'
import { reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { NAV, ROLE_LABEL } from './navigation'
import { PageOutlet } from './PageOutlet'
import { GlobalSearch, NotificationBell, OfflineBanner } from './parts'

type SidebarRole = 'student' | 'admin'

/**
 * Student: the navy "passport cover" sidebar.  Admin: a quieter light sidebar.
 * (Faculty has its own top-bar shell on purpose — it is a work tool, not a journey.)
 */
export function SidebarShell({ role }: { role: SidebarRole }) {
  return (
    <NotificationsProvider>
      <ShellInner role={role} />
    </NotificationsProvider>
  )
}

function ShellInner({ role }: { role: SidebarRole }) {
  const { profile, signOut } = useAuth()
  const { unread } = useNotifications()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const dark = role === 'student'

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleSignOut = async () => {
    try {
      navigate('/', { replace: true })
      await signOut()
    } catch (err) {
      toast.error(reportError(err, 'signOut', "We couldn't sign you out. Please try again."))
    }
  }

  const items = NAV[role]

  return (
    <div className="min-h-screen lg:pl-64">
      <a
        href="#main"
        className="sr-only z-[200] rounded-md bg-ink-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {open && (
        <div className="fixed inset-0 z-30 bg-ink-950/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        aria-label="Primary"
        className={cn(
          'no-print fixed inset-y-0 left-0 z-40 w-64 flex-col',
          open ? 'flex' : 'hidden lg:flex',
          dark ? 'bg-ink-900 text-ink-100' : 'border-r border-paper-200 bg-white text-ink-800',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Logo inverse={dark} />
          <button
            type="button"
            className={cn('rounded-md p-1.5 lg:hidden', dark ? 'hover:bg-white/10' : 'hover:bg-paper-100')}
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {dark && (
          <div className="mx-5 mb-3 h-px bg-gradient-to-r from-gold-500/70 via-gold-500/20 to-transparent" aria-hidden />
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  dark
                    ? isActive
                      ? 'bg-white/10 text-white'
                      : item.accent
                        ? 'text-gold-400 hover:bg-white/5'
                        : 'text-ink-200 hover:bg-white/5 hover:text-white'
                    : isActive
                      ? 'bg-ink-900 text-white'
                      : 'text-ink-600 hover:bg-paper-100 hover:text-ink-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn('size-[18px] shrink-0', dark && isActive && 'text-gold-400')}
                    aria-hidden
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.label === 'Notifications' && unread > 0 && (
                    <span className="rounded-full bg-rejected-600 px-1.5 text-[11px] font-bold leading-5 text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={cn('shrink-0 border-t p-4', dark ? 'border-white/10' : 'border-paper-200')}>
          <div className="flex items-center gap-3">
            <Avatar name={profile?.full_name} src={profile?.avatar_url} size="md" />
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm font-semibold', dark ? 'text-white' : 'text-ink-900')}>
                {profile?.full_name}
              </p>
              <p className={cn('truncate text-xs', dark ? 'text-ink-300' : 'text-ink-500')}>
                {profile?.register_number ?? ROLE_LABEL[role]}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className={cn('rounded-md p-2', dark ? 'text-ink-300 hover:bg-white/10 hover:text-white' : 'text-ink-500 hover:bg-paper-100 hover:text-ink-900')}
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <OfflineBanner />
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-paper-200 bg-paper/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-2 rounded-md p-2 text-ink-700 hover:bg-paper-100 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Logo showWordmark={false} className="lg:hidden" />
          <GlobalSearch role={role} className="min-w-0 flex-1 sm:max-w-md" />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell role={role} />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <PageOutlet />
        </main>
      </div>
    </div>
  )
}
