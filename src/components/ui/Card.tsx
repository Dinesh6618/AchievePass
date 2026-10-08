import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />
}

interface SectionCardProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function SectionCard({ title, description, action, children, className, bodyClassName }: SectionCardProps) {
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </Card>
  )
}

const tones = {
  ink: 'bg-ink-50 text-ink-700',
  gold: 'bg-gold-50 text-gold-700',
  verified: 'bg-verified-50 text-verified-700',
  pending: 'bg-pending-50 text-pending-700',
  rejected: 'bg-rejected-50 text-rejected-700',
  info: 'bg-info-50 text-info-700',
} as const

export type Tone = keyof typeof tones

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: LucideIcon
  tone?: Tone
  hint?: ReactNode
  to?: string
}

export function StatCard({ label, value, icon: Icon, tone = 'ink', hint, to }: StatCardProps) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500 sm:text-xs">{label}</p>
        <p className="mt-1.5 font-display text-3xl font-semibold tabular-nums text-ink-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      </div>
      {Icon && (
        // decorative: dropped on phones so the label gets the whole tile width
        <span className={cn('hidden size-9 shrink-0 items-center justify-center rounded-md sm:flex', tones[tone])}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
      )}
    </div>
  )
  const classes = 'card block p-4'
  return to ? (
    <Link to={to} className={cn(classes, 'transition-colors hover:border-ink-300')}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}
