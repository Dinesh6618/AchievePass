import { AlertTriangle, CheckCircle2, CircleHelp, Minus, PencilLine } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import { formatDateRange } from '@/lib/dates'
import type { ExtractedFields, NameCheck } from '@/services/ocr'

interface ScanSummaryProps {
  fields: ExtractedFields
  nameCheck: NameCheck
  profileName: string
  categoryName: string | null
  onConfirm: () => void
  onEdit: () => void
  busy?: boolean
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <dt className="w-32 shrink-0 text-sm text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm font-medium text-ink-900">
        {value ?? <span className="font-normal text-ink-400">Not found on the certificate</span>}
      </dd>
      {value ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verified-600" aria-label="Detected" />
      ) : (
        <Minus className="mt-0.5 size-4 shrink-0 text-ink-300" aria-label="Not detected" />
      )}
    </div>
  )
}

export function NameCheckNotice({ check, extracted, profileName }: { check: NameCheck; extracted: string | null; profileName: string }) {
  switch (check) {
    case 'match':
      return (
        <p className="flex items-center gap-2 text-sm font-medium text-verified-700">
          <CheckCircle2 className="size-4" aria-hidden /> Student name matches
        </p>
      )
    case 'partial':
      return (
        <Alert tone="warning" title="Name only partly matches">
          The certificate says “{extracted ?? '…'}” and your profile says “{profileName}”. Faculty will see this comparison.
        </Alert>
      )
    case 'mismatch':
      return (
        <Alert tone="warning" title="⚠ Name does not match">
          {extracted ? <>The certificate says “{extracted}”, but your profile name is “{profileName}”.</> : <>We couldn't find “{profileName}” on this certificate.</>}{' '}
          Make sure this is your own certificate — faculty will see this warning.
        </Alert>
      )
    default:
      return (
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <CircleHelp className="size-4" aria-hidden /> We couldn't find a student name to compare with your profile.
        </p>
      )
  }
}

/** "CERTIFICATE DETECTED" — what the reader found, with a name check, before the student confirms. */
export function ScanSummary({ fields, nameCheck, profileName, categoryName, onConfirm, onEdit, busy }: ScanSummaryProps) {
  return (
    <section aria-labelledby="detected-heading" className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-verified-600/20 bg-verified-50 px-5 py-3">
        <CheckCircle2 className="size-5 text-verified-700" aria-hidden />
        <h2 id="detected-heading" className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-verified-700">
          Certificate detected
        </h2>
      </div>

      <dl className="divide-y divide-paper-100 px-5">
        <Row label="Student name" value={fields.studentName} />
        <Row label="Event" value={fields.eventName} />
        <Row label="Date" value={fields.startDate ? formatDateRange(fields.startDate, fields.endDate) : null} />
        <Row label="Achievement" value={fields.result} />
        <Row label="Organization" value={fields.organization} />
        <Row label="Certificate type" value={categoryName} />
      </dl>

      <div className="space-y-4 border-t border-paper-200 px-5 py-4">
        <NameCheckNotice check={nameCheck} extracted={fields.studentName} profileName={profileName} />
        <p className="flex items-start gap-2 text-sm text-ink-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-pending-600" aria-hidden />
          Please verify the extracted information. Automatic reading can make mistakes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onConfirm} loading={busy} icon={<CheckCircle2 className="size-4" aria-hidden />}>
            Confirm &amp; Continue
          </Button>
          <Button variant="secondary" onClick={onEdit} icon={<PencilLine className="size-4" aria-hidden />}>
            Edit Details
          </Button>
        </div>
      </div>
    </section>
  )
}
