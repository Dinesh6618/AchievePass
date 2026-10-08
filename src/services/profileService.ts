import { supabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'
import { sanitizeSearchTerm } from '@/lib/utils'
import type { Profile, Role, StudentSummary } from '@/types'
import { unwrap, unwrapMaybe, type Page } from './db'

const PROFILE_SELECT = '*, department:departments(id, code, name)'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  return unwrapMaybe(
    await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle(),
  ) as Profile | null
}

export interface ProfilePatch {
  full_name?: string
  phone?: string | null
  year?: number | null
  section?: string | null
  designation?: string | null
  avatar_url?: string | null
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').update(patch).eq('id', userId).select(PROFILE_SELECT).single(),
  ) as Profile
}

/** Uploads to the public `avatars` bucket (path = <uid>/avatar-<time>.<ext>) and returns its public URL. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
  })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

// ----- directories (faculty / admin) ----------------------------------------

export interface StudentFilters {
  search?: string
  departmentId?: string
  year?: number | null
  page?: number
  pageSize?: number
}

export async function listStudents(filters: StudentFilters = {}): Promise<Page<StudentSummary>> {
  const { search = '', departmentId, year, page = 0, pageSize = 20 } = filters
  let q = supabase
    .from('student_summaries')
    .select('*', { count: 'exact' })
    .order('full_name')
    .range(page * pageSize, page * pageSize + pageSize - 1)

  const term = sanitizeSearchTerm(search)
  if (term) q = q.or(`full_name.ilike.%${term}%,register_number.ilike.%${term}%,username.ilike.%${term}%`)
  if (departmentId) q = q.eq('department_id', departmentId)
  if (year) q = q.eq('year', year)

  const { data, error, count } = await q
  if (error) throw error
  return { rows: (data ?? []) as StudentSummary[], total: count ?? 0 }
}

export async function getStudentSummary(id: string): Promise<StudentSummary | null> {
  return unwrapMaybe(
    await supabase.from('student_summaries').select('*').eq('id', id).maybeSingle(),
  ) as StudentSummary | null
}

export async function listFaculty(filters: { search?: string; departmentId?: string } = {}): Promise<Profile[]> {
  let q = supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('role', 'faculty' satisfies Role)
    .order('full_name')
  const term = sanitizeSearchTerm(filters.search ?? '')
  if (term) q = q.or(`full_name.ilike.%${term}%,faculty_id.ilike.%${term}%,email.ilike.%${term}%`)
  if (filters.departmentId) q = q.eq('department_id', filters.departmentId)
  return unwrap(await q) as Profile[]
}

export interface AdminProfilePatch {
  full_name?: string
  department_id?: string | null
  year?: number | null
  section?: string | null
  designation?: string | null
  phone?: string | null
  register_number?: string | null
  faculty_id?: string | null
  is_active?: boolean
}

export async function adminUpdateProfile(userId: string, patch: AdminProfilePatch) {
  unwrap(await supabase.from('profiles').update(patch).eq('id', userId).select('id').single())
}

export interface NewAccountInput {
  role: Role
  /** staff only — students have no e-mail, they get a username */
  email?: string
  /** students only */
  username?: string
  password: string
  fullName: string
  departmentId?: string
  registerNumber?: string
  year?: number
  section?: string
  facultyId?: string
  designation?: string
}

/**
 * Account creation needs the service role key, which must never reach the browser, so it
 * runs in the `admin-create-user` edge function (which re-checks that the caller is an admin).
 */
export async function adminCreateAccount(input: NewAccountInput): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: input })
  if (error) {
    // Edge function errors carry a JSON body with a user-facing message.
    const context = (error as { context?: Response }).context
    let message: string | undefined
    if (context && typeof context.json === 'function') {
      try {
        message = ((await context.json()) as { error?: string }).error
      } catch {
        // body was not JSON — fall through to the generic error
      }
    }
    if (message) throw new AppError(message)
    throw error
  }
  return data as { id: string }
}
