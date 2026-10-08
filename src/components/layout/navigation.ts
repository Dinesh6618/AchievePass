import {
  Award,
  Bell,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  PlusCircle,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match the path exactly (for index routes). */
  end?: boolean
  /** Highlight as the primary call to action. */
  accent?: boolean
}

export const NAV: Record<Role, NavItem[]> = {
  student: [
    { to: '/student', label: 'My Passport', icon: IdCard, end: true },
    { to: '/student/achievements', label: 'Achievements', icon: Award, end: true },
    { to: '/student/achievements/new', label: 'Add Achievement', icon: PlusCircle, accent: true },
    { to: '/student/od', label: 'OD Requests', icon: ClipboardList },
    { to: '/student/calendar', label: 'OD Calendar', icon: CalendarDays },
    { to: '/student/notifications', label: 'Notifications', icon: Bell },
    { to: '/student/profile', label: 'Profile', icon: UserRound },
  ],
  faculty: [
    { to: '/faculty', label: 'Verification Center', icon: ShieldCheck, end: true },
    { to: '/faculty/od', label: 'OD Requests', icon: ClipboardCheck },
    { to: '/faculty/students', label: 'Students', icon: GraduationCap },
    { to: '/faculty/achievements', label: 'Achievements', icon: Award },
    { to: '/faculty/reports', label: 'Reports', icon: FileBarChart },
    { to: '/faculty/notifications', label: 'Notifications', icon: Bell },
    { to: '/faculty/profile', label: 'Profile', icon: UserRound },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/students', label: 'Students', icon: GraduationCap },
    { to: '/admin/faculty', label: 'Faculty', icon: Users },
    { to: '/admin/achievements', label: 'Achievements', icon: Award },
    { to: '/admin/od', label: 'OD Management', icon: ClipboardList },
    { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
}

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  faculty: 'Faculty',
  admin: 'Administrator',
}
