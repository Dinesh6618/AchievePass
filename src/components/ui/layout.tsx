import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, initials } from '@/lib/utils'
import { Button } from './Button'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  eyebrow?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

interface TabsProps<T extends string> {
  tabs: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
  label: string
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-paper-200">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-ink-900 text-ink-900'
                : 'border-transparent text-ink-500 hover:border-paper-300 hover:text-ink-800',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  active ? 'bg-ink-900 text-white' : 'bg-paper-200 text-ink-600',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4 text-sm text-ink-500">
      <p>
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
          icon={<ChevronLeft className="size-4" aria-hidden />}
          aria-label="Previous page"
        />
        <span className="tabular-nums">
          {page + 1} / {pages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= pages - 1}
          onClick={() => onChange(page + 1)}
          icon={<ChevronRight className="size-4" aria-hidden />}
          aria-label="Next page"
        />
      </div>
    </nav>
  )
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string | null | undefined
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const dims = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-24 text-2xl' }[size]
  return src ? (
    <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', dims, className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-ink-100 font-semibold text-ink-700',
        dims,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wider text-ink-500">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink-900">{item.value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-paper-200 bg-paper/70 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-500',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b border-paper-100 px-4 py-3 align-middle', className)}>{children}</td>
}
