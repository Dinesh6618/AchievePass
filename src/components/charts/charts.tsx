import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip } from './ChartParts'
import { BAR_RADIUS, BAR_THICKNESS, CHART, tickStyle } from './theme'

export interface SeriesDef {
  key: string
  label: string
  color: string
}

const HOVER_WASH = { fill: 'rgba(19, 30, 49, 0.05)' }

interface HBarProps {
  data: Record<string, string | number>[]
  series: SeriesDef[]
  ariaLabel: string
}

/**
 * Horizontal bars for ranked categories. One series: every bar wears the same colour and the value
 * sits at the tip. Two series: grouped, with the legend (supplied by the card) carrying identity.
 */
export function HBarChart({ data, series, ariaLabel }: HBarProps) {
  const grouped = series.length > 1
  const barSize = grouped ? 11 : BAR_THICKNESS
  const rowHeight = grouped ? barSize * series.length + 2 * (series.length - 1) + 22 : barSize + 18
  const height = data.length * rowHeight + (grouped ? 36 : 12)

  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: grouped ? 12 : 36, bottom: 0, left: 0 }} barCategoryGap={grouped ? 10 : 8} barGap={2}>
          {/* with one series the values are labelled at the bar tips and the axis is hidden, so no gridlines either */}
          {grouped && <CartesianGrid horizontal={false} stroke={CHART.grid} />}
          <XAxis type="number" hide={!grouped} allowDecimals={false} tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={grouped ? 64 : 132} tick={{ ...tickStyle, fill: CHART.inkSecondary }} axisLine={{ stroke: CHART.axis }} tickLine={false} interval={0} />
          <Tooltip cursor={HOVER_WASH} content={<ChartTooltip />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} barSize={barSize} radius={[0, BAR_RADIUS, BAR_RADIUS, 0]} isAnimationActive={false}>
              {!grouped && <LabelList dataKey={s.key} position="right" style={{ fill: CHART.ink, fontSize: 12, fontWeight: 600 }} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface MonthProps {
  data: Record<string, string | number>[]
  series: SeriesDef[]
  ariaLabel: string
  height?: number
}

/** Twelve columns. Stacked series are separated by a 2px surface gap; only the top segment is rounded. */
export function MonthColumns({ data, series, ariaLabel, height = 260 }: MonthProps) {
  const stacked = series.length > 1
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tick={tickStyle} axisLine={{ stroke: CHART.axis }} tickLine={false} />
          <YAxis allowDecimals={false} width={36} tick={tickStyle} axisLine={false} tickLine={false} />
          <Tooltip cursor={HOVER_WASH} content={<ChartTooltip total={stacked} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? 'stack' : undefined}
              fill={s.color}
              maxBarSize={BAR_THICKNESS + 4}
              radius={i === series.length - 1 ? [BAR_RADIUS, BAR_RADIUS, 0, 0] : 0}
              // the surface-coloured stroke is the 2px gap between stacked segments
              stroke={stacked ? CHART.surface : undefined}
              strokeWidth={stacked ? 2 : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Single-series trend: 2px line, ~10% wash, 8px markers with a 2px surface ring, crosshair on hover. */
export function MonthArea({ data, series, ariaLabel, height = 220 }: MonthProps) {
  const s = series[0]
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="month" tick={tickStyle} axisLine={{ stroke: CHART.axis }} tickLine={false} />
          <YAxis allowDecimals={false} width={36} tick={tickStyle} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<ChartTooltip />} />
          <Area
            // straight segments: these are discrete monthly counts, a smoothed curve would invent in-between values
            type="linear"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={s.color}
            fillOpacity={0.1}
            dot={{ r: 4, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
