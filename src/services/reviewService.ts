import { supabase } from '@/lib/supabase'
import type { ReviewStats } from '@/types'
import { unwrap } from './db'

function startOfLocalDay(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function getReviewStats(): Promise<ReviewStats> {
  return unwrap(await supabase.rpc('review_stats', { p_since: startOfLocalDay() })) as ReviewStats
}

/** Marks a pending achievement as verified; returns the new public verification code. */
export async function verifyAchievement(id: string, comment?: string): Promise<string> {
  return unwrap(
    await supabase.rpc('verify_achievement', { p_achievement_id: id, p_comment: comment?.trim() || null }),
  ) as string
}

export async function rejectAchievement(id: string, reason: string) {
  unwrap(await supabase.rpc('reject_achievement', { p_achievement_id: id, p_reason: reason.trim() }))
}

export async function requestAchievementChanges(id: string, message: string) {
  unwrap(await supabase.rpc('request_achievement_changes', { p_achievement_id: id, p_message: message.trim() }))
}
