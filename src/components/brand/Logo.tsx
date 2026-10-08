import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8', className)} aria-hidden>
      <rect x="10" y="4" width="44" height="56" rx="6" className="fill-ink-900" />
      <rect x="15" y="9" width="34" height="46" rx="3" fill="none" className="stroke-gold-500" strokeWidth="2" />
      <circle cx="32" cy="30" r="11" fill="none" className="stroke-gold-500" strokeWidth="3" />
      <path
        d="M26.5 30.5l4 4 7.5-8"
        fill="none"
        className="stroke-paper"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="21" y="46" width="22" height="3" rx="1.5" className="fill-gold-500" />
    </svg>
  )
}

interface LogoProps {
  className?: string
  /** Light text for use on the navy sidebar. */
  inverse?: boolean
  showWordmark?: boolean
}

export function Logo({ className, inverse, showWordmark = true }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className={cn('rounded-lg p-0.5', inverse && 'bg-paper')}>
        <LogoMark />
      </span>
      {showWordmark && (
        <span className={cn('font-display text-xl font-semibold tracking-tight', inverse ? 'text-white' : 'text-ink-900')}>
          CertiPass
        </span>
      )}
    </span>
  )
}
