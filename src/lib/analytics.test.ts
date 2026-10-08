import { describe, expect, it } from 'vitest'
import { achievementsByMonth, countByCategory, odByMonth, participationByDepartment, verificationBreakdown } from './analytics'
import { buildHeatmap, heatLevel } from './heatmap'

const row = (over: Partial<Parameters<typeof countByCategory>[0][number]> = {}) => ({
  start_date: '2026-03-10',
  status: 'verified' as const,
  category_name: 'Hackathon',
  category_slug: 'hackathon',
  department_name: 'Computer Science and Engineering',
  department_code: 'CSE',
  student_id: 's1',
  ...over,
})

describe('analytics', () => {
  it('ignores drafts when counting categories and sorts by volume', () => {
    const rows = [row(), row(), row({ category_name: 'Workshop', category_slug: 'workshop' }), row({ status: 'draft' })]
    expect(countByCategory(rows)).toEqual([
      { name: 'Hackathon', value: 2 },
      { name: 'Workshop', value: 1 },
    ])
    expect(countByCategory([row(), row({ status: 'pending' })], { verifiedOnly: true })).toEqual([
      { name: 'Hackathon', value: 1 },
    ])
  })

  it('buckets by month within the requested year only', () => {
    const points = achievementsByMonth(
      [row({ start_date: '2026-03-10' }), row({ start_date: '2026-03-20', status: 'pending' }), row({ start_date: '2025-03-10' })],
      2026,
    )
    expect(points).toHaveLength(12)
    expect(points[2]).toMatchObject({ month: 'Mar', Verified: 1, 'Other submitted': 1 })
    expect(points[0]).toMatchObject({ Verified: 0 })
  })

  it('splits OD requests by outcome', () => {
    const points = odByMonth(
      [
        { event_date: '2026-01-05', status: 'approved' },
        { event_date: '2026-01-06', status: 'more_info' },
        { event_date: '2026-01-07', status: 'rejected' },
      ],
      2026,
    )
    expect(points[0]).toMatchObject({ Approved: 1, 'Pending / info': 1, Rejected: 1 })
  })

  it('aggregates departments by distinct students', () => {
    const rows = [row(), row(), row({ student_id: 's2' }), row({ department_code: 'ECE', department_name: 'ECE' })]
    const cse = participationByDepartment(rows).find((d) => d.name === 'CSE')
    expect(cse).toEqual({ name: 'CSE', achievements: 3, verified: 3, students: 2 })
  })

  it('reports verification outcomes without drafts', () => {
    expect(verificationBreakdown([{ status: 'verified' }, { status: 'draft' }, { status: 'rejected' }])).toEqual([
      { name: 'Verified', value: 1 },
      { name: 'Rejected', value: 1 },
    ])
  })
})

describe('heatmap', () => {
  it('builds whole weeks that cover the year and lights multi-day events', () => {
    const h = buildHeatmap(
      [
        { start_date: '2026-09-17', end_date: '2026-09-19' },
        { start_date: '2026-09-18', end_date: null },
        { start_date: '2025-12-31', end_date: null }, // outside the year → ignored
      ],
      2026,
    )
    expect(h.weeks.every((w) => w.length === 7)).toBe(true)
    expect(h.weeks.length).toBeGreaterThanOrEqual(52)
    const cells = h.weeks.flat()
    expect(cells.find((c) => c.date === '2026-09-17')?.count).toBe(1)
    expect(cells.find((c) => c.date === '2026-09-18')?.count).toBe(2)
    expect(h.max).toBe(2)
    expect(h.total).toBe(4)
    expect(h.activeDays).toBe(3)
    expect(h.monthStarts).toHaveLength(12)
    // padding days are never counted
    expect(cells.filter((c) => !c.inYear).every((c) => c.count === 0)).toBe(true)
  })

  it('maps counts to intensity levels', () => {
    expect(heatLevel(0, 4)).toBe(0)
    expect(heatLevel(1, 4)).toBe(1)
    expect(heatLevel(4, 4)).toBe(4)
    expect(heatLevel(3, 0)).toBe(0)
  })
})
