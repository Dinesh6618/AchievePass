import {
  BadgeCheck,
  Bell,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

interface Meta {
  icon: LucideIcon
  tone: string
}

const META: Record<string, Meta> = {
  achievement_submitted: { icon: FileCheck2, tone: 'bg-info-50 text-info-700' },
  achievement_verified: { icon: BadgeCheck, tone: 'bg-verified-50 text-verified-700' },
  achievement_rejected: { icon: XCircle, tone: 'bg-rejected-50 text-rejected-700' },
  achievement_changes_requested: { icon: CircleHelp, tone: 'bg-info-50 text-info-700' },
  od_submitted: { icon: ClipboardList, tone: 'bg-info-50 text-info-700' },
  od_approved: { icon: ClipboardCheck, tone: 'bg-verified-50 text-verified-700' },
  od_rejected: { icon: XCircle, tone: 'bg-rejected-50 text-rejected-700' },
  od_more_info: { icon: CircleHelp, tone: 'bg-info-50 text-info-700' },
  review_requested: { icon: ClipboardCheck, tone: 'bg-pending-50 text-pending-700' },
}

export function notificationMeta(type: string): Meta {
  return META[type] ?? { icon: Bell, tone: 'bg-ink-50 text-ink-600' }
}
