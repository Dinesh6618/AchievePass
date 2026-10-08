import { CheckCircle2, CircleDashed, Clock, HelpCircle, XCircle, type LucideIcon } from 'lucide-react'
import type { AchievementStatus, OdStatus } from '@/types'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'pending' | 'verified' | 'rejected' | 'info'

const toneClasses: Record<Tone, string> = {
  neutral: 'border-paper-300 bg-paper-100 text-ink-600',
  pending: 'border-pending-600/40 bg-pending-50 text-pending-700',
  verified: 'border-verified-600/40 bg-verified-50 text-verified-700',
  rejected: 'border-rejected-600/40 bg-rejected-50 text-rejected-700',
  info: 'border-info-600/40 bg-info-50 text-info-700',
}

export const ACHIEVEMENT_STATUS: Record<AchievementStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: CircleDashed },
  pending: { label: 'Pending Verification', tone: 'pending', icon: Clock },
  verified: { label: 'Verified', tone: 'verified', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'rejected', icon: XCircle },
  changes_requested: { label: 'Changes Requested', tone: 'info', icon: HelpCircle },
}

export const OD_STATUS: Record<OdStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  pending: { label: 'Pending', tone: 'pending', icon: Clock },
  approved: { label: 'Approved', tone: 'verified', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'rejected', icon: XCircle },
  more_info: { label: 'More Info Required', tone: 'info', icon: HelpCircle },
}

interface BadgeProps {
  className?: string
  compact?: boolean
}

export function AchievementStatusBadge({ status, className, compact }: BadgeProps & { status: AchievementStatus }) {
  const s = ACHIEVEMENT_STATUS[status]
  return (
    <span className={cn('stamp', toneClasses[s.tone], className)}>
      <s.icon className="size-3" aria-hidden />
      {compact ? s.label.split(' ')[0] : s.label}
    </span>
  )
}

export function OdStatusBadge({ status, className }: BadgeProps & { status: OdStatus }) {
  const s = OD_STATUS[status]
  return (
    <span className={cn('stamp', toneClasses[s.tone], className)}>
      <s.icon className="size-3" aria-hidden />
      {s.label}
    </span>
  )
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-ink-50 px-2.5 py-0.5 text-xs font-medium text-ink-700',
        className,
      )}
    >
      {children}
    </span>
  )
}
