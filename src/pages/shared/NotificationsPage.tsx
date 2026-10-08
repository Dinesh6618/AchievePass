import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react'
import { notificationMeta } from '@/components/notifications/notificationMeta'
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SkeletonRows,
  Tabs,
  useToast,
} from '@/components/ui'
import { useNotifications } from '@/contexts/NotificationsContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { relativeTime } from '@/lib/dates'
import { reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { deleteNotification, listNotifications, markAllRead, markRead } from '@/services/notificationService'
import type { AppNotification } from '@/types'

const PAGE_SIZE = 20

export default function NotificationsPage() {
  useDocumentTitle('Notifications')
  const toast = useToast()
  const navigate = useNavigate()
  const { unread, refresh } = useNotifications()
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)

  const result = useAsync(
    () => listNotifications({ unreadOnly: tab === 'unread', page, pageSize: PAGE_SIZE }),
    [tab, page],
    { context: 'notifications' },
  )

  const open = async (n: AppNotification) => {
    if (!n.is_read) {
      try {
        await markRead(n.id)
        refresh()
        result.reload()
      } catch (err) {
        // reading the notification matters more than marking it
        reportError(err, 'mark notification read')
      }
    }
    if (n.link) navigate(n.link)
  }

  const onMarkAll = async () => {
    setBusy(true)
    try {
      await markAllRead()
      refresh()
      result.reload()
      toast.success('All notifications marked as read.')
    } catch (err) {
      toast.error(reportError(err, 'mark all read'))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (n: AppNotification) => {
    try {
      await deleteNotification(n.id)
      refresh()
      result.reload()
    } catch (err) {
      toast.error(reportError(err, 'delete notification'))
    }
  }

  const rows = result.data?.rows ?? []

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'You’re all caught up.'}
        actions={
          <Button variant="secondary" disabled={unread === 0} loading={busy} onClick={onMarkAll} icon={<CheckCheck className="size-4" aria-hidden />}>
            Mark all as read
          </Button>
        }
      />

      <Tabs
        label="Notification filter"
        value={tab}
        onChange={(t) => {
          setTab(t)
          setPage(0)
        }}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread', count: unread },
        ]}
      />

      <div className="mt-4">
        {result.error ? (
          <ErrorState message={result.error} onRetry={result.reload} />
        ) : result.loading && !result.data ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={tab === 'unread' ? BellOff : Bell}
            title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description="Updates about your submissions, OD requests and verifications will show up here."
          />
        ) : (
          <>
            <ul className="card divide-y divide-paper-100 overflow-hidden">
              {rows.map((n) => {
                const meta = notificationMeta(n.type)
                return (
                  <li key={n.id} className={cn('flex items-start gap-3 p-4', !n.is_read && 'bg-gold-50/50')}>
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', meta.tone)}>
                      <meta.icon className="size-[18px]" aria-hidden />
                    </span>
                    <button
                      type="button"
                      onClick={() => void open(n)}
                      className="min-w-0 flex-1 rounded text-left focus-visible:outline-2"
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn('text-sm text-ink-900', !n.is_read && 'font-semibold')}>{n.title}</span>
                        {!n.is_read && <span className="size-2 rounded-full bg-gold-500" aria-label="Unread" />}
                      </span>
                      {n.message && <span className="mt-0.5 block text-sm text-ink-600">{n.message}</span>}
                      <span className="mt-1 block text-xs text-ink-400">{relativeTime(n.created_at)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(n)}
                      aria-label={`Delete notification: ${n.title}`}
                      className="rounded-md p-2 text-ink-400 hover:bg-paper-100 hover:text-rejected-600"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
