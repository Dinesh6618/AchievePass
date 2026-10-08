import { fetchPublicSettings } from '@/services/authService'
import { listCategories, listDepartments } from '@/services/referenceService'
import type { Department, EventCategory, PublicSettings } from '@/types'
import { useAsync } from './useAsync'

// Reference data changes rarely, so each list is fetched once per page load and shared.
// Admin screens call invalidateReferenceData() after editing so the next read is fresh.
const cache: {
  categories?: Promise<EventCategory[]>
  departments?: Promise<Department[]>
  settings?: Promise<PublicSettings>
} = {}

function cached<K extends keyof typeof cache>(key: K, load: () => NonNullable<(typeof cache)[K]>) {
  const hit = cache[key]
  if (hit) return hit as NonNullable<(typeof cache)[K]>
  const promise = load()
  // Don't cache failures — a retry should hit the network again.
  promise.catch(() => {
    delete cache[key]
  })
  cache[key] = promise as (typeof cache)[K]
  return promise
}

export function invalidateReferenceData() {
  delete cache.categories
  delete cache.departments
  delete cache.settings
}

export function useCategories() {
  return useAsync(() => cached('categories', () => listCategories()), [], { context: 'categories' })
}

export function useDepartments() {
  return useAsync(() => cached('departments', () => listDepartments()), [], { context: 'departments' })
}

export function usePublicSettings() {
  return useAsync(() => cached('settings', () => fetchPublicSettings()), [], { context: 'settings' })
}
