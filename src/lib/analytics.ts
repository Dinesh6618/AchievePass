import { MONTH_LABELS, parseISODate } from './dates'
import type { AchievementDetail, AchievementStatus, OdDetail } from '@/types'

type AchievementRow = Pick<
  AchievementDetail,
  'start_date' | 'status' | 'category_name' | 'category_slug' | 'department_name' | 'department_code' | 'student_id'
>
type OdRow = Pick<OdDetail, 'event_date' | 'status'>

const inYear = (iso: string, year: number) => parseISODate(iso).getFullYear() === year

export interface NamedCount {
  name: string
  value: number
}

/** Counts submitted (non-draft) achievements per category, biggest first. */
export function countByCategory(rows: AchievementRow[], opts: { verifiedOnly?: boolean } = {}): NamedCount[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (r.status === 'draft') continue
    if (opts.verifiedOnly && r.status !== 'verified') continue
    counts.set(r.category_name, (counts.get(r.category_name) ?? 0) + 1)
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export interface MonthPoint {
  month: string
  [series: string]: number | string
}

/** Twelve month buckets for `year`, with a count for each series name returned by `series(row)`. */
function bucketByMonth<T>(
  rows: T[],
  year: number,
  dateOf: (row: T) => string,
  seriesOf: (row: T) => string | null,
  seriesNames: string[],
): MonthPoint[] {
  const points: MonthPoint[] = MONTH_LABELS.map((month) => ({
    month,
    ...Object.fromEntries(seriesNames.map((s) => [s, 0])),
  }))
  for (const row of rows) {
    const date = dateOf(row)
    if (!inYear(date, year)) continue
    const series = seriesOf(row)
    if (!series) continue
    const point = points[parseISODate(date).getMonth()]
    point[series] = (point[series] as number) + 1
  }
  return points
}

export function achievementsByMonth(rows: AchievementRow[], year: number): MonthPoint[] {
  return bucketByMonth(
    rows,
    year,
    (r) => r.start_date,
    (r) => (r.status === 'draft' ? null : r.status === 'verified' ? 'Verified' : 'Other submitted'),
    ['Verified', 'Other submitted'],
  )
}

/** Monthly participation for a single category slug (e.g. "hackathon"). */
export function categoryByMonth(rows: AchievementRow[], slug: string, year: number): MonthPoint[] {
  return bucketByMonth(
    rows,
    year,
    (r) => r.start_date,
    (r) => (r.status !== 'draft' && r.category_slug === slug ? 'Participants' : null),
    ['Participants'],
  )
}

export function odByMonth(rows: OdRow[], year: number): MonthPoint[] {
  return bucketByMonth(
    rows,
    year,
    (r) => r.event_date,
    (r) => (r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending / info'),
    ['Approved', 'Pending / info', 'Rejected'],
  )
}

export interface DepartmentPoint {
  name: string
  achievements: number
  verified: number
  students: number
}

export function participationByDepartment(rows: AchievementRow[]): DepartmentPoint[] {
  const map = new Map<string, { achievements: number; verified: number; students: Set<string> }>()
  for (const r of rows) {
    if (r.status === 'draft') continue
    const key = r.department_code ?? r.department_name ?? 'Unassigned'
    const entry = map.get(key) ?? { achievements: 0, verified: 0, students: new Set<string>() }
    entry.achievements++
    if (r.status === 'verified') entry.verified++
    entry.students.add(r.student_id)
    map.set(key, entry)
  }
  return [...map]
    .map(([name, e]) => ({ name, achievements: e.achievements, verified: e.verified, students: e.students.size }))
    .sort((a, b) => b.achievements - a.achievements)
}

const STATUS_LABEL: Record<AchievementStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
}

export function verificationBreakdown(rows: Pick<AchievementDetail, 'status'>[]): NamedCount[] {
  const counts = new Map<AchievementStatus, number>()
  for (const r of rows) {
    if (r.status === 'draft') continue
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  }
  return (['verified', 'pending', 'changes_requested', 'rejected'] as AchievementStatus[])
    .filter((s) => counts.has(s))
    .map((s) => ({ name: STATUS_LABEL[s], value: counts.get(s)! }))
}

export function yearsWithData(dates: string[], fallback = new Date().getFullYear()): number[] {
  const years = new Set<number>([fallback])
  for (const d of dates) years.add(parseISODate(d).getFullYear())
  return [...years].sort((a, b) => b - a)
}
