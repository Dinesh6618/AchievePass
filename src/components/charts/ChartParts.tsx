import { useId, useState, type ReactNode } from 'react'
import { Table2, BarChart3, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHART } from './theme'

export interface LegendItem {
  label: string
  color: string
  /** 'line' mirrors a line mark; 'rect' mirrors bars/areas */
  kind?: 'rect' | 'line'
  /** status series wear an icon so colour is never the only cue */
  icon?: LucideIcon
  /** shown beside the label (a count) — doubles as the direct label that relieves low-contrast hues */
  value?: ReactNode
}

/** Always shown for ≥ 2 series; swatches mirror the mark, text stays in ink. */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-700', className)} aria-label="Legend">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          {item.kind === 'line' ? (
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: item.color }} />
          ) : (
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: item.color }} />
          )}
          {item.icon && <item.icon className="size-3.5 text-ink-500" aria-hidden />}
          <span>{item.label}</span>
          {item.value !== undefined && <span className="font-semibold tabular-nums text-ink-900">{item.value}</span>}
        </li>
      ))}
    </ul>
  )
}

interface TooltipRow {
  name?: string | number
  value?: string | number | readonly (string | number)[]
  color?: string
  dataKey?: string | number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: readonly TooltipRow[]
  label?: string | number
  /** Add a "Total" row (stacked charts) */
  total?: boolean
  labelFormatter?: (label: string | number) => string
}

/**
 * One tooltip, every series at that position. The value leads (strong), the series name follows
 * (secondary), and rows are keyed with a short stroke of the series colour rather than a box.
 * All text goes through React text nodes, so labels from data can never inject markup.
 */
export function ChartTooltip({ active, payload, label, total, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const rows = payload.filter((r) => r.value !== undefined)
  const sum = rows.reduce((acc, r) => acc + (typeof r.value === 'number' ? r.value : 0), 0)
  return (
    <div
      className="rounded-md border border-paper-200 bg-white px-3 py-2 text-xs shadow-lg"
      style={{ pointerEvents: 'none' }}
    >
      {label !== undefined && (
        <p className="mb-1.5 font-medium text-ink-700">{labelFormatter ? labelFormatter(label) : String(label)}</p>
      )}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={String(r.dataKey ?? r.name)} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
            <span className="font-semibold tabular-nums text-ink-900">{String(r.value)}</span>
            <span className="text-ink-600">{r.name}</span>
          </li>
        ))}
        {total && rows.length > 1 && (
          <li className="flex items-center gap-2 border-t border-paper-100 pt-1">
            <span aria-hidden className="w-3" />
            <span className="font-semibold tabular-nums text-ink-900">{sum}</span>
            <span className="text-ink-600">Total</span>
          </li>
        )}
      </ul>
    </div>
  )
}

export interface ChartTable {
  headers: string[]
  rows: (string | number)[][]
}

interface ChartCardProps {
  title: string
  /** One sentence on what is plotted — it names the single series, so a lone series needs no legend box */
  subtitle?: string
  legend?: LegendItem[]
  table: ChartTable
  /** previous data is still showing while a refetch runs */
  stale?: boolean
  empty?: ReactNode
  children: ReactNode
  className?: string
}

/** Card with title, optional legend, and a table-view twin of the chart (the accessible equivalent). */
export function ChartCard({ title, subtitle, legend, table, stale, empty, children, className }: ChartCardProps) {
  const [asTable, setAsTable] = useState(false)
  const panelId = useId()
  const hasData = table.rows.length > 0

  return (
    <section className={cn('card flex flex-col p-5', className)} aria-labelledby={`${panelId}-title`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${panelId}-title`} className="text-base font-semibold text-ink-900">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {hasData && (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            aria-controls={panelId}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-paper-300 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-paper-100"
          >
            {asTable ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
            {asTable ? 'View chart' : 'View as table'}
          </button>
        )}
      </header>

      {legend && legend.length >= 2 && !asTable && <ChartLegend items={legend} className="mb-3" />}

      <div id={panelId} className={cn('min-w-0 flex-1 transition-opacity', stale && 'opacity-60')}>
        {!hasData ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed border-paper-300 px-4 text-center text-sm text-ink-500">
            {empty ?? 'No data for this selection yet.'}
          </div>
        ) : asTable ? (
          <div className="max-h-80 overflow-auto rounded-md border border-paper-200">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="sticky top-0 bg-paper">
                <tr>
                  {table.headers.map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-paper-100">
                    {row.map((cell, j) => (
                      <td key={j} className={cn('px-3 py-1.5', j > 0 && 'tabular-nums')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

interface ShareBarProps {
  items: { label: string; value: number; color: string; icon?: LucideIcon }[]
  ariaLabel: string
}

/**
 * Part-to-whole as one stacked bar (the recommended form for ≤ 6 parts — a donut hides close values).
 * Segments are separated by a 2px surface gap, and each part is directly labelled with its count and
 * share in the list beneath, so hue is never the only cue.
 */
export function ShareBar({ items, ariaLabel }: ShareBarProps) {
  const total = items.reduce((acc, i) => acc + i.value, 0)
  const [hover, setHover] = useState<string | null>(null)
  if (total === 0) return null
  return (
    <div>
      <div
        role="img"
        aria-label={`${ariaLabel}: ${items.map((i) => `${i.label} ${i.value}`).join(', ')}`}
        className="flex h-5 w-full overflow-hidden rounded-[4px]"
        style={{ gap: 2, background: CHART.surface }}
      >
        {items
          .filter((i) => i.value > 0)
          .map((i) => (
            <div
              key={i.label}
              onPointerEnter={() => setHover(i.label)}
              onPointerLeave={() => setHover(null)}
              title={`${i.label}: ${i.value} (${Math.round((i.value / total) * 100)}%)`}
              style={{ flex: i.value, background: i.color, opacity: hover && hover !== i.label ? 0.55 : 1 }}
            />
          ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-sm">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: i.color }} />
            {i.icon && <i.icon className="size-3.5 shrink-0 text-ink-500" aria-hidden />}
            <span className="text-ink-700">{i.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink-900">{i.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-ink-500">{Math.round((i.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
