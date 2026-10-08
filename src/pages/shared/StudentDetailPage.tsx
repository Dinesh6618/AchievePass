import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Award, CheckCircle2, ClipboardCheck, ClipboardList, Clock } from 'lucide-react'
import { categoryIcon } from '@/components/passport/categoryIcons'
import { JourneyRoute } from '@/components/passport/JourneyTimeline'
import {
  AchievementStatusBadge,
  Avatar,
  EmptyState,
  ErrorState,
  LinkButton,
  OdStatusBadge,
  SectionCard,
  Skeleton,
  SkeletonCards,
  SkeletonRows,
  StatCard,
  Tabs,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateRange } from '@/lib/dates'
import { paths } from '@/routes/paths'
import { getStudentSummary } from '@/services/profileService'
import { searchAchievements, searchOds } from '@/services/searchService'

/** One student's full record, for faculty (their department) and admins. */
export default function StudentDetailPage() {
  const { id = '' } = useParams()
  const viewer = useProfile()
  const [tab, setTab] = useState<'achievements' | 'od'>('achievements')

  const student = useAsync(() => getStudentSummary(id), [id], { context: 'student summary' })
  const achievements = useAsync(() => searchAchievements({ studentId: id, excludeDrafts: true, pageSize: 100 }), [id], { context: 'student achievements' })
  const ods = useAsync(() => searchOds({ studentId: id, pageSize: 100 }), [id], { context: 'student ods' })
  const s = student.data
  useDocumentTitle(s?.full_name ?? 'Student')

  const back = `/${viewer.role}/students`

  if (student.error) return <ErrorState message={student.error} onRetry={student.reload} />
  if (student.loading && !s) return <Skeleton className="h-96 w-full" />
  if (!s) {
    return (
      <EmptyState
        title="Student not found"
        description="They may belong to another department."
        action={<LinkButton to={back}>Back to students</LinkButton>}
      />
    )
  }

  const rows = achievements.data?.rows ?? []

  return (
    <div className="space-y-6">
      <Link to={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Students
      </Link>

      <header className="flex flex-wrap items-center gap-5">
        <Avatar name={s.full_name} src={s.avatar_url} size="lg" />
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold sm:text-3xl">{s.full_name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            <span className="font-mono">{s.register_number}</span>
            {s.department_name && <> · {s.department_name}</>}
            {s.year && <> · Year {s.year}</>}
            {s.section && <> · Section {s.section}</>}
          </p>
          <p className="text-sm text-ink-500">
            Username <span className="font-mono">{s.username}</span>
            {s.phone && <> · {s.phone}</>}
          </p>
        </div>
      </header>

      {achievements.loading && !achievements.data ? (
        <SkeletonCards count={4} />
      ) : (
        <section aria-label="Participation summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Achievements" value={s.total_achievements} icon={Award} />
          <StatCard label="Verified" value={s.verified_achievements} icon={CheckCircle2} tone="verified" />
          <StatCard label="Pending" value={s.pending_achievements} icon={Clock} tone="pending" />
          <StatCard label="OD requests" value={s.total_ods} icon={ClipboardList} tone="info" />
          <StatCard label="Approved ODs" value={s.approved_ods} icon={ClipboardCheck} tone="verified" />
        </section>
      )}

      {rows.length > 0 && (
        <SectionCard title="Route" description="Event types in the order they happened">
          <JourneyRoute
            items={[...rows]
              .sort((a, b) => a.start_date.localeCompare(b.start_date))
              .map((a) => ({
                id: a.id, event_name: a.event_name, category_name: a.category_name, category_slug: a.category_slug,
                start_date: a.start_date, end_date: a.end_date, organization: a.organization, result: a.result, status: a.status,
              }))}
          />
        </SectionCard>
      )}

      <div>
        <Tabs
          label="Student history"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'achievements', label: 'Achievements', count: achievements.data?.total },
            { id: 'od', label: 'OD requests', count: ods.data?.total },
          ]}
        />
        <div className="mt-4">
          {tab === 'achievements' ? (
            achievements.error ? (
              <ErrorState message={achievements.error} onRetry={achievements.reload} />
            ) : achievements.loading && !achievements.data ? (
              <SkeletonRows rows={4} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Award} title="No submitted achievements" description="Nothing has been submitted for verification yet." />
            ) : (
              <ul className="space-y-3">
                {rows.map((a) => {
                  const Icon = categoryIcon(a.category_slug)
                  return (
                    <li key={a.id}>
                      <Link to={paths.achievement(viewer.role, a.id)} className="card flex items-start gap-4 p-4 transition-colors hover:border-ink-300">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-ink-900 text-gold-400">
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-semibold uppercase tracking-wider text-gold-600">
                            {a.category_name} · {formatDateRange(a.start_date, a.end_date)}
                          </span>
                          <span className="block break-words font-display text-lg font-semibold leading-snug">{a.event_name}</span>
                          <span className="block text-sm text-ink-500">{[a.result, a.organization].filter(Boolean).join(' · ') || 'Participation'}</span>
                        </span>
                        <span className="flex flex-col items-end gap-1.5">
                          <AchievementStatusBadge status={a.status} />
                          {a.od_status && <OdStatusBadge status={a.od_status} />}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )
          ) : ods.error ? (
            <ErrorState message={ods.error} onRetry={ods.reload} />
          ) : ods.loading && !ods.data ? (
            <SkeletonRows rows={3} />
          ) : (ods.data?.rows.length ?? 0) === 0 ? (
            <EmptyState icon={ClipboardList} title="No OD requests" description="This student hasn’t requested on-duty yet." />
          ) : (
            <ul className="space-y-3">
              {ods.data!.rows.map((o) => (
                <li key={o.id}>
                  <Link to={paths.od(viewer.role, o.id)} className="card flex flex-wrap items-start justify-between gap-3 p-4 hover:border-ink-300">
                    <span className="min-w-0">
                      <span className="block break-words font-display text-lg font-semibold leading-snug">{o.event_name}</span>
                      <span className="block text-sm text-ink-500">
                        {formatDateRange(o.event_date, o.event_end_date)} · {o.venue}
                      </span>
                    </span>
                    <OdStatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
