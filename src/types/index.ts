// Hand-written domain types mirroring supabase/migrations. Services own the
// mapping from PostgREST rows to these shapes.

export type Role = 'student' | 'faculty' | 'admin'

export type AchievementStatus =
  | 'draft'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'changes_requested'

export type OdStatus = 'pending' | 'approved' | 'rejected' | 'more_info'

export interface Department {
  id: string
  code: string
  name: string
  is_active: boolean
}

export interface EventCategory {
  id: string
  slug: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

export interface Profile {
  id: string
  role: Role
  full_name: string
  /** Everyone signs in with `username`; the internal login address derived from it is never exposed. */
  username: string
  /** Only accounts created before usernames existed keep a real e-mail here; new accounts have none. */
  email: string | null
  register_number: string | null
  faculty_id: string | null
  department_id: string | null
  year: number | null
  section: string | null
  designation: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  department?: Pick<Department, 'id' | 'code' | 'name'> | null
}

export interface Certificate {
  id: string
  achievement_id: string
  student_id: string
  storage_path: string
  file_name: string
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png'
  size_bytes: number
  file_hash: string | null
  ocr_data: Record<string, unknown> | null
  created_at: string
}

export interface Achievement {
  id: string
  student_id: string
  category_id: string
  event_name: string
  organization: string | null
  start_date: string
  end_date: string | null
  result: string | null
  description: string | null
  status: AchievementStatus
  submitted_at: string | null
  reviewed_at: string | null
  review_comment: string | null
  created_at: string
  category: Pick<EventCategory, 'id' | 'slug' | 'name'>
  certificate: Certificate | null
  verification_code: string | null
  od_request: Pick<OdRequest, 'id' | 'status'> | null
}

/** Flat row from the `achievement_details` view (used for lists, search, reports). */
export interface AchievementDetail {
  id: string
  student_id: string
  category_id: string
  event_name: string
  organization: string | null
  start_date: string
  end_date: string | null
  result: string | null
  description: string | null
  status: AchievementStatus
  submitted_at: string | null
  reviewed_at: string | null
  review_comment: string | null
  created_at: string
  student_name: string
  register_number: string | null
  student_year: number | null
  student_section: string | null
  department_id: string | null
  department_name: string | null
  department_code: string | null
  category_name: string
  category_slug: string
  verification_code: string | null
  verified_at: string | null
  od_status: OdStatus | null
}

export interface OdRequest {
  id: string
  student_id: string
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
  status: OdStatus
  reviewed_at: string | null
  review_comment: string | null
  created_at: string
  updated_at: string
}

/** Flat row from the `od_details` view. */
export interface OdDetail {
  id: string
  student_id: string
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
  status: OdStatus
  reviewed_at: string | null
  review_comment: string | null
  created_at: string
  updated_at: string
  student_name: string
  register_number: string | null
  student_year: number | null
  department_id: string | null
  department_name: string | null
  category_name: string
  achievement_status: AchievementStatus
}

/** Row from the `student_summaries` view. */
export interface StudentSummary {
  id: string
  full_name: string
  username: string
  register_number: string | null
  year: number | null
  section: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  department_id: string | null
  department_name: string | null
  department_code: string | null
  created_at: string
  total_achievements: number
  verified_achievements: number
  pending_achievements: number
  total_ods: number
  approved_ods: number
}

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  message: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export interface PublicVerification {
  verification_code: string
  verified_at: string
  student_name: string
  department: string | null
  event_name: string
  category: string
  organization: string | null
  result: string | null
  start_date: string
  end_date: string | null
  institution: string | null
}

export interface PublicSettings {
  institution_name?: string
  allow_student_registration?: boolean
}

export interface ReviewStats {
  pending_certificates: number
  pending_ods: number
  verified_today: number
  verified_total: number
  rejected: number
  total_students: number
  total_faculty: number
  total_achievements: number
  total_ods: number
  approved_ods: number
  rejected_ods: number
}

export interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor?: { full_name: string } | null
}
