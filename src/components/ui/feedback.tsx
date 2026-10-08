import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className={cn('size-5 animate-spin text-ink-500', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-paper-200', className)} />
}

export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-6 w-24 sm:block" />
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed border-paper-300 bg-white/60 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-gold-50 text-gold-600">
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const alertStyles = {
  error: { box: 'border-rejected-600/30 bg-rejected-50 text-rejected-700', icon: XCircle },
  warning: { box: 'border-pending-600/30 bg-pending-50 text-pending-700', icon: AlertTriangle },
  info: { box: 'border-info-600/30 bg-info-50 text-info-700', icon: Info },
  success: { box: 'border-verified-600/30 bg-verified-50 text-verified-700', icon: CheckCircle2 },
} as const

interface AlertProps {
  tone?: keyof typeof alertStyles
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const s = alertStyles[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', s.box, className)}
    >
      <s.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action}
    </div>
  )
}

/** Standard "could not load" block with a retry button. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      tone="error"
      title="We couldn't load this"
      action={
        onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {message}
    </Alert>
  )
}
