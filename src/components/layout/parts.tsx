import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'
import { useNotifications } from '@/contexts/NotificationsContext'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

export function NotificationBell({ role, className }: { role: Role; className?: string }) {
  const { unread } = useNotifications()
  return (
    <Link
      to={`/${role}/notifications`}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-md text-ink-600 hover:bg-paper-100 hover:text-ink-900',
        className,
      )}
    >
      <Bell className="size-[18px]" aria-hidden />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-rejected-600 px-1 text-[10px] font-bold leading-4 text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}

const SEARCH_PLACEHOLDER: Record<Role, string> = {
  student: 'Search your achievements…',
  faculty: 'Search students, events, register numbers…',
  admin: 'Search students, events, organizations…',
}

export function GlobalSearch({ role, className }: { role: Role; className?: string }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    const base = role === 'student' ? '/student/achievements' : `/${role}/search`
    navigate(term ? `${base}?q=${encodeURIComponent(term)}` : base)
  }

  return (
    <form role="search" onSubmit={onSubmit} className={cn('relative', className)}>
      <label htmlFor="global-search" className="sr-only">
        Search
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" aria-hidden />
      <input
        id="global-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={SEARCH_PLACEHOLDER[role]}
        className="h-9 w-full rounded-md border border-paper-300 bg-white pl-9 pr-3 text-sm placeholder:text-ink-300 focus:border-ink-700 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
      />
    </form>
  )
}

export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (online) return null
  return (
    <div role="alert" className="bg-pending-50 px-4 py-2 text-center text-sm font-medium text-pending-700">
      You're offline. Changes can't be saved until your connection returns.
    </div>
  )
}
