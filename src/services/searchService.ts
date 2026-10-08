import { supabase } from '@/lib/supabase'
import { sanitizeSearchTerm } from '@/lib/utils'
import type { AchievementDetail, AchievementStatus, OdDetail, OdStatus } from '@/types'
import type { Page } from './db'

export interface AchievementFilters {
  q?: string
  status?: AchievementStatus | ''
  categoryId?: string
  departmentId?: string
  year?: number | null
  /** Inclusive range, matched against the event's start date. */
  from?: string
  to?: string
  studentId?: string
  /** Hide drafts (staff never see them anyway; students might). */
  excludeDrafts?: boolean
  sort?: 'newest' | 'oldest' | 'submitted'
  page?: number
  pageSize?: number
}

export async function searchAchievements(f: AchievementFilters = {}): Promise<Page<AchievementDetail>> {
  const { page = 0, pageSize = 20, sort = 'newest' } = f
  let q = supabase.from('achievement_details').select('*', { count: 'exact' })

  const term = sanitizeSearchTerm(f.q ?? '')
  if (term) {
    q = q.or(
      [
        `event_name.ilike.%${term}%`,
        `organization.ilike.%${term}%`,
        `result.ilike.%${term}%`,
        `student_name.ilike.%${term}%`,
        `register_number.ilike.%${term}%`,
        `category_name.ilike.%${term}%`,
      ].join(','),
    )
  }
  if (f.status) q = q.eq('status', f.status)
  if (f.categoryId) q = q.eq('category_id', f.categoryId)
  if (f.departmentId) q = q.eq('department_id', f.departmentId)
  if (f.year) q = q.eq('student_year', f.year)
  if (f.studentId) q = q.eq('student_id', f.studentId)
  if (f.from) q = q.gte('start_date', f.from)
  if (f.to) q = q.lte('start_date', f.to)
  if (f.excludeDrafts) q = q.neq('status', 'draft')

  q =
    sort === 'oldest'
      ? q.order('start_date', { ascending: true })
      : sort === 'submitted'
        ? q.order('submitted_at', { ascending: true, nullsFirst: false })
        : q.order('start_date', { ascending: false })

  const { data, error, count } = await q.range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as AchievementDetail[], total: count ?? 0 }
}

export interface OdFilters {
  q?: string
  status?: OdStatus | ''
  departmentId?: string
  year?: number | null
  categoryId?: string
  from?: string
  to?: string
  studentId?: string
  page?: number
  pageSize?: number
}

export async function searchOds(f: OdFilters = {}): Promise<Page<OdDetail>> {
  const { page = 0, pageSize = 20 } = f
  let q = supabase.from('od_details').select('*', { count: 'exact' })

  const term = sanitizeSearchTerm(f.q ?? '')
  if (term) {
    q = q.or(
      [
        `event_name.ilike.%${term}%`,
        `organization.ilike.%${term}%`,
        `student_name.ilike.%${term}%`,
        `register_number.ilike.%${term}%`,
        `venue.ilike.%${term}%`,
      ].join(','),
    )
  }
  if (f.status) q = q.eq('status', f.status)
  if (f.departmentId) q = q.eq('department_id', f.departmentId)
  if (f.year) q = q.eq('student_year', f.year)
  if (f.categoryId) q = q.eq('category_id', f.categoryId)
  if (f.studentId) q = q.eq('student_id', f.studentId)
  if (f.from) q = q.gte('event_date', f.from)
  if (f.to) q = q.lte('event_date', f.to)

  const { data, error, count } = await q
    .order('event_date', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (error) throw error
  return { rows: (data ?? []) as OdDetail[], total: count ?? 0 }
}
