import { supabase } from '@/lib/supabase'
import type { OdDetail, OdStatus } from '@/types'
import { unwrap, unwrapMaybe } from './db'
import { removeFiles } from './storageService'

export async function listMyOds(studentId: string): Promise<OdDetail[]> {
  return unwrap(
    await supabase
      .from('od_details')
      .select('*')
      .eq('student_id', studentId)
      .order('event_date', { ascending: false }),
  ) as OdDetail[]
}

export async function getOd(id: string): Promise<OdDetail | null> {
  return unwrapMaybe(await supabase.from('od_details').select('*').eq('id', id).maybeSingle()) as OdDetail | null
}

export async function getOdByAchievement(achievementId: string): Promise<OdDetail | null> {
  return unwrapMaybe(
    await supabase.from('od_details').select('*').eq('achievement_id', achievementId).maybeSingle(),
  ) as OdDetail | null
}

export interface OdInput {
  achievement_id: string
  category_id: string
  event_name: string
  organization: string | null
  event_date: string
  event_end_date: string | null
  start_time: string | null
  end_time: string | null
  venue: string
  reason: string
  additional_document_path: string | null
  additional_document_name: string | null
}

export type OdFields = Omit<OdInput, 'achievement_id'>

function clean(input: OdFields) {
  return {
    ...input,
    event_name: input.event_name.trim(),
    organization: input.organization?.trim() || null,
    event_end_date: input.event_end_date && input.event_end_date !== input.event_date ? input.event_end_date : null,
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    venue: input.venue.trim(),
    reason: input.reason.trim(),
  }
}

export async function createOd(studentId: string, achievementId: string, input: OdFields): Promise<string> {
  const row = unwrap(
    await supabase
      .from('od_requests')
      .insert({ ...clean(input), student_id: studentId, achievement_id: achievementId, status: 'pending' })
      .select('id')
      .single(),
  ) as { id: string }
  return row.id
}

/** After faculty ask for more information, the student edits and sends it back for review. */
export async function resubmitOd(id: string, input: OdFields) {
  unwrap(
    await supabase
      .from('od_requests')
      .update({ ...clean(input), status: 'pending' satisfies OdStatus })
      .eq('id', id)
      .select('id')
      .single(),
  )
}

export async function withdrawOd(od: Pick<OdDetail, 'id' | 'additional_document_path'>) {
  unwrap(await supabase.from('od_requests').delete().eq('id', od.id).select('id').single())
  await removeFiles([od.additional_document_path])
}

export async function reviewOd(id: string, decision: Exclude<OdStatus, 'pending'>, comment?: string) {
  unwrap(
    await supabase.rpc('review_od_request', {
      p_od_id: id,
      p_decision: decision,
      p_comment: comment?.trim() || null,
    }),
  )
}
