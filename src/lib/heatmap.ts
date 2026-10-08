import { eachDay, parseISODate, toISODate } from './dates'

export interface HeatCell {
  date: string
  count: number
  /** false for the padding days before 1 Jan / after 31 Dec so the grid stays rectangular */
  inYear: boolean
}

export interface Heatmap {
  /** columns = weeks (Sunday first), each with 7 cells */
  weeks: HeatCell[][]
  max: number
  total: number
  activeDays: number
  /** column index where each month starts, for the month labels above the grid */
  monthStarts: { month: number; week: number }[]
}

/**
 * GitHub-style yearly grid. An achievement that spans several days lights up every day
 * it covers (capped at 31) so a 3-day hackathon reads as a streak, not a dot.
 */
export function buildHeatmap(events: { start_date: string; end_date: string | null }[], year: number): Heatmap {
  const counts = new Map<string, number>()
  for (const e of events) {
    for (const day of eachDay(e.start_date, e.end_date)) {
      if (parseISODate(day).getFullYear() === year) counts.set(day, (counts.get(day) ?? 0) + 1)
    }
  }

  const first = new Date(year, 0, 1)
  const last = new Date(year, 11, 31)
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - cursor.getDay()) // back up to the Sunday on/before 1 Jan

  const weeks: HeatCell[][] = []
  const monthStarts: Heatmap['monthStarts'] = []
  let seenMonth = -1
  let max = 0

  while (cursor <= last) {
    const week: HeatCell[] = []
    for (let i = 0; i < 7; i++) {
      const iso = toISODate(cursor)
      const inYear = cursor.getFullYear() === year
      const count = inYear ? (counts.get(iso) ?? 0) : 0
      max = Math.max(max, count)
      week.push({ date: iso, count, inYear })
      if (inYear && cursor.getMonth() !== seenMonth && cursor.getDate() <= 7) {
        seenMonth = cursor.getMonth()
        monthStarts.push({ month: seenMonth, week: weeks.length })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  const activeDays = [...counts.values()].filter((c) => c > 0).length
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  return { weeks, max, total, activeDays, monthStarts }
}

/** 0 = nothing, 1–4 = increasing intensity, relative to the busiest day. */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  const ratio = count / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}
