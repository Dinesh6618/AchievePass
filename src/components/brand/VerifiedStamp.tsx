import { useId } from 'react'
import { cn } from '@/lib/utils'

interface VerifiedStampProps {
  className?: string
  /** Text around the ring */
  label?: string
  tone?: 'verified' | 'invalid'
}

/** A circular passport-style stamp. Static on purpose — no animation needed to feel official. */
export function VerifiedStamp({ className, label = 'CERTIPASS VERIFIED', tone = 'verified' }: VerifiedStampProps) {
  const id = useId()
  const color = tone === 'verified' ? 'text-verified-600' : 'text-rejected-600'
  return (
    <svg viewBox="0 0 120 120" className={cn('size-24 -rotate-6', color, className)} role="img" aria-label={label}>
      <defs>
        <path id={`${id}-ring`} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx="60" cy="60" r="32" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fill="currentColor" fontSize="10.5" fontWeight="700" letterSpacing="3.2" fontFamily="Inter, sans-serif">
        <textPath href={`#${id}-ring`} startOffset="0">
          {label} · {label} ·
        </textPath>
      </text>
      {tone === 'verified' ? (
        <path d="M44 60l11 11 21-23" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M47 47l26 26M73 47L47 73" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      )}
    </svg>
  )
}
