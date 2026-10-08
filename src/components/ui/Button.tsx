import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'gold'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300',
  secondary: 'border border-paper-300 bg-white text-ink-900 hover:bg-paper-100 disabled:text-ink-300',
  ghost: 'text-ink-700 hover:bg-paper-100 disabled:text-ink-300',
  danger: 'bg-rejected-600 text-white hover:bg-rejected-700 disabled:bg-rejected-600/40',
  success: 'bg-verified-600 text-white hover:bg-verified-700 disabled:bg-verified-600/40',
  gold: 'bg-gold-500 text-ink-950 hover:bg-gold-400 disabled:bg-gold-100 disabled:text-gold-700',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
}

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center rounded-md font-medium transition-colors',
    'disabled:cursor-not-allowed aria-disabled:pointer-events-none aria-disabled:opacity-60',
    variants[variant],
    sizes[size],
    extra,
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface AnchorButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

/** A plain <a> (external URL, file download) that looks like a button. */
export function AnchorButton({ variant = 'secondary', size = 'sm', icon, className, children, ...props }: AnchorButtonProps) {
  return (
    <a className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </a>
  )
}

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

export function LinkButton({ variant = 'primary', size = 'md', icon, className, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  )
}
