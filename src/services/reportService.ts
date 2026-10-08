import { supabase } from '@/lib/supabase'
import { toCSV, type CsvColumn } from '@/lib/csv'
import type { AchievementDetail, OdDetail } from '@/types'
import { fetchAll } from './db'
import { buildReport, reportSources, type ReportResult, type ReportType } from './reportBuilders'

export interface ReportFilters {
  from?: string
  to?: string
  departmentId?: string
}

/** Pulls every matching row (walking the 1000-row page limit) and builds the report. RLS scopes faculty to their department. */
export async function generateReport(type: ReportType, filters: ReportFilters): Promise<ReportResult> {
  const needs = reportSources(type)

  const [achievements, ods] = await Promise.all([
    needs.achievements
      ? fetchAll<AchievementDetail>((from, to) => {
          let q = supabase.from('achievement_details').select('*').neq('status', 'draft').order('start_date').range(from, to)
          if (filters.from) q = q.gte('start_date', filters.from)
          if (filters.to) q = q.lte('start_date', filters.to)
          if (filters.departmentId) q = q.eq('department_id', filters.departmentId)
          return q as unknown as PromiseLike<{ data: AchievementDetail[] | null; error: never }>
        })
      : Promise.resolve([] as AchievementDetail[]),
    needs.ods
      ? fetchAll<OdDetail>((from, to) => {
          let q = supabase.from('od_details').select('*').order('event_date').range(from, to)
          if (filters.from) q = q.gte('event_date', filters.from)
          if (filters.to) q = q.lte('event_date', filters.to)
          if (filters.departmentId) q = q.eq('department_id', filters.departmentId)
          return q as unknown as PromiseLike<{ data: OdDetail[] | null; error: never }>
        })
      : Promise.resolve([] as OdDetail[]),
  ])

  return buildReport(type, achievements, ods)
}

export function reportToCSV(report: ReportResult): string {
  const columns: CsvColumn<(string | number)[]>[] = report.headers.map((header, i) => ({
    header,
    value: (row) => row[i],
  }))
  return toCSV(report.rows, columns)
}
