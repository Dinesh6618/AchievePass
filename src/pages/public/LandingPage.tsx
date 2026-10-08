import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Award,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  QrCode,
  ScanText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { homePathFor, useAuth } from '@/contexts/AuthContext'
import { Logo } from '@/components/brand/Logo'
import { VerifiedStamp } from '@/components/brand/VerifiedStamp'
import { LinkButton } from '@/components/ui'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FileUp, title: 'Upload', text: 'Drop in the certificate — PDF, JPG or PNG.' },
  { icon: ScanText, title: 'Smart scan', text: 'Name, event, date and result are read for you.' },
  { icon: ClipboardCheck, title: 'Confirm & request OD', text: 'Check the details and ask for OD in one flow.' },
  { icon: ShieldCheck, title: 'Faculty verify', text: 'Your department reviews the certificate and OD.' },
  { icon: QrCode, title: 'QR record', text: 'A verified record anyone can check in seconds.' },
]

const SAMPLE = [
  { label: 'Hackathon', title: 'VMEDITHON V3.0', result: 'Finalist', date: '17 Sep 2026', verified: true },
  { label: 'Workshop', title: 'Cloud Computing with AWS', result: 'Participant', date: '12–13 Mar 2026', verified: true },
  { label: 'Internship', title: 'Summer Research Intern', result: 'Completed', date: '5 May 2026', verified: false },
]

export default function LandingPage() {
  useDocumentTitle('')
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link to="/verify" className="hidden rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 sm:block">
            Verify a record
          </Link>
          {profile ? (
            <LinkButton to={homePathFor(profile.role)} size="sm">
              Open my passport
            </LinkButton>
          ) : (
            <>
              <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium text-ink-700 hover:text-ink-900">
                Sign in
              </Link>
              <LinkButton to="/register" size="sm">
                Create passport
              </LinkButton>
            </>
          )}
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">
              Digital Student Achievement Passport
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-[3.4rem]">
              Every event you attend, stamped and on record.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-600">
              Stop sending certificates over WhatsApp and Google Forms. Upload once, request OD in the same step,
              and build a faculty-verified passport you can prove with a QR code.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to="/register" size="lg" icon={<GraduationCap className="size-5" aria-hidden />}>
                Start my passport
              </LinkButton>
              <LinkButton to="/faculty/login" size="lg" variant="secondary" icon={<ShieldCheck className="size-5" aria-hidden />}>
                Faculty sign in
              </LinkButton>
            </div>
          </div>

          {/* Illustrative passport page — static sample content, not live data */}
          <div className="relative" aria-label="Example of a CertiPass achievement passport">
            <div className="card relative overflow-hidden border-ink-200 bg-white shadow-xl shadow-ink-900/5">
              <div className="flex items-center justify-between bg-ink-900 px-5 py-4 text-white">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold-400">2026 Journey</p>
                  <p className="font-display text-lg font-semibold">Priya Sharma</p>
                </div>
                <div className="text-right text-xs text-ink-200">
                  <p>Passport no.</p>
                  <p className="font-mono tracking-wider">2021CSE042</p>
                </div>
              </div>
              <div className="perforated h-3.5 bg-ink-900/0" aria-hidden />
              <ol className="relative space-y-5 px-5 pb-16 pt-3">
                <span aria-hidden className="absolute bottom-8 left-[27px] top-6 w-px bg-paper-300" />
                {SAMPLE.map((s) => (
                  <li key={s.title} className="relative flex gap-4">
                    <span
                      className={`relative z-10 mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2 bg-white ${s.verified ? 'border-verified-600' : 'border-pending-600'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">{s.label}</p>
                      <p className="font-medium text-ink-900">{s.title}</p>
                      <p className="text-sm text-ink-500">
                        {s.result} · {s.date}
                      </p>
                    </div>
                    <span
                      className={`stamp h-fit shrink-0 ${s.verified ? 'border-verified-600/40 bg-verified-50 text-verified-700' : 'border-pending-600/40 bg-pending-50 text-pending-700'}`}
                    >
                      {s.verified ? 'Verified' : 'Pending'}
                    </span>
                  </li>
                ))}
              </ol>
              <VerifiedStamp className="absolute -bottom-3 -right-3 size-24 opacity-90" />
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="border-y border-paper-200 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 id="how" className="text-2xl font-semibold sm:text-3xl">
              One workflow instead of scattered channels
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-lg border border-paper-200 bg-paper/50 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-ink-900 text-gold-400">
                      <s.icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-xs font-semibold text-ink-400">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-ink-500">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="roles" className="mx-auto max-w-6xl px-5 py-14">
          <h2 id="roles" className="text-2xl font-semibold sm:text-3xl">
            Built for the whole campus
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: GraduationCap,
                role: 'Students',
                text: 'A personal timeline of every hackathon, workshop and internship — with OD requests tracked alongside.',
                to: '/login',
                cta: 'Student sign in',
              },
              {
                icon: ShieldCheck,
                role: 'Faculty',
                text: 'A focused verification queue: read the certificate, tick the checklist, verify or send it back with a reason.',
                to: '/faculty/login',
                cta: 'Faculty sign in',
              },
              {
                icon: Award,
                role: 'Administrators',
                text: 'Department-wide analytics, participation reports with CSV export, and full control of users and categories.',
                to: '/admin/login',
                cta: 'Admin sign in',
              },
            ].map((r) => (
              <div key={r.role} className="card flex flex-col p-6">
                <span className="flex size-10 items-center justify-center rounded-md bg-gold-50 text-gold-600">
                  <r.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{r.role}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-500">{r.text}</p>
                <Link to={r.to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-900 hover:underline">
                  {r.cta} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-ink-900">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-5 py-10 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Checking someone's achievement?</h2>
              <p className="mt-1 text-sm text-ink-200">Scan their QR code, or enter the verification ID.</p>
            </div>
            <LinkButton to="/verify" variant="gold" size="lg" icon={<QrCode className="size-5" aria-hidden />}>
              Verify a record
            </LinkButton>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-8 text-sm text-ink-400">
        © {new Date().getFullYear()} CertiPass · Student Achievement Passport &amp; OD Verification
      </footer>
    </div>
  )
}
