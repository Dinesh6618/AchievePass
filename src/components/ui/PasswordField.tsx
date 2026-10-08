import { useId, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string | null
  hint?: string
}

export function PasswordField({ label, error, hint, className, id: idProp, required, ...props }: PasswordFieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const [visible, setVisible] = useState(false)
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
        {required && (
          <span className="ml-0.5 text-rejected-600" aria-hidden>
            *
          </span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'block h-10 w-full rounded-md border bg-white pl-3 pr-10 text-sm text-ink-900 placeholder:text-ink-300',
            'focus:border-ink-700 focus:outline-none focus:ring-2 focus:ring-gold-500/40',
            error ? 'border-rejected-600' : 'border-paper-300',
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-400 hover:text-ink-700"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
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
