import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Award, FileCheck2, QrCode } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'

interface AuthLayoutProps {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Small label above the title, e.g. "Faculty sign in" */
  eyebrow?: string
  wide?: boolean
}

const POINTS = [
  { icon: FileCheck2, text: 'Upload a certificate once — we read the details for you.' },
  { icon: Award, text: 'Build a verified achievement passport faculty can trust.' },
  { icon: QrCode, text: 'Share a QR record anyone can check in seconds.' },
]

/** Split layout: navy "passport cover" on the left (desktop only), form on the right. */
export function AuthLayout({ title, subtitle, children, footer, eyebrow, wide }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-ink-100 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border border-gold-500/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full border border-gold-500/20"
        />
        <Link to="/" aria-label="CertiPass home">
          <Logo inverse />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">Student Achievement Passport</p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-white">
            Every event you attend, stamped and on record.
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-start gap-3 text-sm text-ink-200">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-gold-400">
                  <p.icon className="size-4" aria-hidden />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-400">© {new Date().getFullYear()} CertiPass</p>
      </aside>

      <main id="main" className="flex flex-col bg-paper px-5 py-8 sm:px-10">
        <Link to="/" className="mb-8 self-start lg:hidden" aria-label="CertiPass home">
          <Logo />
        </Link>
        <div className={`m-auto w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          {eyebrow && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">{eyebrow}</p>
          )}
          <h1 className="text-3xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-ink-500">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
