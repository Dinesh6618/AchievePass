import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Search, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { VerifiedStamp } from '@/components/brand/VerifiedStamp'
import { Alert, Button, ErrorState, Skeleton, TextField } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateRange, formatDateTime } from '@/lib/dates'
import { getPublicVerification } from '@/services/verificationService'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <Link to="/" aria-label="CertiPass home">
          <Logo />
        </Link>
        <Link to="/login" className="text-sm font-medium text-ink-600 hover:text-ink-900">
          Sign in
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-5 pb-16 pt-4">
        {children}
      </main>
    </div>
  )
}

/** /verify — type or paste an ID when you don't have the QR to hand. */
export function VerifyLookupPage() {
  useDocumentTitle('Verify an achievement')
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const clean = code.trim().toUpperCase()
    if (clean) navigate(`/verify/${encodeURIComponent(clean)}`)
  }

  return (
    <Shell>
      <div className="card p-6 sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-gold-50 text-gold-600">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold">Verify an achievement</h1>
        <p className="mt-1 text-sm text-ink-500">
          Scan the QR code on a CertiPass record, or enter the verification ID printed beneath it.
        </p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            wrapperClassName="flex-1"
            label="Verification ID"
            placeholder="CP-2026-XXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <Button type="submit" size="md" icon={<Search className="size-4" aria-hidden />} className="sm:mb-[1px]">
            Check
          </Button>
        </form>
      </div>
    </Shell>
  )
}

/** /verify/:code — what the QR code opens. Shows only information that is safe to share publicly. */
export default function VerifyPage() {
  const { code = '' } = useParams()
  const clean = decodeURIComponent(code).trim().toUpperCase()
  useDocumentTitle(`Verify ${clean}`)
  const result = useAsync(() => getPublicVerification(clean), [clean], { context: 'public verification' })
  const v = result.data

  return (
    <Shell>
      {result.loading && !v ? (
        <div className="card space-y-4 p-8" role="status" aria-label="Checking record">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : result.error ? (
        <ErrorState message={result.error} onRetry={result.reload} />
      ) : v ? (
        <article className="card overflow-hidden" aria-labelledby="verify-heading">
          <div className="flex items-center justify-between gap-4 border-b border-verified-600/20 bg-verified-50 px-6 py-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-verified-700">CertiPass verified</p>
              <h1 id="verify-heading" className="mt-1 text-2xl font-semibold text-verified-700">
                ✓ Verified achievement
              </h1>
            </div>
            <VerifiedStamp className="size-20 shrink-0" />
          </div>

          <dl className="grid gap-x-8 gap-y-5 px-6 py-6 sm:grid-cols-2">
            <Item label="Student" value={v.student_name} big />
            <Item label="Event" value={v.event_name} big />
            <Item label="Type" value={v.category} />
            <Item label="Achievement" value={v.result ?? 'Participation'} />
            <Item label="Date" value={formatDateRange(v.start_date, v.end_date)} />
            <Item label="Organization" value={v.organization} />
            <Item label="Department" value={v.department} />
            <Item label="Verified by" value={v.institution ?? 'Institution'} />
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper-200 bg-paper/60 px-6 py-4 text-sm">
            <p className="text-ink-500">Verified on {formatDateTime(v.verified_at)}</p>
            <p>
              <span className="text-ink-500">Verification ID </span>
              <span className="font-mono font-semibold tracking-wider text-ink-900">{v.verification_code}</span>
            </p>
          </div>
        </article>
      ) : (
        <div className="space-y-5">
          <div className="card flex flex-col items-center px-6 py-10 text-center">
            <VerifiedStamp tone="invalid" label="NOT VERIFIED" className="size-24" />
            <h1 className="mt-5 text-2xl font-semibold">We couldn't verify this record</h1>
            <p className="mt-2 max-w-md text-sm text-ink-500">
              No verified achievement matches <span className="font-mono font-semibold">{clean || 'this ID'}</span>. Check
              the ID for typing mistakes, or ask the student to share their QR again.
            </p>
            <Link to="/verify" className="mt-6 text-sm font-semibold text-ink-900 underline underline-offset-4">
              Try another ID
            </Link>
          </div>
          <Alert tone="info">Only achievements verified by faculty on CertiPass appear here.</Alert>
        </div>
      )}
      <p className="mt-6 text-center text-xs text-ink-400">
        This page shows only public details. Contact information and internal notes are never shared.
      </p>
    </Shell>
  )
}

function Item({ label, value, big }: { label: string; value: string | null | undefined; big?: boolean }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className={big ? 'mt-0.5 font-display text-xl font-semibold text-ink-900' : 'mt-0.5 text-base text-ink-900'}>
        {value}
      </dd>
    </div>
  )
}
