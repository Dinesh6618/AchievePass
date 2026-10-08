import { describe, expect, it } from 'vitest'
import { toISODate } from '@/lib/dates'
import { EMPTY_FORM, formFromScan, formToInput, missingRequired, validateAchievementForm } from './achievementForm'

const valid = { ...EMPTY_FORM, categoryId: 'c1', eventName: 'VMEDITHON V3.0', startDate: '2026-01-10' }

describe('validateAchievementForm', () => {
  it('accepts the minimum valid form', () => {
    expect(validateAchievementForm(valid)).toEqual({})
  })

  it('requires name, type and date', () => {
    const errors = validateAchievementForm(EMPTY_FORM)
    expect(Object.keys(errors).sort()).toEqual(['categoryId', 'eventName', 'startDate'])
    expect(missingRequired(EMPTY_FORM)).toEqual(['eventName', 'categoryId', 'startDate'])
  })

  it('rejects an end date before the start date and dates in the future', () => {
    expect(validateAchievementForm({ ...valid, endDate: '2026-01-09' }).endDate).toBeTruthy()
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    expect(validateAchievementForm({ ...valid, startDate: toISODate(nextWeek) }).startDate).toMatch(/future/)
  })
})

describe('formFromScan', () => {
  const categories = [
    { id: 'c-h', slug: 'hackathon', name: 'Hackathon', description: null, sort_order: 1, is_active: true },
  ]
  it('maps scanned fields and resolves the category slug to an id', () => {
    const patch = formFromScan(
      {
        studentName: 'Dinesh', eventName: 'VMEDITHON V3.0', organization: 'XYZ', startDate: '2026-09-17',
        endDate: null, result: 'Finalist', certificateType: 'hackathon',
      },
      categories,
    )
    expect(patch).toEqual({
      eventName: 'VMEDITHON V3.0', organization: 'XYZ', startDate: '2026-09-17', result: 'Finalist', categoryId: 'c-h',
    })
  })

  it('leaves the category empty when the detected type is not configured', () => {
    expect(formFromScan({ ...nullFields(), certificateType: 'robotics' }, categories).categoryId).toBeUndefined()
  })
})

describe('formToInput', () => {
  it('turns blanks into nulls', () => {
    expect(formToInput(valid)).toMatchObject({ organization: null, end_date: null, result: null, description: null })
  })
})

function nullFields() {
  return { studentName: null, eventName: null, organization: null, startDate: null, endDate: null, result: null, certificateType: null }
}
