import type { Role } from '@/types'

/** Role-aware links, so shared components can link to the right screen for whoever is viewing. */
export const paths = {
  /** The detail / review screen for one achievement. */
  achievement(role: Role, id: string): string {
    if (role === 'student') return `/student/achievements/${id}`
    return role === 'faculty' ? `/faculty/review/${id}` : `/admin/achievements/${id}`
  },
  od(role: Role, id: string): string {
    return `/${role}/od/${id}`
  },
  student(role: Role, id: string): string {
    return `/${role}/students/${id}`
  },
}
