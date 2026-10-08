import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, SearchX } from 'lucide-react'
import {
  Avatar,
  EmptyState,
  ErrorState,
  FilterInput,
  FilterSelect,
  PageHeader,
  Pagination,
  SkeletonRows,
  TableWrap,
  Td,
  Th,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { listStudents } from '@/services/profileService'

const PAGE_SIZE = 20

/** Faculty directory of students in their department, with participation counts. */
export default function StudentDirectoryPage() {
  useDocumentTitle('Students')
  const profile = useProfile()
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [page, setPage] = useState(0)
  const search = useDebouncedValue(q, 300)

  const result = useAsync(
    () => listStudents({ search, year: year ? Number(year) : null, page, pageSize: PAGE_SIZE }),
    [search, year, page],
    { context: 'student directory' },
  )
  const rows = result.data?.rows ?? []

  return (
    <div>
      <PageHeader
        eyebrow={profile.department?.name ?? 'Faculty'}
        title="Students"
        subtitle={result.data ? `${result.data.total} ${result.data.total === 1 ? 'student' : 'students'} in your department` : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2" role="search" aria-label="Find students">
        <FilterInput
          type="search"
          aria-label="Search students"
          placeholder="Search by name, register number or username…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
          className="w-full sm:w-80"
        />
        <FilterSelect
          aria-label="Filter by year"
          value={year}
          onChange={(e) => {
            setYear(e.target.value)
            setPage(0)
          }}
        >
          <option value="">All years</option>
          {[1, 2, 3, 4].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </FilterSelect>
      </div>

      {result.error ? (
        <ErrorState message={result.error} onRetry={result.reload} />
      ) : result.loading && !result.data ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        search || year ? (
          <EmptyState icon={SearchX} title="No students match" description="Try a different name, register number or year." />
        ) : (
          <EmptyState icon={GraduationCap} title="No students yet" description="Students in your department appear here once they register." />
        )
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Year / Section</Th>
                <Th className="text-right">Achievements</Th>
                <Th className="text-right">Verified</Th>
                <Th className="text-right">Pending</Th>
                <Th className="text-right">OD (approved / total)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-paper/60">
                  <Td>
                    <Link to={`/${profile.role}/students/${s.id}`} className="flex items-center gap-3">
                      <Avatar name={s.full_name} src={s.avatar_url} size="sm" />
                      <span>
                        <span className="block font-medium underline-offset-2 hover:underline">{s.full_name}</span>
                        <span className="block font-mono text-xs text-ink-500">{s.register_number}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    {s.year ? `Year ${s.year}` : '—'}
                    {s.section ? ` · ${s.section}` : ''}
                  </Td>
                  <Td className="text-right tabular-nums">{s.total_achievements}</Td>
                  <Td className="text-right tabular-nums text-verified-700">{s.verified_achievements}</Td>
                  <Td className="text-right tabular-nums text-pending-700">{s.pending_achievements}</Td>
                  <Td className="text-right tabular-nums">
                    {s.approved_ods} / {s.total_ods}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onChange={setPage} />
        </>
      )}
    </div>
  )
}
