import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Award, Plus, Printer, SearchX } from 'lucide-react'
import { AchievementCard } from '@/components/passport/AchievementCard'
import { JourneyTimeline } from '@/components/passport/JourneyTimeline'
import { VerifiedRecordCard } from '@/components/passport/VerifiedRecordCard'
import {
  Button,
  EmptyState,
  ErrorState,
  FilterInput,
  FilterSelect,
  LinkButton,
  PageHeader,
  SectionCard,
  SkeletonRows,
  Tabs,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCategories, usePublicSettings } from '@/hooks/useReference'
import { ACHIEVEMENT_STATUS } from '@/components/ui/StatusBadge'
import { normalizeText } from '@/lib/similarity'
import { pluralize } from '@/lib/utils'
import { listMyAchievements } from '@/services/achievementService'
import type { Achievement, AchievementStatus } from '@/types'

type Tab = 'all' | 'passport'

export default function AchievementsPage() {
  useDocumentTitle('Achievements')
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'passport' ? 'passport' : 'all'
  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? '') as AchievementStatus | ''
  const categoryId = params.get('category') ?? ''

  const achievements = useAsync(() => listMyAchievements(profile.id), [profile.id], { context: 'achievements list' })
  const categories = useCategories()
  const settings = usePublicSettings()

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const all = achievements.data
  const filtered = useMemo(() => {
    const needle = normalizeText(q)
    return (all ?? []).filter((a) => {
      if (status && a.status !== status) return false
      if (categoryId && a.category_id !== categoryId) return false
      if (needle) {
        const haystack = normalizeText([a.event_name, a.organization, a.result, a.category.name].filter(Boolean).join(' '))
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [all, q, status, categoryId])

  const verified = useMemo(
    () => (all ?? []).filter((a): a is Achievement & { verification_code: string } => a.status === 'verified' && Boolean(a.verification_code)),
    [all],
  )
  const verifiedByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of verified) counts.set(a.category.name, (counts.get(a.category.name) ?? 0) + 1)
    return [...counts].sort((x, y) => y[1] - x[1])
  }, [verified])

  const hasFilters = Boolean(q || status || categoryId)

  return (
    <div>
      <PageHeader
        eyebrow="Your record"
        title="Achievements"
        subtitle={all ? `${pluralize(all.filter((a) => a.status !== 'draft').length, 'submitted achievement')} · ${verified.length} verified` : undefined}
        actions={
          <LinkButton to="/student/achievements/new" icon={<Plus className="size-4" aria-hidden />}>
            Add Achievement
          </LinkButton>
        }
      />

      <Tabs
        label="Achievement views"
        value={tab}
        onChange={(t) => update({ tab: t === 'passport' ? 'passport' : '' })}
        tabs={[
          { id: 'all', label: 'All achievements', count: all?.length },
          { id: 'passport', label: 'Digital passport', count: verified.length },
        ]}
      />

      <div className="mt-6">
        {achievements.error ? (
          <ErrorState message={achievements.error} onRetry={achievements.reload} />
        ) : achievements.loading && !all ? (
          <SkeletonRows rows={5} />
        ) : all && all.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No achievements yet."
            description="Your achievement journey starts here."
            action={
              <LinkButton to="/student/achievements/new" icon={<Plus className="size-4" aria-hidden />}>
                Add Achievement
              </LinkButton>
            }
          />
        ) : tab === 'all' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="search" aria-label="Filter achievements">
              <FilterInput
                type="search"
                aria-label="Search achievements"
                placeholder="Search by event, organization, result…"
                value={q}
                onChange={(e) => update({ q: e.target.value })}
                className="w-full sm:w-72"
              />
              <FilterSelect aria-label="Filter by status" value={status} onChange={(e) => update({ status: e.target.value })}>
                <option value="">All statuses</option>
                {(Object.keys(ACHIEVEMENT_STATUS) as AchievementStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {ACHIEVEMENT_STATUS[s].label}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect aria-label="Filter by category" value={categoryId} onChange={(e) => update({ category: e.target.value })}>
                <option value="">All categories</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </FilterSelect>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => update({ q: '', status: '', category: '' })}>
                  Clear filters
                </Button>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No achievements match"
                description="Try a different search or clear the filters."
                action={<Button variant="secondary" onClick={() => update({ q: '', status: '', category: '' })}>Clear filters</Button>}
              />
            ) : (
              <ul className="space-y-3">
                {filtered.map((a) => (
                  <li key={a.id}>
                    <AchievementCard achievement={a} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : verified.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No verified records yet"
            description="Once faculty verify a certificate, it appears here as a QR-backed digital record you can share."
          />
        ) : (
          <div className="space-y-6">
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-500">
                Your verified achievements as a shareable record. Anyone can scan a QR to confirm it.
              </p>
              <Button variant="secondary" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()}>
                Print / save as PDF
              </Button>
            </div>

            <div className="hidden print:block">
              <h1 className="text-2xl font-semibold">{profile.full_name} — Verified achievements</h1>
              <p className="text-sm">{profile.register_number}</p>
            </div>

            <SectionCard title="Verified by category">
              <ul className="space-y-2.5">
                {verifiedByCategory.map(([name, count]) => (
                  <li key={name} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate font-medium">{name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-200" aria-hidden>
                      <span className="block h-full rounded-full bg-gold-500" style={{ width: `${(count / verified.length) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums text-ink-600">{count}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Timeline" className="no-print">
              <JourneyTimeline
                items={verified.map((a) => ({
                  id: a.id,
                  event_name: a.event_name,
                  category_name: a.category.name,
                  category_slug: a.category.slug,
                  start_date: a.start_date,
                  end_date: a.end_date,
                  organization: a.organization,
                  result: a.result,
                  status: a.status,
                }))}
                hrefFor={(item) => `/student/achievements/${item.id}`}
              />
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              {verified.map((a) => (
                <VerifiedRecordCard
                  key={a.id}
                  variant="compact"
                  studentName={profile.full_name}
                  institution={settings.data?.institution_name}
                  record={{
                    event_name: a.event_name,
                    category_name: a.category.name,
                    category_slug: a.category.slug,
                    result: a.result,
                    organization: a.organization,
                    start_date: a.start_date,
                    end_date: a.end_date,
                    verification_code: a.verification_code,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
