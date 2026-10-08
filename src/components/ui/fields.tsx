import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Width is deliberately not part of the shared control style: form fields add w-full, filter-bar
// controls stay content-sized (two conflicting width utilities are resolved by stylesheet order, not class order).
const control =
  'block rounded-md border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300 ' +
  'transition-colors focus:border-ink-700 focus:outline-none focus:ring-2 focus:ring-gold-500/40 ' +
  'disabled:cursor-not-allowed disabled:bg-paper-100 disabled:text-ink-500 read-only:bg-paper-100'

interface FieldShellProps {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: ReactNode
}

function FieldShell({ id, label, hint, error, required, className, children }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
        {required && (
          <span className="ml-0.5 text-rejected-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-rejected-600">
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id: string, hint: ReactNode, error?: string | null) {
  if (error) return `${id}-error`
  return hint ? `${id}-hint` : undefined
}

interface BaseFieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  wrapperClassName?: string
}

export function TextField({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  required,
  id: idProp,
  ...props
}: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, 'h-10 w-full', error ? 'border-rejected-600' : 'border-paper-300', className)}
        {...props}
      />
    </FieldShell>
  )
}

export function TextAreaField({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  required,
  id: idProp,
  rows = 4,
  ...props
}: BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, 'w-full py-2', error ? 'border-rejected-600' : 'border-paper-300', className)}
        {...props}
      />
    </FieldShell>
  )
}

export function SelectField({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  required,
  id: idProp,
  children,
  ...props
}: BaseFieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId()
  const id = idProp ?? autoId
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, 'h-10 w-full pr-8', error ? 'border-rejected-600' : 'border-paper-300', className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  )
}

/** Compact, label-less controls for filter bars (always give them an aria-label). */
export function FilterSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'h-9 max-w-full border-paper-300 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function FilterInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, 'h-9 max-w-full border-paper-300', className)} {...props} />
}

export function Checkbox({
  label,
  className,
  ...props
}: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-ink-800', className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-paper-300 accent-ink-900"
        {...props}
      />
      <span>{label}</span>
    </label>
  )
}
