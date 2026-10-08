import { useState } from 'react'
import { Download, FileBarChart, Play } from 'lucide-react'
import {
  Alert,
  Button,
  EmptyState,
  FilterInput,
  FilterSelect,
  PageHeader,
  SectionCard,
  SkeletonRows,
  TableWrap,
  Td,
  Th,
  useToast,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useDepartments } from '@/hooks/useReference'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { downloadCSV } from '@/lib/csv'
import { todayISO } from '@/lib/dates'
import { reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { REPORTS, type ReportResult, type ReportType } from '@/services/reportBuilders'
import { generateReport, reportToCSV } from '@/services/reportService'

const PREVIEW_ROWS = 50

export default function ReportsPage() {
  useDocumentTitle('Reports')
  const profile = useProfile()
  const toast = useToast()
  const departments = useDepartments()
  const [type, setType] = useState<ReportType>('student-participation')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ type: ReportType; data: ReportResult; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const meta = REPORTS.find((r) => r.id === type)!
  const isAdmin = profile.role === 'admin'

  const run = async () => {
    if (from && to && to < from) {
      setError('The end date can’t be before the start date.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const data = await generateReport(type, { from: from || undefined, to: to || undefined, departmentId: departmentId || undefined })
      const range = from || to ? `${from || 'start'} to ${to || 'today'}` : 'all dates'
      setResult({ type, data, label: `${meta.title} · ${range}` })
    } catch (err) {
      setResult(null)
      setError(reportError(err, 'generate report', "We couldn't build this report. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    if (!result) return
    downloadCSV(`certipass-${result.type}-${todayISO()}.csv`, reportToCSV(result.data))
    toast.success(`Downloaded ${result.data.rows.length} rows.`)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Generate a report"
        subtitle={isAdmin ? 'Covers every department.' : 'Covers students in your department.'}
      />

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-6">
          <SectionCard title="Report type" bodyClassName="p-2">
            <ul role="radiogroup" aria-label="Report type" className="space-y-1">
              {REPORTS.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={type === r.id}
                    onClick={() => setType(r.id)}
                    className={cn(
                      'w-full rounded-md px-3 py-2.5 text-left transition-colors',
                      type === r.id ? 'bg-ink-900 text-white' : 'hover:bg-paper-100',
                    )}
                  >
                    <span className="block text-sm font-semibold">{r.title}</span>
                    <span className={cn('block text-xs', type === r.id ? 'text-ink-200' : 'text-ink-500')}>{r.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Filters">
            <div className="space-y-4">
              <label className="block text-sm font-medium text-ink-800">
                From
                <FilterInput type="date" className="mt-1.5 w-full" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="block text-sm font-medium text-ink-800">
                To
                <FilterInput type="date" className="mt-1.5 w-full" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
              {isAdmin && (
                <label className="block text-sm font-medium text-ink-800">
                  Department
                  <FilterSelect className="mt-1.5 w-full" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">All departments</option>
                    {departments.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </FilterSelect>
                </label>
              )}
              <Button className="w-full" onClick={run} loading={busy} icon={<Play className="size-4" aria-hidden />}>
                Generate report
              </Button>
            </div>
          </SectionCard>
        </div>

        <div className="min-w-0">
          {error && <Alert tone="error" className="mb-4">{error}</Alert>}

          {busy ? (
            <SkeletonRows rows={6} />
          ) : !result ? (
            <EmptyState
              icon={FileBarChart}
              title="Pick a report and generate it"
              description="You’ll get a preview here and can download the full result as CSV."
            />
          ) : result.data.rows.length === 0 ? (
            <EmptyState title="No data for these filters" description="Try a wider date range." />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{REPORTS.find((r) => r.id === result.type)?.title}</h2>
                  <p className="text-sm text-ink-500">
                    {result.label} · {result.data.rows.length} {result.data.rows.length === 1 ? 'row' : 'rows'}
                  </p>
                </div>
                <Button onClick={download} icon={<Download className="size-4" aria-hidden />}>
                  Download CSV
                </Button>
              </div>
              <TableWrap>
                <thead>
                  <tr>
                    {result.data.headers.map((h) => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <Td key={j} className={typeof cell === 'number' ? 'tabular-nums' : undefined}>
                          {cell === '' ? '—' : cell}
                        </Td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              {result.data.rows.length > PREVIEW_ROWS && (
                <p className="text-sm text-ink-500">
                  Showing the first {PREVIEW_ROWS} rows. The CSV contains all {result.data.rows.length}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
