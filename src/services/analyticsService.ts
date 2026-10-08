import { supabase } from '@/lib/supabase'
import type { AchievementDetail, OdDetail } from '@/types'
import { fetchAll } from './db'

export type AnalyticsAchievement = Pick<
  AchievementDetail,
  'student_id' | 'start_date' | 'status' | 'category_id' | 'category_name' | 'category_slug' | 'department_name' | 'department_code'
>
export type AnalyticsOd = Pick<OdDetail, 'event_date' | 'status'>

export interface AnalyticsData {
  achievements: AnalyticsAchievement[]
  ods: AnalyticsOd[]
}

/**
 * Loads only the columns the charts need. Aggregation happens in the browser (src/lib/analytics.ts), which
 * is fine for a college-sized dataset; at much larger scale these would move to SQL views.
 */
export async function loadAnalyticsData(departmentId?: string): Promise<AnalyticsData> {
  const [achievements, ods] = await Promise.all([
    fetchAll<AnalyticsAchievement>((from, to) => {
      let q = supabase
        .from('achievement_details')
        .select('student_id, start_date, status, category_id, category_name, category_slug, department_name, department_code')
        .neq('status', 'draft')
        .order('start_date')
        .range(from, to)
      if (departmentId) q = q.eq('department_id', departmentId)
      return q as unknown as PromiseLike<{ data: AnalyticsAchievement[] | null; error: never }>
    }),
    fetchAll<AnalyticsOd>((from, to) => {
      let q = supabase.from('od_details').select('event_date, status').order('event_date').range(from, to)
      if (departmentId) q = q.eq('department_id', departmentId)
      return q as unknown as PromiseLike<{ data: AnalyticsOd[] | null; error: never }>
    }),
  ])
  return { achievements, ods }
}
