import { formatDate, formatDateTime, parseISODate } from '@/lib/dates'
import { normalizeText } from '@/lib/similarity'
import { MONTH_LABELS } from '@/lib/dates'
import type { AchievementDetail, OdDetail } from '@/types'
import { OD_STATUS } from '@/components/ui/StatusBadge'
import { ACHIEVEMENT_STATUS } from '@/components/ui/StatusBadge'

export type ReportType =
  | 'student-participation'
  | 'department-participation'
  | 'event-wise'
  | 'monthly'
  | 'od'
  | 'verification'

export interface ReportMeta {
  id: ReportType
  title: string
  description: string
}

export const REPORTS: ReportMeta[] = [
  { id: 'student-participation', title: 'Student participation', description: 'Achievements per student with verification breakdown.' },
  { id: 'department-participation', title: 'Department participation', description: 'Participation, verification rate and OD usage by department.' },
  { id: 'event-wise', title: 'Event-wise', description: 'Who took part in each event, grouped by event and date.' },
  { id: 'monthly', title: 'Monthly', description: 'Submissions, decisions and OD requests month by month.' },
  { id: 'od', title: 'OD report', description: 'Every OD request with its decision.' },
  { id: 'verification', title: 'Verification report', description: 'Certificate decisions with verification IDs and reviewer comments.' },
]

export interface ReportResult {
  headers: string[]
  rows: (string | number)[][]
}

type A = AchievementDetail
type O = OdDetail

const submitted = (rows: A[]) => rows.filter((a) => a.status !== 'draft')

function sortBy<T>(rows: T[], key: (r: T) => string | number, dir: 'asc' | 'desc' = 'desc'): T[] {
  return [...rows].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return dir === 'asc' ? cmp : -cmp
  })
}

function studentParticipation(achievements: A[]): ReportResult {
  const byStudent = new Map<string, A[]>()
  for (const a of submitted(achievements)) {
    const list = byStudent.get(a.student_id) ?? []
    list.push(a)
    byStudent.set(a.student_id, list)
  }
  const rows = [...byStudent.values()].map((list) => {
    const first = list[0]
    const count = (s: A['status']) => list.filter((a) => a.status === s).length
    return {
      total: list.length,
      row: [
        first.student_name,
        first.register_number ?? '',
        first.department_code ?? first.department_name ?? '',
        first.student_year ?? '',
        first.student_section ?? '',
        list.length,
        count('verified'),
        count('pending'),
        count('rejected') + count('changes_requested'),
        new Set(list.map((a) => a.category_id)).size,
        formatDate([...list].sort((a, b) => b.start_date.localeCompare(a.start_date))[0].start_date),
      ] as (string | number)[],
    }
  })
  return {
    headers: ['Student', 'Register number', 'Department', 'Year', 'Section', 'Achievements', 'Verified', 'Pending', 'Rejected / changes', 'Categories', 'Latest event'],
    rows: sortBy(rows, (r) => r.total).map((r) => r.row),
  }
}

function departmentParticipation(achievements: A[], ods: O[]): ReportResult {
  interface Bucket { name: string; students: Set<string>; total: number; verified: number; pending: number; rejected: number; ods: number; approved: number }
  const map = new Map<string, Bucket>()
  const bucket = (name: string): Bucket => {
    let b = map.get(name)
    if (!b) {
      b = { name, students: new Set(), total: 0, verified: 0, pending: 0, rejected: 0, ods: 0, approved: 0 }
      map.set(name, b)
    }
    return b
  }
  for (const a of submitted(achievements)) {
    const b = bucket(a.department_name ?? 'Unassigned')
    b.students.add(a.student_id)
    b.total++
    if (a.status === 'verified') b.verified++
    else if (a.status === 'pending') b.pending++
    else b.rejected++
  }
  for (const o of ods) {
    const b = bucket(o.department_name ?? 'Unassigned')
    b.ods++
    if (o.status === 'approved') b.approved++
  }
  const rows = sortBy([...map.values()], (b) => b.total).map((b) => [
    b.name,
    b.students.size,
    b.total,
    b.verified,
    b.pending,
    b.rejected,
    b.total ? `${Math.round((b.verified / b.total) * 100)}%` : '—',
    b.ods,
    b.approved,
  ])
  return {
    headers: ['Department', 'Students participating', 'Achievements', 'Verified', 'Pending', 'Rejected / changes', 'Verification rate', 'OD requests', 'ODs approved'],
    rows,
  }
}

function eventWise(achievements: A[]): ReportResult {
  interface Bucket { name: string; category: string; date: string; org: string; total: number; verified: number; pending: number }
  const map = new Map<string, Bucket>()
  for (const a of submitted(achievements)) {
    const key = `${normalizeText(a.event_name)}|${a.start_date}`
    const b = map.get(key) ?? { name: a.event_name, category: a.category_name, date: a.start_date, org: a.organization ?? '', total: 0, verified: 0, pending: 0 }
    b.total++
    if (a.status === 'verified') b.verified++
    if (a.status === 'pending') b.pending++
    if (!b.org && a.organization) b.org = a.organization
    map.set(key, b)
  }
  const rows = sortBy([...map.values()], (b) => b.date).map((b) => [b.name, b.category, formatDate(b.date), b.org, b.total, b.verified, b.pending])
  return { headers: ['Event', 'Category', 'Date', 'Organization', 'Participants', 'Verified', 'Pending'], rows }
}

function monthly(achievements: A[], ods: O[]): ReportResult {
  interface Bucket { key: string; submitted: number; verified: number; rejected: number; pending: number; ods: number; approved: number }
  const map = new Map<string, Bucket>()
  const keyOf = (iso: string) => iso.slice(0, 7)
  const bucket = (iso: string) => {
    const key = keyOf(iso)
    let b = map.get(key)
    if (!b) {
      b = { key, submitted: 0, verified: 0, rejected: 0, pending: 0, ods: 0, approved: 0 }
      map.set(key, b)
    }
    return b
  }
  for (const a of submitted(achievements)) {
    const b = bucket(a.start_date)
    b.submitted++
    if (a.status === 'verified') b.verified++
    else if (a.status === 'pending') b.pending++
    else b.rejected++
  }
  for (const o of ods) {
    const b = bucket(o.event_date)
    b.ods++
    if (o.status === 'approved') b.approved++
  }
  const rows = sortBy([...map.values()], (b) => b.key, 'asc').map((b) => {
    const d = parseISODate(`${b.key}-01`)
    return [`${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`, b.submitted, b.verified, b.pending, b.rejected, b.ods, b.approved]
  })
  return { headers: ['Month', 'Achievements', 'Verified', 'Pending', 'Rejected / changes', 'OD requests', 'ODs approved'], rows }
}

function odReport(ods: O[]): ReportResult {
  const rows = sortBy(ods, (o) => o.event_date).map((o) => [
    o.student_name,
    o.register_number ?? '',
    o.department_name ?? '',
    o.event_name,
    formatDate(o.event_date) + (o.event_end_date ? ` – ${formatDate(o.event_end_date)}` : ''),
    o.venue,
    OD_STATUS[o.status].label,
    o.reviewed_at ? formatDateTime(o.reviewed_at) : '',
    o.review_comment ?? '',
  ])
  return { headers: ['Student', 'Register number', 'Department', 'Event', 'Date', 'Venue', 'Status', 'Reviewed on', 'Faculty comment'], rows }
}

function verification(achievements: A[]): ReportResult {
  const decided = achievements.filter((a) => ['verified', 'rejected', 'changes_requested'].includes(a.status))
  const rows = sortBy(decided, (a) => a.reviewed_at ?? a.start_date).map((a) => [
    a.student_name,
    a.register_number ?? '',
    a.event_name,
    a.category_name,
    formatDate(a.start_date),
    ACHIEVEMENT_STATUS[a.status].label,
    a.verification_code ?? '',
    a.reviewed_at ? formatDateTime(a.reviewed_at) : '',
    a.review_comment ?? '',
  ])
  return { headers: ['Student', 'Register number', 'Event', 'Category', 'Event date', 'Decision', 'Verification ID', 'Decided on', 'Faculty comment'], rows }
}

export function buildReport(type: ReportType, achievements: A[], ods: O[]): ReportResult {
  switch (type) {
    case 'student-participation':
      return studentParticipation(achievements)
    case 'department-participation':
      return departmentParticipation(achievements, ods)
    case 'event-wise':
      return eventWise(achievements)
    case 'monthly':
      return monthly(achievements, ods)
    case 'od':
      return odReport(ods)
    case 'verification':
      return verification(achievements)
  }
}

/** Which source tables a report needs, so we don't download more than necessary. */
export function reportSources(type: ReportType): { achievements: boolean; ods: boolean } {
  switch (type) {
    case 'od':
      return { achievements: false, ods: true }
    case 'department-participation':
    case 'monthly':
      return { achievements: true, ods: true }
    default:
      return { achievements: true, ods: false }
  }
}
