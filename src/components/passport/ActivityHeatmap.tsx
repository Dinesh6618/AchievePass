import { useMemo } from 'react'
import { buildHeatmap, heatLevel } from '@/lib/heatmap'
import { formatDateLong, MONTH_LABELS } from '@/lib/dates'

const CELL = 12
const GAP = 3
const LEFT = 28
const TOP = 18

const LEVEL_FILL = [
  'fill-paper-200',
  'fill-gold-100',
  'fill-gold-400',
  'fill-gold-500',
  'fill-gold-700',
]

interface ActivityHeatmapProps {
  events: { start_date: string; end_date: string | null }[]
  year: number
}

/** GitHub-style participation grid for one calendar year. */
export function ActivityHeatmap({ events, year }: ActivityHeatmapProps) {
  const heat = useMemo(() => buildHeatmap(events, year), [events, year])
  const width = LEFT + heat.weeks.length * (CELL + GAP)
  const height = TOP + 7 * (CELL + GAP)
  const summary = `${heat.total} ${heat.total === 1 ? 'activity' : 'activities'} across ${heat.activeDays} ${heat.activeDays === 1 ? 'day' : 'days'} in ${year}`

  return (
    <figure>
      <div className="overflow-x-auto pb-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          className="max-w-none"
        >
          {heat.monthStarts.map(({ month, week }) => (
            <text key={month} x={LEFT + week * (CELL + GAP)} y={11} className="fill-ink-500 text-[10px]">
              {MONTH_LABELS[month]}
            </text>
          ))}
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <text key={d} x={0} y={TOP + (i * 2 + 1) * (CELL + GAP) + CELL - 2} className="fill-ink-500 text-[10px]">
              {d}
            </text>
          ))}
          {heat.weeks.map((week, w) =>
            week.map((cell, d) =>
              cell.inYear ? (
                <rect
                  key={cell.date}
                  x={LEFT + w * (CELL + GAP)}
                  y={TOP + d * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  className={LEVEL_FILL[heatLevel(cell.count, heat.max)]}
                >
                  <title>
                    {cell.count > 0
                      ? `${cell.count} ${cell.count === 1 ? 'activity' : 'activities'} · ${formatDateLong(cell.date)}`
                      : `No activity · ${formatDateLong(cell.date)}`}
                  </title>
                </rect>
              ) : null,
            ),
          )}
        </svg>
      </div>
      <figcaption className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span>{summary}</span>
        <span className="flex items-center gap-1.5" aria-hidden>
          Less
          {LEVEL_FILL.map((fill) => (
            <svg key={fill} width={CELL} height={CELL} viewBox="0 0 12 12">
              <rect width="12" height="12" rx="2" className={fill} />
            </svg>
          ))}
          More
        </span>
      </figcaption>
    </figure>
  )
}
