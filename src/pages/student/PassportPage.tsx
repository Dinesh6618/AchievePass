import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, CheckCircle2, ClipboardCheck, ClipboardList, Clock, Layers, Plus, Route } from 'lucide-react'
import { VerifiedStamp } from '@/components/brand/VerifiedStamp'
import { notificationMeta } from '@/components/notifications/notificationMeta'
import { ActivityHeatmap } from '@/components/passport/ActivityHeatmap'
import { AchievementWallet } from '@/components/passport/AchievementWallet'
import { JourneyRoute, JourneyTimeline, type TimelineItem } from '@/components/passport/JourneyTimeline'
import {
  EmptyState,
  ErrorState,
  FilterSelect,
  LinkButton,
  SectionCard,
  Skeleton,
  SkeletonCards,
  StatCard,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCategories } from '@/hooks/useReference'
import { parseISODate, relativeTime } from '@/lib/dates'
import { yearsWithData } from '@/lib/analytics'
import { listMyAchievements } from '@/services/achievementService'
import { listNotifications } from '@/services/notificationService'
import { listMyOds } from '@/services/odService'

export default function PassportPage() {
  useDocumentTitle('My Passport')
  const profile = useProfile()
  const achievements = useAsync(() => listMyAchievements(profile.id), [profile.id], { context: 'passport achievements' })
  const ods = useAsync(() => listMyOds(profile.id), [profile.id], { context: 'passport ods' })
  const categories = useCategories()
  const activity = useAsync(() => listNotifications({ pageSize: 6 }), [], { context: 'recent activity' })
  const [year, setYear] = useState(new Date().getFullYear())

  const list = achievements.data
  const submitted = useMemo(() => (list ?? []).filter((a) => a.status !== 'draft'), [list])
  const years = useMemo(() => yearsWithData((list ?? []).map((a) => a.start_date)), [list])

  const timelineItems: TimelineItem[] = useMemo(
    () =>
      (list ?? [])
        .filter((a) => parseISODate(a.start_date).getFullYear() === year)
        .map((a) => ({
          id: a.id,
          event_name: a.event_name,
          category_name: a.category.name,
          category_slug: a.category.slug,
          start_date: a.start_date,
          end_date: a.end_date,
          organization: a.organization,
          result: a.result,
          status: a.status,
        })),
    [list, year],
  )

  const stats = useMemo(() => {
    const verified = submitted.filter((a) => a.status === 'verified').length
    const pending = submitted.filter((a) => a.status === 'pending').length
    const odList = ods.data ?? []
    return {
      total: submitted.length,
      verified,
      pending,
      od: odList.length,
      approvedOd: odList.filter((o) => o.status === 'approved').length,
      categories: new Set(submitted.map((a) => a.category_id)).size,
    }
  }, [submitted, ods.data])

  const loadError = achievements.error ?? ods.error
  const loading = achievements.loading && !list
  const isEmpty = list !== undefined && list.length === 0

  return (
    <div className="space-y-8">
      {/* Passport cover */}
      <section aria-labelledby="journey-heading" className="relative overflow-hidden rounded-xl bg-ink-900 text-white">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full border border-gold-500/20" />
        <div aria-hidden className="pointer-events-none absolute -right-4 -top-4 size-40 rounded-full border border-gold-500/20" />
        <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-400">My achievement journey</p>
            <h1 id="journey-heading" className="mt-2 break-words font-display text-3xl font-semibold text-white sm:text-4xl">
              {profile.full_name}
            </h1>
            <p className="mt-2 text-sm text-ink-200">
              <span className="font-mono tracking-wider">{profile.register_number}</span>
              {profile.department && <> · {profile.department.name}</>}
              {profile.year && <> · Year {profile.year}</>}
              {profile.section && <> · Section {profile.section}</>}
            </p>
            <LinkButton to="/student/achievements/new" variant="gold" className="mt-5" icon={<Plus className="size-4" aria-hidden />}>
              Add Achievement
            </LinkButton>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-display text-5xl font-semibold tabular-nums text-white">{stats.verified}</p>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-300">Verified stamps</p>
            </div>
            <VerifiedStamp className="hidden size-20 text-gold-400 sm:block" label="CERTIPASS" />
          </div>
        </div>
      </section>

      {loadError && <ErrorState message={loadError} onRetry={() => { achievements.reload(); ods.reload() }} />}

      {/* Stats */}
      {loading ? (
        <SkeletonCards count={6} className="sm:grid-cols-3 xl:grid-cols-6" />
      ) : (
        <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Achievements" value={stats.total} icon={Award} to="/student/achievements" />
          <StatCard label="Verified" value={stats.verified} icon={CheckCircle2} tone="verified" to="/student/achievements" />
          <StatCard label="Pending" value={stats.pending} icon={Clock} tone="pending" />
          <StatCard label="OD requests" value={stats.od} icon={ClipboardList} tone="info" to="/student/od" />
          <StatCard label="Approved ODs" value={stats.approvedOd} icon={ClipboardCheck} tone="verified" to="/student/od" />
          <StatCard label="Categories" value={stats.categories} icon={Layers} tone="gold" />
        </section>
      )}

      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : isEmpty ? (
        <EmptyState
          icon={Route}
          title="No achievements yet."
          description="Your achievement journey starts here. Upload your first certificate and we'll read the details for you."
          action={
            <LinkButton to="/student/achievements/new" icon={<Plus className="size-4" aria-hidden />}>
              Add Achievement
            </LinkButton>
          }
        />
      ) : (
        list && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <SectionCard
                title={<span className="font-display text-xl">{year} journey</span>}
                description="Your milestones, in the order they happened."
                action={
                  <FilterSelect aria-label="Journey year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </FilterSelect>
                }
              >
                {timelineItems.length === 0 ? (
                  <EmptyState title={`Nothing recorded in ${year}`} description="Pick another year, or add something you did this year." className="border-0 py-8" />
                ) : (
                  <div className="space-y-6">
                    <JourneyRoute items={[...timelineItems].sort((a, b) => a.start_date.localeCompare(b.start_date))} />
                    <JourneyTimeline items={timelineItems} hrefFor={(item) => `/student/achievements/${item.id}`} />
                  </div>
                )}
              </SectionCard>

              <div className="space-y-6">
                <SectionCard title="Achievement wallet" description="By category">
                  <AchievementWallet
                    categories={categories.data ?? []}
                    achievements={list}
                    columns="grid-cols-2"
                    hrefFor={(c) => `/student/achievements?category=${c.id}`}
                  />
                </SectionCard>

                <SectionCard
                  title="Recent activity"
                  action={
                    <Link to="/student/notifications" className="text-sm font-medium text-ink-600 hover:text-ink-900">
                      See all
                    </Link>
                  }
                >
                  {activity.loading && !activity.data ? (
                    <div className="space-y-3" role="status" aria-label="Loading activity">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : activity.data && activity.data.rows.length > 0 ? (
                    <ul className="space-y-4">
                      {activity.data.rows.map((n) => {
                        const meta = notificationMeta(n.type)
                        const body = (
                          <>
                            <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${meta.tone}`}>
                              <meta.icon className="size-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                              <span className="block truncate text-xs text-ink-500">{n.message}</span>
                              <span className="block text-xs text-ink-400">{relativeTime(n.created_at)}</span>
                            </span>
                          </>
                        )
                        return (
                          <li key={n.id}>
                            {n.link ? (
                              <Link to={n.link} className="flex items-start gap-3 rounded-md hover:bg-paper-100">
                                {body}
                              </Link>
                            ) : (
                              <div className="flex items-start gap-3">{body}</div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-500">Updates about your submissions will appear here.</p>
                  )}
                </SectionCard>
              </div>
            </div>

            <SectionCard title="Participation heatmap" description="Every day you took part in something.">
              <ActivityHeatmap events={submitted} year={year} />
            </SectionCard>
          </>
        )
      )}
    </div>
  )
}
