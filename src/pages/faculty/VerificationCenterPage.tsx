import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCheck, ClipboardCheck, Clock, GraduationCap, Inbox, MapPin, ShieldCheck, XCircle } from 'lucide-react'
import { ReviewActions } from '@/components/review/ReviewActions'
import {
  AchievementStatusBadge,
  EmptyState,
  ErrorState,
  FilterInput,
  FilterSelect,
  LinkButton,
  OdStatusBadge,
  PageHeader,
  Pagination,
  SkeletonCards,
  SkeletonRows,
  StatCard,
  Tabs,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCategories } from '@/hooks/useReference'
import { formatDateRange, relativeTime } from '@/lib/dates'
import { getReviewStats } from '@/services/reviewService'
import { searchAchievements, searchOds } from '@/services/searchService'
import type { AchievementDetail, OdDetail } from '@/types'

const PAGE_SIZE = 10

export default function VerificationCenterPage() {
  useDocumentTitle('Verification Center')
  const profile = useProfile()
  const categories = useCategories()
  const [tab, setTab] = useState<'certificates' | 'ods'>('certificates')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [page, setPage] = useState(0)
  const search = useDebouncedValue(q, 300)

  const stats = useAsync(getReviewStats, [], { context: 'review stats' })
  const certs = useAsync(
    () => searchAchievements({ status: 'pending', sort: 'submitted', q: search, categoryId, page, pageSize: PAGE_SIZE }),
    [search, categoryId, page],
    { enabled: tab === 'certificates', context: 'verification queue' },
  )
  const ods = useAsync(() => searchOds({ status: 'pending', q: search, page, pageSize: PAGE_SIZE }), [search, page], {
    enabled: tab === 'ods',
    context: 'od queue',
  })

  const refreshAll = () => {
    stats.reload()
    certs.reload()
    ods.reload()
  }

  const s = stats.data

  return (
    <div>
      <PageHeader
        eyebrow={profile.department?.name ?? 'Faculty'}
        title="Verification Center"
        subtitle="Review certificates and OD requests from your department."
      />

      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : stats.loading && !s ? (
        <SkeletonCards count={5} className="lg:grid-cols-5" />
      ) : s ? (
        <section aria-label="Queue summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Pending certificates" value={s.pending_certificates} icon={Clock} tone="pending" />
          <StatCard label="Pending OD requests" value={s.pending_ods} icon={ClipboardCheck} tone="info" to="/faculty/od" />
          <StatCard label="Verified today" value={s.verified_today} icon={CheckCheck} tone="verified" />
          <StatCard label="Rejected" value={s.rejected} icon={XCircle} tone="rejected" />
          <StatCard label="Total students" value={s.total_students} icon={GraduationCap} to="/faculty/students" />
        </section>
      ) : null}

      <div className="mt-8">
        <Tabs
          label="Verification queue"
          value={tab}
          onChange={(t) => {
            setTab(t)
            setPage(0)
          }}
          tabs={[
            { id: 'certificates', label: 'Certificates', count: s?.pending_certificates },
            { id: 'ods', label: 'OD requests', count: s?.pending_ods },
          ]}
        />

        <div className="mt-4 flex flex-wrap gap-2" role="search" aria-label="Filter the queue">
          <FilterInput
            type="search"
            aria-label="Search the queue"
            placeholder="Search student, register no., event…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            className="w-full sm:w-80"
          />
          {tab === 'certificates' && (
            <FilterSelect
              aria-label="Filter by category"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value)
                setPage(0)
              }}
            >
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
          )}
        </div>

        <div className="mt-4">
          {tab === 'certificates' ? (
            <CertificateQueue result={certs} onChanged={refreshAll} onPage={setPage} page={page} filtered={Boolean(search || categoryId)} />
          ) : (
            <OdQueue result={ods} onPage={setPage} page={page} filtered={Boolean(search)} />
          )}
        </div>
      </div>
    </div>
  )
}

function CertificateQueue({
  result,
  onChanged,
  onPage,
  page,
  filtered,
}: {
  result: ReturnType<typeof useAsync<{ rows: AchievementDetail[]; total: number }>>
  onChanged: () => void
  onPage: (p: number) => void
  page: number
  filtered: boolean
}) {
  if (result.error) return <ErrorState message={result.error} onRetry={result.reload} />
  if (result.loading && !result.data) return <SkeletonRows rows={4} />
  const rows = result.data?.rows ?? []
  if (rows.length === 0) {
    return filtered ? (
      <EmptyState icon={Inbox} title="No matches" description="No pending certificates match your search." />
    ) : (
      <EmptyState icon={ShieldCheck} title="You're all caught up" description="There are no certificates waiting for verification." />
    )
  }
  return (
    <>
      <ul className="space-y-3">
        {rows.map((a) => (
          <li key={a.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Student</p>
                <p className="font-medium">
                  {a.student_name}{' '}
                  <span className="font-mono text-sm font-normal text-ink-500">{a.register_number}</span>
                </p>
              </div>
              <AchievementStatusBadge status={a.status} />
            </div>

            <div className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
              <div className="sm:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Event</p>
                <Link to={`/faculty/review/${a.id}`} className="font-display text-lg font-semibold leading-snug hover:underline">
                  {a.event_name}
                </Link>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Date</p>
                <p>{formatDateRange(a.start_date, a.end_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Type</p>
                <p>{a.category_name}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-paper-100 pt-4">
              <ReviewActions achievementId={a.id} eventName={a.event_name} studentName={a.student_name} onDone={onChanged} />
              <div className="flex items-center gap-3 text-xs text-ink-500">
                {a.submitted_at && <span>Submitted {relativeTime(a.submitted_at)}</span>}
                <LinkButton to={`/faculty/review/${a.id}`} size="sm" variant="ghost">
                  Full review
                </LinkButton>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onChange={onPage} />
    </>
  )
}

function OdQueue({
  result,
  onPage,
  page,
  filtered,
}: {
  result: ReturnType<typeof useAsync<{ rows: OdDetail[]; total: number }>>
  onPage: (p: number) => void
  page: number
  filtered: boolean
}) {
  if (result.error) return <ErrorState message={result.error} onRetry={result.reload} />
  if (result.loading && !result.data) return <SkeletonRows rows={4} />
  const rows = result.data?.rows ?? []
  if (rows.length === 0) {
    return filtered ? (
      <EmptyState icon={Inbox} title="No matches" description="No pending OD requests match your search." />
    ) : (
      <EmptyState icon={ClipboardCheck} title="No OD requests waiting" description="New requests from your students will appear here." />
    )
  }
  return (
    <>
      <ul className="space-y-3">
        {rows.map((o) => (
          <li key={o.id}>
            <Link to={`/faculty/od/${o.id}`} className="card flex flex-wrap items-start justify-between gap-3 p-4 transition-colors hover:border-ink-300 sm:p-5">
              <div className="min-w-0">
                <p className="font-medium">
                  {o.student_name} <span className="font-mono text-sm font-normal text-ink-500">{o.register_number}</span>
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold leading-snug">{o.event_name}</h3>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" aria-hidden /> {formatDateRange(o.event_date, o.event_end_date)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {o.venue}
                  </span>
                </p>
              </div>
              <OdStatusBadge status={o.status} />
            </Link>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onChange={onPage} />
    </>
  )
}
