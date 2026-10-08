import { Link, useSearchParams } from 'react-router-dom'
import { Award, GraduationCap, SearchX } from 'lucide-react'
import {
  AchievementStatusBadge,
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  FilterInput,
  FilterSelect,
  OdStatusBadge,
  PageHeader,
  Pagination,
  SectionCard,
  SkeletonRows,
  TableWrap,
  Td,
  Th,
  ACHIEVEMENT_STATUS,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCategories, useDepartments } from '@/hooks/useReference'
import { formatDateRange } from '@/lib/dates'
import { paths } from '@/routes/paths'
import { listStudents } from '@/services/profileService'
import { searchAchievements } from '@/services/searchService'
import type { AchievementStatus } from '@/types'

const PAGE_SIZE = 20

/**
 * Staff view of every achievement they can see, with smart search and filters.
 * `globalSearch` is what the top-bar search box lands on: it also lists matching students.
 */
export default function AchievementsExplorerPage({ globalSearch = false }: { globalSearch?: boolean }) {
  useDocumentTitle(globalSearch ? 'Search' : 'Achievements')
  const profile = useProfile()
  const isAdmin = profile.role === 'admin'
  const [params, setParams] = useSearchParams()
  const categories = useCategories()
  const departments = useDepartments()

  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? '') as AchievementStatus | ''
  const categoryId = params.get('category') ?? ''
  const departmentId = params.get('department') ?? ''
  const year = params.get('year') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Number(params.get('page') ?? 0) || 0
  const search = useDebouncedValue(q, 300)

  const update = (patch: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!keepPage) next.delete('page')
    setParams(next, { replace: true })
  }

  const result = useAsync(
    () =>
      searchAchievements({
        q: search,
        status,
        categoryId: categoryId || undefined,
        departmentId: departmentId || undefined,
        year: year ? Number(year) : null,
        from: from || undefined,
        to: to || undefined,
        excludeDrafts: true,
        page,
        pageSize: PAGE_SIZE,
      }),
    [search, status, categoryId, departmentId, year, from, to, page],
    { context: 'achievements explorer' },
  )

  const students = useAsync(() => listStudents({ search, pageSize: 5 }), [search], {
    enabled: globalSearch && search.trim().length >= 2,
    context: 'global student search',
  })

  const rows = result.data?.rows ?? []
  const filtered = Boolean(q || status || categoryId || departmentId || year || from || to)

  return (
    <div>
      <PageHeader
        eyebrow={isAdmin ? 'Administration' : (profile.department?.name ?? 'Faculty')}
        title={globalSearch ? 'Search' : 'Achievements'}
        subtitle={
          result.data ? `${result.data.total} ${result.data.total === 1 ? 'result' : 'results'}` : 'Search by student, register number, event, organization or result.'
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="search" aria-label="Search and filter achievements">
        <FilterInput
          type="search"
          aria-label="Search achievements"
          placeholder="Student, register no., event, organization…"
          value={q}
          onChange={(e) => update({ q: e.target.value })}
          className="w-full sm:w-80"
          autoFocus={globalSearch}
        />
        <FilterSelect aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All statuses</option>
          {(Object.keys(ACHIEVEMENT_STATUS) as AchievementStatus[]).filter((s) => s !== 'draft').map((s) => (
            <option key={s} value={s}>
              {ACHIEVEMENT_STATUS[s].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect aria-label="Category" value={categoryId} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        {isAdmin && (
          <FilterSelect aria-label="Department" value={departmentId} onChange={(e) => update({ department: e.target.value })}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect aria-label="Student year" value={year} onChange={(e) => update({ year: e.target.value })}>
          <option value="">All years</option>
          {[1, 2, 3, 4].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </FilterSelect>
        <label className="flex items-center gap-1.5 text-sm text-ink-600">
          <span className="sr-only sm:not-sr-only">From</span>
          <FilterInput type="date" aria-label="Events from date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-600">
          <span className="sr-only sm:not-sr-only">To</span>
          <FilterInput type="date" aria-label="Events up to date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </label>
        {filtered && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => setParams({}, { replace: true })}>
            Clear all
          </Button>
        )}
      </div>

      {globalSearch && students.data && students.data.rows.length > 0 && (
        <SectionCard title="Students" className="mb-6" bodyClassName="p-2">
          <ul>
            {students.data.rows.map((s) => (
              <li key={s.id}>
                <Link to={paths.student(profile.role, s.id)} className="flex items-center gap-3 rounded-md p-2.5 hover:bg-paper-100">
                  <Avatar name={s.full_name} src={s.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{s.full_name}</span>
                    <span className="block font-mono text-xs text-ink-500">
                      {s.register_number} · {s.department_code}
                    </span>
                  </span>
                  <GraduationCap className="size-4 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {result.error ? (
        <ErrorState message={result.error} onRetry={result.reload} />
      ) : result.loading && !result.data ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="Nothing matches those filters"
            description="Try a broader search or clear a filter."
            action={<Button variant="secondary" onClick={() => setParams({}, { replace: true })}>Clear all filters</Button>}
          />
        ) : (
          <EmptyState icon={Award} title="No achievements yet" description="Submitted achievements will appear here." />
        )
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Event</Th>
                <Th>Type</Th>
                <Th>Date</Th>
                {isAdmin && <Th>Department</Th>}
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-paper/60">
                  <Td>
                    <Link to={paths.student(profile.role, a.student_id)} className="font-medium underline-offset-2 hover:underline">
                      {a.student_name}
                    </Link>
                    <p className="font-mono text-xs text-ink-500">{a.register_number}</p>
                  </Td>
                  <Td>
                    <Link to={paths.achievement(profile.role, a.id)} className="font-medium underline-offset-2 hover:underline">
                      {a.event_name}
                    </Link>
                    <p className="text-xs text-ink-500">{[a.result, a.organization].filter(Boolean).join(' · ')}</p>
                  </Td>
                  <Td>{a.category_name}</Td>
                  <Td className="whitespace-nowrap">{formatDateRange(a.start_date, a.end_date)}</Td>
                  {isAdmin && <Td>{a.department_code ?? '—'}</Td>}
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <AchievementStatusBadge status={a.status} />
                      {a.od_status && <OdStatusBadge status={a.od_status} />}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onChange={(p) => update({ page: p ? String(p) : '' }, true)} />
        </>
      )}
    </div>
  )
}
