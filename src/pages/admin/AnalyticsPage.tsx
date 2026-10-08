import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, MessageSquareMore, XCircle } from 'lucide-react'
import { ChartCard, ShareBar } from '@/components/charts/ChartParts'
import { HBarChart, MonthArea, MonthColumns } from '@/components/charts/charts'
import { CHART } from '@/components/charts/theme'
import { ErrorState, FilterSelect, PageHeader, Skeleton } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useDepartments } from '@/hooks/useReference'
import {
  achievementsByMonth,
  categoryByMonth,
  countByCategory,
  odByMonth,
  participationByDepartment,
  verificationBreakdown,
  yearsWithData,
} from '@/lib/analytics'
import { parseISODate } from '@/lib/dates'
import { loadAnalyticsData } from '@/services/analyticsService'

const STATUS_STYLE: Record<string, { color: string; icon: typeof Clock }> = {
  Verified: { color: CHART.verified, icon: CheckCircle2 },
  Pending: { color: CHART.pending, icon: Clock },
  'Changes requested': { color: CHART.info, icon: MessageSquareMore },
  Rejected: { color: CHART.rejected, icon: XCircle },
}

export default function AnalyticsPage() {
  useDocumentTitle('Analytics')
  const departments = useDepartments()
  const [year, setYear] = useState(new Date().getFullYear())
  const [departmentId, setDepartmentId] = useState('')

  const data = useAsync(() => loadAnalyticsData(departmentId || undefined), [departmentId], { context: 'analytics' })
  const raw = data.data
  const stale = data.loading && Boolean(raw) // keep the previous frame while refetching

  const years = useMemo(
    () => yearsWithData([...(raw?.achievements ?? []).map((a) => a.start_date), ...(raw?.ods ?? []).map((o) => o.event_date)]),
    [raw],
  )

  const view = useMemo(() => {
    if (!raw) return null
    const a = raw.achievements.filter((r) => parseISODate(r.start_date).getFullYear() === year)
    const o = raw.ods.filter((r) => parseISODate(r.event_date).getFullYear() === year)
    return {
      category: countByCategory(a),
      months: achievementsByMonth(a, year),
      hackathon: categoryByMonth(a, 'hackathon', year),
      workshop: categoryByMonth(a, 'workshop', year),
      departments: participationByDepartment(a),
      ods: odByMonth(o, year),
      verification: verificationBreakdown(a),
      total: a.length,
    }
  }, [raw, year])

  const monthTable = (points: { month: string; [k: string]: number | string }[], keys: string[]) => ({
    headers: ['Month', ...keys],
    rows: points.map((p) => [p.month, ...keys.map((k) => p[k] as number)]),
  })
  const hasAny = (points: { [k: string]: number | string }[], keys: string[]) => points.some((p) => keys.some((k) => (p[k] as number) > 0))

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Analytics" subtitle="Participation, verification and on-duty trends across the college." />

      {/* One filter row above everything it scopes */}
      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Analytics filters">
        <FilterSelect aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect aria-label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </FilterSelect>
        {view && <span className="text-sm text-ink-500">{view.total} submitted achievements in {year}</span>}
      </div>

      {data.error ? (
        <ErrorState message={data.error} onRetry={data.reload} />
      ) : !view ? (
        <div className="grid gap-6 lg:grid-cols-2" role="status" aria-label="Loading charts">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Achievements by category"
            subtitle={`Submitted achievements in ${year}, most popular first`}
            stale={stale}
            table={{ headers: ['Category', 'Achievements'], rows: view.category.map((c) => [c.name, c.value]) }}
          >
            <HBarChart
              ariaLabel={`Achievements by category in ${year}`}
              data={view.category.map((c) => ({ name: c.name, count: c.value }))}
              series={[{ key: 'count', label: 'Achievements', color: CHART.primary }]}
            />
          </ChartCard>

          <ChartCard
            title="Achievements by month"
            subtitle={`When events took place in ${year}`}
            stale={stale}
            legend={[
              { label: 'Verified', color: CHART.verified, icon: CheckCircle2 },
              { label: 'Other submitted', color: CHART.neutral },
            ]}
            table={monthTable(view.months, ['Verified', 'Other submitted'])}
          >
            {hasAny(view.months, ['Verified', 'Other submitted']) ? (
              <MonthColumns
                ariaLabel={`Achievements by month in ${year}`}
                data={view.months}
                series={[
                  { key: 'Verified', label: 'Verified', color: CHART.verified },
                  { key: 'Other submitted', label: 'Other submitted', color: CHART.neutral },
                ]}
              />
            ) : (
              <p className="py-12 text-center text-sm text-ink-500">No achievements recorded in {year}.</p>
            )}
          </ChartCard>

          <ChartCard
            title="Hackathon participation"
            subtitle={`Students taking part in hackathons each month of ${year}`}
            stale={stale}
            table={monthTable(view.hackathon, ['Participants'])}
          >
            {hasAny(view.hackathon, ['Participants']) ? (
              <MonthArea ariaLabel={`Hackathon participation by month in ${year}`} data={view.hackathon} series={[{ key: 'Participants', label: 'Hackathon participants', color: CHART.primary }]} />
            ) : (
              <p className="py-12 text-center text-sm text-ink-500">No hackathon participation recorded in {year}.</p>
            )}
          </ChartCard>

          <ChartCard
            title="Workshop participation"
            subtitle={`Students attending workshops each month of ${year}`}
            stale={stale}
            table={monthTable(view.workshop, ['Participants'])}
          >
            {hasAny(view.workshop, ['Participants']) ? (
              <MonthArea ariaLabel={`Workshop participation by month in ${year}`} data={view.workshop} series={[{ key: 'Participants', label: 'Workshop participants', color: CHART.primary }]} />
            ) : (
              <p className="py-12 text-center text-sm text-ink-500">No workshop participation recorded in {year}.</p>
            )}
          </ChartCard>

          <ChartCard
            title="Department participation"
            subtitle="Submitted vs. verified achievements per department"
            stale={stale}
            legend={[
              { label: 'Submitted', color: CHART.neutral },
              { label: 'Verified', color: CHART.verified, icon: CheckCircle2 },
            ]}
            table={{
              headers: ['Department', 'Students', 'Submitted', 'Verified'],
              rows: view.departments.map((d) => [d.name, d.students, d.achievements, d.verified]),
            }}
          >
            <HBarChart
              ariaLabel={`Department participation in ${year}`}
              data={view.departments.map((d) => ({ name: d.name, achievements: d.achievements, verified: d.verified }))}
              series={[
                { key: 'achievements', label: 'Submitted', color: CHART.neutral },
                { key: 'verified', label: 'Verified', color: CHART.verified },
              ]}
            />
          </ChartCard>

          <ChartCard
            title="OD requests over time"
            subtitle={`OD requests by event month in ${year}, split by outcome`}
            stale={stale}
            legend={[
              { label: 'Approved', color: CHART.verified, icon: CheckCircle2 },
              { label: 'Pending / info', color: CHART.pending, icon: Clock },
              { label: 'Rejected', color: CHART.rejected, icon: XCircle },
            ]}
            table={monthTable(view.ods, ['Approved', 'Pending / info', 'Rejected'])}
          >
            {hasAny(view.ods, ['Approved', 'Pending / info', 'Rejected']) ? (
              <MonthColumns
                ariaLabel={`OD requests by month in ${year}`}
                data={view.ods}
                series={[
                  { key: 'Approved', label: 'Approved', color: CHART.verified },
                  { key: 'Pending / info', label: 'Pending / info', color: CHART.pending },
                  { key: 'Rejected', label: 'Rejected', color: CHART.rejected },
                ]}
              />
            ) : (
              <p className="py-12 text-center text-sm text-ink-500">No OD requests in {year}.</p>
            )}
          </ChartCard>

          <ChartCard
            title="Verification statistics"
            subtitle={`Where ${year}'s submitted achievements stand`}
            stale={stale}
            className="lg:col-span-2"
            table={{ headers: ['Status', 'Achievements'], rows: view.verification.map((v) => [v.name, v.value]) }}
          >
            <ShareBar
              ariaLabel={`Verification outcome of ${year} achievements`}
              items={view.verification.map((v) => ({
                label: v.name === 'Pending' ? 'Pending verification' : v.name,
                value: v.value,
                color: STATUS_STYLE[v.name]?.color ?? CHART.neutral,
                icon: STATUS_STYLE[v.name]?.icon,
              }))}
            />
          </ChartCard>
        </div>
      )}
    </div>
  )
}
