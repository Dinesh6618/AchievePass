import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Inbox } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  FilterInput,
  FilterSelect,
  OD_STATUS,
  OdStatusBadge,
  PageHeader,
  Pagination,
  SkeletonRows,
  TableWrap,
  Td,
  Th,
  Tabs,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDepartments } from '@/hooks/useReference'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateRange } from '@/lib/dates'
import { searchOds } from '@/services/searchService'
import type { OdStatus } from '@/types'

type Tab = 'all' | OdStatus
const PAGE_SIZE = 15

/** OD requests for faculty (their department) and admins (everyone). */
export default function OdQueuePage() {
  const profile = useProfile()
  const isAdmin = profile.role === 'admin'
  useDocumentTitle(isAdmin ? 'OD management' : 'OD requests')
  const departments = useDepartments()

  const [tab, setTab] = useState<Tab>(isAdmin ? 'all' : 'pending')
  const [q, setQ] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [page, setPage] = useState(0)
  const search = useDebouncedValue(q, 300)

  const result = useAsync(
    () =>
      searchOds({
        q: search,
        status: tab === 'all' ? '' : tab,
        departmentId: departmentId || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [search, tab, departmentId, page],
    { context: 'od queue page' },
  )

  const reset = () => setPage(0)
  const rows = result.data?.rows ?? []

  return (
    <div>
      <PageHeader
        eyebrow={isAdmin ? 'Administration' : (profile.department?.name ?? 'Faculty')}
        title={isAdmin ? 'OD management' : 'OD requests'}
        subtitle={isAdmin ? 'Every on-duty request across departments (read-only).' : 'Review and decide on-duty requests from your students.'}
      />

      <Tabs
        label="OD status"
        value={tab}
        onChange={(t) => {
          setTab(t)
          reset()
        }}
        tabs={[
          { id: 'all', label: 'All' },
          ...(['pending', 'more_info', 'approved', 'rejected'] as OdStatus[]).map((s) => ({ id: s, label: OD_STATUS[s].label })),
        ]}
      />

      <div className="mt-4 flex flex-wrap gap-2" role="search" aria-label="Filter OD requests">
        <FilterInput
          type="search"
          aria-label="Search OD requests"
          placeholder="Search student, register no., event, venue…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            reset()
          }}
          className="w-full sm:w-80"
        />
        {isAdmin && (
          <FilterSelect
            aria-label="Filter by department"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value)
              reset()
            }}
          >
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </FilterSelect>
        )}
      </div>

      <div className="mt-4">
        {result.error ? (
          <ErrorState message={result.error} onRetry={result.reload} />
        ) : result.loading && !result.data ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          search || tab !== 'all' || departmentId ? (
            <EmptyState icon={Inbox} title="No OD requests match" description="Try a different filter or search." />
          ) : (
            <EmptyState icon={ClipboardList} title="No OD requests yet" description="Requests will appear here as students submit them." />
          )
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Event</Th>
                  <Th>Date</Th>
                  <Th>Venue</Th>
                  {isAdmin && <Th>Department</Th>}
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="hover:bg-paper/60">
                    <Td>
                      <p className="font-medium">{o.student_name}</p>
                      <p className="font-mono text-xs text-ink-500">{o.register_number}</p>
                    </Td>
                    <Td>
                      <Link to={`/${profile.role}/od/${o.id}`} className="font-medium underline-offset-2 hover:underline">
                        {o.event_name}
                      </Link>
                      <p className="text-xs text-ink-500">{o.category_name}</p>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDateRange(o.event_date, o.event_end_date)}</Td>
                    <Td>{o.venue}</Td>
                    {isAdmin && <Td>{o.department_name ?? '—'}</Td>}
                    <Td>
                      <OdStatusBadge status={o.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
