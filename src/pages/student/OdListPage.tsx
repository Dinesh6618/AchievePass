import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Plus, XCircle } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  LinkButton,
  OD_STATUS,
  OdStatusBadge,
  PageHeader,
  SkeletonCards,
  SkeletonRows,
  StatCard,
  Tabs,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateRange, formatTime } from '@/lib/dates'
import { listMyOds } from '@/services/odService'
import type { OdStatus } from '@/types'

type Filter = 'all' | OdStatus

export default function OdListPage() {
  useDocumentTitle('OD requests')
  const profile = useProfile()
  const ods = useAsync(() => listMyOds(profile.id), [profile.id], { context: 'od list' })
  const [filter, setFilter] = useState<Filter>('all')

  const list = ods.data
  const counts = useMemo(() => {
    const c = { all: list?.length ?? 0, pending: 0, approved: 0, rejected: 0, more_info: 0 }
    for (const o of list ?? []) c[o.status]++
    return c
  }, [list])
  const visible = useMemo(() => (list ?? []).filter((o) => filter === 'all' || o.status === filter), [list, filter])

  return (
    <div>
      <PageHeader
        eyebrow="On-duty"
        title="OD requests"
        subtitle="Track every on-duty request and what faculty decided."
        actions={
          <LinkButton to="/student/od/new" icon={<Plus className="size-4" aria-hidden />}>
            New OD request
          </LinkButton>
        }
      />

      {ods.error ? (
        <ErrorState message={ods.error} onRetry={ods.reload} />
      ) : ods.loading && !list ? (
        <div className="space-y-6">
          <SkeletonCards count={4} />
          <SkeletonRows rows={4} />
        </div>
      ) : list && list.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No OD requests yet"
          description="Submit an achievement, then request OD for it in one step. Your requests and their status will appear here."
          action={
            <LinkButton to="/student/achievements/new" icon={<Plus className="size-4" aria-hidden />}>
              Add Achievement
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-6">
          <section aria-label="OD summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total requests" value={counts.all} icon={ClipboardList} />
            <StatCard label="Pending" value={counts.pending + counts.more_info} icon={Clock} tone="pending" hint={counts.more_info ? `${counts.more_info} need info` : undefined} />
            <StatCard label="Approved" value={counts.approved} icon={CheckCircle2} tone="verified" />
            <StatCard label="Rejected" value={counts.rejected} icon={XCircle} tone="rejected" />
          </section>

          <div>
            <Tabs
              label="Filter OD requests"
              value={filter}
              onChange={setFilter}
              tabs={[
                { id: 'all', label: 'All', count: counts.all },
                ...(['pending', 'more_info', 'approved', 'rejected'] as OdStatus[]).map((s) => ({
                  id: s,
                  label: OD_STATUS[s].label,
                  count: counts[s],
                })),
              ]}
            />

            <ul className="mt-4 space-y-3">
              {visible.length === 0 ? (
                <li>
                  <EmptyState title="Nothing here" description="No OD requests with this status." />
                </li>
              ) : (
                visible.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/student/od/${o.id}`}
                      className="card flex flex-wrap items-start justify-between gap-3 p-4 transition-colors hover:border-ink-300"
                    >
                      <div className="min-w-0">
                        <h3 className="break-words font-display text-lg font-semibold leading-snug">{o.event_name}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="size-3.5" aria-hidden /> {formatDateRange(o.event_date, o.event_end_date)}
                          </span>
                          {o.start_time && (
                            <span>
                              {formatTime(o.start_time)}
                              {o.end_time && ` – ${formatTime(o.end_time)}`}
                            </span>
                          )}
                          <span>{o.venue}</span>
                        </p>
                        {o.review_comment && o.status !== 'approved' && (
                          <p className="mt-2 line-clamp-2 text-sm text-ink-700">“{o.review_comment}”</p>
                        )}
                      </div>
                      <OdStatusBadge status={o.status} />
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
