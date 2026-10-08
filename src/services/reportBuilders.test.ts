import { describe, expect, it } from 'vitest'
import { toCSV } from '@/lib/csv'
import type { AchievementDetail, OdDetail } from '@/types'
import { buildReport } from './reportBuilders'

function ach(over: Partial<AchievementDetail> = {}): AchievementDetail {
  return {
    id: crypto.randomUUID(), student_id: 's1', category_id: 'c1', event_name: 'VMEDITHON V3.0', organization: 'XYZ',
    start_date: '2026-09-17', end_date: null, result: 'Finalist', description: null, status: 'verified',
    submitted_at: '2026-09-18T10:00:00Z', reviewed_at: '2026-09-19T10:00:00Z', review_comment: null,
    created_at: '2026-09-18T09:00:00Z', student_name: 'Dinesh', register_number: '2021CSE001', student_year: 3,
    student_section: 'A', department_id: 'd1', department_name: 'Computer Science', department_code: 'CSE',
    category_name: 'Hackathon', category_slug: 'hackathon', verification_code: 'CP-2026-ABCDE', verified_at: '2026-09-19T10:00:00Z',
    od_status: null, ...over,
  }
}

function od(over: Partial<OdDetail> = {}): OdDetail {
  return {
    id: crypto.randomUUID(), student_id: 's1', achievement_id: 'a1', category_id: 'c1', event_name: 'VMEDITHON V3.0',
    organization: 'XYZ', event_date: '2026-09-17', event_end_date: null, start_time: null, end_time: null, venue: 'Chennai',
    reason: 'Hackathon finals', additional_document_path: null, additional_document_name: null, status: 'approved',
    reviewed_at: '2026-09-16T10:00:00Z', review_comment: null, created_at: '2026-09-10T10:00:00Z', updated_at: '2026-09-16T10:00:00Z',
    student_name: 'Dinesh', register_number: '2021CSE001', student_year: 3, department_id: 'd1', department_name: 'Computer Science',
    category_name: 'Hackathon', achievement_status: 'verified', ...over,
  }
}

describe('buildReport', () => {
  const rows = [
    ach(),
    ach({ event_name: 'Cloud Workshop', category_id: 'c2', category_name: 'Workshop', status: 'pending', verification_code: null }),
    ach({ student_id: 's2', student_name: 'Priya', register_number: '2021CSE002', status: 'rejected', review_comment: 'Date mismatch' }),
    ach({ student_id: 's3', status: 'draft' }),
  ]

  it('student participation ignores drafts and ranks by volume', () => {
    const r = buildReport('student-participation', rows, [])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].slice(0, 9)).toEqual(['Dinesh', '2021CSE001', 'CSE', 3, 'A', 2, 1, 1, 0])
    expect(r.rows[1][0]).toBe('Priya')
    expect(r.rows.every((row) => row.length === r.headers.length)).toBe(true)
  })

  it('department participation combines achievements and ODs', () => {
    const r = buildReport('department-participation', rows, [od(), od({ status: 'rejected' })])
    expect(r.rows).toEqual([['Computer Science', 2, 3, 1, 1, 1, '33%', 2, 1]])
  })

  it('event-wise groups the same event on the same day', () => {
    const r = buildReport('event-wise', [ach(), ach({ student_id: 's2' }), ach({ event_name: 'Other', status: 'pending' })], [])
    const vmed = r.rows.find((row) => row[0] === 'VMEDITHON V3.0')
    expect(vmed?.slice(4)).toEqual([2, 2, 0])
  })

  it('monthly buckets by event month in chronological order', () => {
    const r = buildReport('monthly', [ach({ start_date: '2026-10-02' }), ach()], [od()])
    expect(r.rows.map((x) => x[0])).toEqual(['Sep 2026', 'Oct 2026'])
    expect(r.rows[0]).toEqual(['Sep 2026', 1, 1, 0, 0, 1, 1])
  })

  it('verification report lists decisions only', () => {
    const r = buildReport('verification', rows, [])
    expect(r.rows).toHaveLength(2)
    expect(r.rows.map((x) => x[5]).sort()).toEqual(['Rejected', 'Verified'])
  })

  it('OD report labels statuses', () => {
    expect(buildReport('od', [], [od(), od({ status: 'more_info' })]).rows.map((x) => x[6]).sort()).toEqual(['Approved', 'More Info Required'])
  })

  it('exports safely to CSV (formula injection neutralised)', () => {
    const r = buildReport('od', [], [od({ student_name: '=HYPERLINK("http://evil")', review_comment: 'Needs, a comma' })])
    const csv = toCSV(r.rows, r.headers.map((h, i) => ({ header: h, value: (row: (string | number)[]) => row[i] })))
    expect(csv.split('\r\n')[1]).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).toContain('"Needs, a comma"')
  })
})
