import { supabase } from '@/lib/supabase'
import type { Department, EventCategory } from '@/types'
import { unwrap } from './db'

export async function listDepartments(includeInactive = false): Promise<Department[]> {
  let q = supabase.from('departments').select('id, code, name, is_active').order('name')
  if (!includeInactive) q = q.eq('is_active', true)
  return unwrap(await q) as Department[]
}

export async function listCategories(includeInactive = false): Promise<EventCategory[]> {
  let q = supabase
    .from('event_categories')
    .select('id, slug, name, description, sort_order, is_active')
    .order('sort_order')
  if (!includeInactive) q = q.eq('is_active', true)
  return unwrap(await q) as EventCategory[]
}

// ----- admin CRUD ---------------------------------------------------------

export async function saveDepartment(input: { id?: string; code: string; name: string; is_active: boolean }) {
  const payload = { code: input.code.trim().toUpperCase(), name: input.name.trim(), is_active: input.is_active }
  if (input.id) {
    unwrap(await supabase.from('departments').update(payload).eq('id', input.id).select('id').single())
  } else {
    unwrap(await supabase.from('departments').insert(payload).select('id').single())
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function saveCategory(input: {
  id?: string
  name: string
  description: string
  sort_order: number
  is_active: boolean
}) {
  const payload = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    sort_order: input.sort_order,
    is_active: input.is_active,
  }
  if (input.id) {
    unwrap(await supabase.from('event_categories').update(payload).eq('id', input.id).select('id').single())
  } else {
    unwrap(
      await supabase
        .from('event_categories')
        .insert({ ...payload, slug: slugify(payload.name) })
        .select('id')
        .single(),
    )
  }
}
