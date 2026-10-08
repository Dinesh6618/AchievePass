import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { parseISODate, toISODate } from '@/lib/dates'
import { nameSimilarity, normalizeText } from '@/lib/similarity'
import type { Achievement, AchievementDetail, Certificate } from '@/types'
import { one, unwrap, unwrapMaybe } from './db'
import { removeFiles } from './storageService'

const ACHIEVEMENT_SELECT = `
  *,
  category:event_categories(id, slug, name),
  certificate:certificates(*),
  verification:verification_records(verification_code),
  od:od_requests(id, status)
`

type OdRef = NonNullable<Achievement['od_request']>

// PostgREST returns an object or an array for an embed depending on how it infers the relationship.
interface RawAchievement extends Omit<Achievement, 'certificate' | 'verification_code' | 'od_request'> {
  certificate: Certificate | Certificate[] | null
  verification: { verification_code: string } | { verification_code: string }[] | null
  od: OdRef | OdRef[] | null
}

function normalize(raw: RawAchievement): Achievement {
  const { verification, od, certificate, ...rest } = raw
  return {
    ...rest,
    certificate: one(certificate),
    verification_code: one(verification)?.verification_code ?? null,
    od_request: one(od),
  }
}

export async function listMyAchievements(studentId: string): Promise<Achievement[]> {
  const rows = unwrap(
    await supabase
      .from('achievements')
      .select(ACHIEVEMENT_SELECT)
      .eq('student_id', studentId)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as RawAchievement[]
  return rows.map(normalize)
}

export async function getAchievement(id: string): Promise<Achievement | null> {
  const row = unwrapMaybe(
    await supabase.from('achievements').select(ACHIEVEMENT_SELECT).eq('id', id).maybeSingle(),
  ) as RawAchievement | null
  return row ? normalize(row) : null
}

export interface AchievementInput {
  category_id: string
  event_name: string
  organization: string | null
  start_date: string
  end_date: string | null
  result: string | null
  description: string | null
}

export interface CertificateInput {
  storage_path: string
  file_name: string
  mime_type: Certificate['mime_type']
  size_bytes: number
  file_hash: string | null
  ocr_data: Record<string, unknown> | null
}

function clean(input: AchievementInput): AchievementInput {
  return {
    category_id: input.category_id,
    event_name: input.event_name.trim(),
    organization: input.organization?.trim() || null,
    start_date: input.start_date,
    end_date: input.end_date && input.end_date !== input.start_date ? input.end_date : null,
    result: input.result?.trim() || null,
    description: input.description?.trim() || null,
  }
}

/**
 * Create → attach certificate → (optionally) submit. Each step is its own request, so a
 * failure part-way leaves a recoverable draft instead of a half-submitted record.
 */
export async function createAchievement(
  studentId: string,
  input: AchievementInput,
  certificate: CertificateInput,
  options: { submit: boolean },
): Promise<{ id: string; submitted: boolean }> {
  const created = unwrap(
    await supabase
      .from('achievements')
      .insert({ ...clean(input), student_id: studentId, status: 'draft' })
      .select('id')
      .single(),
  ) as { id: string }

  const { error: certError } = await supabase
    .from('certificates')
    .insert({ ...certificate, achievement_id: created.id, student_id: studentId })
  if (certError) {
    await supabase.from('achievements').delete().eq('id', created.id) // don't leave an empty draft behind
    throw certError
  }

  if (!options.submit) return { id: created.id, submitted: false }

  const { error: submitError } = await supabase
    .from('achievements')
    .update({ status: 'pending' })
    .eq('id', created.id)
  if (submitError) {
    throw new AppError(
      'Your achievement was saved as a draft but could not be submitted. Open it from Achievements to submit again.',
    )
  }
  return { id: created.id, submitted: true }
}

export async function updateAchievement(id: string, input: AchievementInput, options: { submit?: boolean } = {}) {
  unwrap(
    await supabase
      .from('achievements')
      .update({ ...clean(input), ...(options.submit ? { status: 'pending' } : {}) })
      .eq('id', id)
      .select('id')
      .single(),
  )
}

export async function submitAchievement(id: string) {
  unwrap(await supabase.from('achievements').update({ status: 'pending' }).eq('id', id).select('id').single())
}

/** Swap the certificate on a draft / rejected / change-requested achievement. */
export async function replaceCertificate(achievementId: string, studentId: string, next: CertificateInput, previousPath?: string | null) {
  const existing = unwrapMaybe(
    await supabase.from('certificates').select('id').eq('achievement_id', achievementId).maybeSingle(),
  ) as { id: string } | null
  if (existing) {
    unwrap(await supabase.from('certificates').update(next).eq('id', existing.id).select('id').single())
  } else {
    unwrap(
      await supabase
        .from('certificates')
        .insert({ ...next, achievement_id: achievementId, student_id: studentId })
        .select('id')
        .single(),
    )
  }
  if (previousPath && previousPath !== next.storage_path) await removeFiles([previousPath])
}

export async function deleteAchievement(achievement: Pick<Achievement, 'id' | 'certificate'>) {
  unwrap(await supabase.from('achievements').delete().eq('id', achievement.id).select('id').single())
  await removeFiles([achievement.certificate?.storage_path])
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export interface DuplicateMatch {
  achievement: Pick<Achievement, 'id' | 'event_name' | 'start_date' | 'status'>
  reason: 'same-file' | 'same-event'
}

const DATE_WINDOW_DAYS = 3
const NAME_THRESHOLD = 0.82

function shiftDays(iso: string, days: number) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/**
 * Flags a possible duplicate for the same student: either the identical file was uploaded
 * before, or a very similar event name falls within a few days of the same date.
 */
export async function findDuplicates(opts: {
  studentId: string
  eventName: string
  startDate: string
  fileHash?: string | null
  excludeAchievementId?: string
}): Promise<DuplicateMatch[]> {
  const { studentId, eventName, startDate, fileHash, excludeAchievementId } = opts
  const matches: DuplicateMatch[] = []
  const seen = new Set<string>()

  if (fileHash) {
    const rows = unwrap(
      await supabase
        .from('certificates')
        .select('achievement_id, achievement:achievements(id, event_name, start_date, status)')
        .eq('student_id', studentId)
        .eq('file_hash', fileHash),
    ) as { achievement_id: string; achievement: DuplicateMatch['achievement'] | DuplicateMatch['achievement'][] | null }[]
    for (const r of rows) {
      const a = one(r.achievement)
      if (a && a.id !== excludeAchievementId && !seen.has(a.id)) {
        seen.add(a.id)
        matches.push({ achievement: a, reason: 'same-file' })
      }
    }
  }

  if (eventName.trim() && startDate) {
    const nearby = unwrap(
      await supabase
        .from('achievements')
        .select('id, event_name, start_date, status')
        .eq('student_id', studentId)
        .gte('start_date', shiftDays(startDate, -DATE_WINDOW_DAYS))
        .lte('start_date', shiftDays(startDate, DATE_WINDOW_DAYS)),
    ) as DuplicateMatch['achievement'][]
    for (const a of nearby) {
      if (a.id === excludeAchievementId || seen.has(a.id)) continue
      if (normalizeText(a.event_name) === normalizeText(eventName) || nameSimilarity(a.event_name, eventName) >= NAME_THRESHOLD) {
        seen.add(a.id)
        matches.push({ achievement: a, reason: 'same-event' })
      }
    }
  }

  return matches
}

// ---------------------------------------------------------------------------
// Staff views (flat rows from the achievement_details view)
// ---------------------------------------------------------------------------

export async function getAchievementDetail(id: string): Promise<AchievementDetail | null> {
  return unwrapMaybe(
    await supabase.from('achievement_details').select('*').eq('id', id).maybeSingle(),
  ) as AchievementDetail | null
}

export async function getCertificateFor(achievementId: string): Promise<Certificate | null> {
  return unwrapMaybe(
    await supabase.from('certificates').select('*').eq('achievement_id', achievementId).maybeSingle(),
  ) as Certificate | null
}
