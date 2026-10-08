import { todayISO, parseISODate, toISODate } from '@/lib/dates'
import type { AchievementInput } from '@/services/achievementService'
import type { ExtractedFields } from '@/services/ocr'
import type { Achievement, EventCategory } from '@/types'

export interface AchievementFormState {
  categoryId: string
  eventName: string
  organization: string
  startDate: string
  endDate: string
  result: string
  description: string
}

export type AchievementFormErrors = Partial<Record<keyof AchievementFormState, string>>

export const EMPTY_FORM: AchievementFormState = {
  categoryId: '',
  eventName: '',
  organization: '',
  startDate: '',
  endDate: '',
  result: '',
  description: '',
}

/** Latest date a student may enter: today plus a day of slack for time-zone differences. */
function latestAllowedDate(): string {
  const d = parseISODate(todayISO())
  d.setDate(d.getDate() + 1)
  return toISODate(d)
}

export function validateAchievementForm(f: AchievementFormState): AchievementFormErrors {
  const e: AchievementFormErrors = {}
  if (f.eventName.trim().length < 2) e.eventName = 'Enter the event name.'
  else if (f.eventName.trim().length > 200) e.eventName = 'Keep the event name under 200 characters.'
  if (!f.categoryId) e.categoryId = 'Choose the event type.'
  if (!f.startDate) e.startDate = 'Enter the event date.'
  else if (f.startDate > latestAllowedDate()) e.startDate = "This date is in the future — certificates are for events that have already happened."
  if (f.endDate) {
    if (!f.startDate) e.endDate = 'Enter the start date first.'
    else if (f.endDate < f.startDate) e.endDate = 'The end date can’t be before the start date.'
  }
  if (f.organization.length > 200) e.organization = 'Keep this under 200 characters.'
  if (f.result.length > 200) e.result = 'Keep this under 200 characters.'
  if (f.description.length > 2000) e.description = 'Keep the description under 2000 characters.'
  return e
}

export function formToInput(f: AchievementFormState): AchievementInput {
  return {
    category_id: f.categoryId,
    event_name: f.eventName,
    organization: f.organization || null,
    start_date: f.startDate,
    end_date: f.endDate || null,
    result: f.result || null,
    description: f.description || null,
  }
}

export function achievementToForm(a: Achievement): AchievementFormState {
  return {
    categoryId: a.category_id,
    eventName: a.event_name,
    organization: a.organization ?? '',
    startDate: a.start_date,
    endDate: a.end_date ?? '',
    result: a.result ?? '',
    description: a.description ?? '',
  }
}

/** Maps what the reader found onto form fields. Unknown event types are left for the student to pick. */
export function formFromScan(fields: ExtractedFields, categories: EventCategory[]): Partial<AchievementFormState> {
  const patch: Partial<AchievementFormState> = {}
  if (fields.eventName) patch.eventName = fields.eventName
  if (fields.organization) patch.organization = fields.organization
  if (fields.startDate) patch.startDate = fields.startDate
  if (fields.endDate) patch.endDate = fields.endDate
  if (fields.result) patch.result = fields.result
  if (fields.certificateType) {
    const match = categories.find((c) => c.slug === fields.certificateType)
    if (match) patch.categoryId = match.id
  }
  return patch
}

/** Required fields the reader did not manage to fill. */
export function missingRequired(f: AchievementFormState): (keyof AchievementFormState)[] {
  const missing: (keyof AchievementFormState)[] = []
  if (!f.eventName.trim()) missing.push('eventName')
  if (!f.categoryId) missing.push('categoryId')
  if (!f.startDate) missing.push('startDate')
  return missing
}
