import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, ShieldCheck } from 'lucide-react'
import { CertificateViewer } from '@/components/certificates/CertificateViewer'
import { ReviewActions } from '@/components/review/ReviewActions'
import {
  AchievementStatusBadge,
  Alert,
  Checkbox,
  DescriptionList,
  EmptyState,
  ErrorState,
  LinkButton,
  OdStatusBadge,
  SectionCard,
  Skeleton,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate, formatDateRange, formatDateTime } from '@/lib/dates'
import { nameSimilarity } from '@/lib/similarity'
import { getAchievementDetail, getCertificateFor } from '@/services/achievementService'
import { getOdByAchievement } from '@/services/odService'
import type { Certificate } from '@/types'

interface OcrData {
  provider?: string | null
  extracted?: {
    studentName?: string | null
    eventName?: string | null
    organization?: string | null
    startDate?: string | null
    result?: string | null
  } | null
  name_check?: 'match' | 'partial' | 'mismatch' | 'unknown' | null
  manual_entry?: boolean
}

const CHECKLIST = [
  { key: 'name', label: 'Student name matches' },
  { key: 'event', label: 'Event information available' },
  { key: 'date', label: 'Date available' },
  { key: 'readable', label: 'Certificate readable' },
] as const
type CheckKey = (typeof CHECKLIST)[number]['key']

function ScanComparison({ ocr, submitted }: { ocr: OcrData; submitted: { eventName: string; organization: string | null; startDate: string; result: string | null } }) {
  const x = ocr.extracted
  if (!x) {
    return <p className="text-sm text-ink-500">The student entered these details manually — nothing was read automatically.</p>
  }
  const rows: { label: string; read: string | null | undefined; given: string | null; same: boolean }[] = [
    { label: 'Event', read: x.eventName, given: submitted.eventName, same: Boolean(x.eventName) && nameSimilarity(x.eventName!, submitted.eventName) >= 0.85 },
    { label: 'Date', read: x.startDate ? formatDate(x.startDate) : null, given: formatDate(submitted.startDate), same: x.startDate === submitted.startDate },
    { label: 'Result', read: x.result, given: submitted.result, same: Boolean(x.result) && nameSimilarity(x.result!, submitted.result ?? '') >= 0.85 },
    { label: 'Organization', read: x.organization, given: submitted.organization, same: Boolean(x.organization) && nameSimilarity(x.organization!, submitted.organization ?? '') >= 0.85 },
  ]
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-paper-100 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-0.5 py-2">
            <span className="text-ink-500">{r.label}</span>
            <span>
              {r.read ? (
                <>
                  <span className="text-ink-700">{r.read}</span>
                  {!r.same && r.given && (
                    <span className="mt-0.5 block text-pending-700">Student submitted: {r.given}</span>
                  )}
                  {r.same && <span className="ml-2 text-xs font-medium text-verified-700">✓ matches</span>}
                </>
              ) : (
                <span className="text-ink-400">Not detected{r.given ? ` — student entered “${r.given}”` : ''}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-500">Left: what automatic reading found on the file. Differences mean the student edited the value.</p>
    </div>
  )
}

export default function ReviewAchievementPage() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const navigate = useNavigate()
  const isFaculty = profile.role === 'faculty'
  const back = isFaculty ? '/faculty' : '/admin/achievements'

  const detail = useAsync(() => getAchievementDetail(id), [id], { context: 'review detail' })
  const certificate = useAsync(() => getCertificateFor(id), [id], { context: 'review certificate' })
  const od = useAsync(() => getOdByAchievement(id), [id], { context: 'review od' })
  const a = detail.data
  useDocumentTitle(a ? `Review: ${a.event_name}` : 'Review')

  const cert: Certificate | null | undefined = certificate.data
  const ocr = (cert?.ocr_data ?? null) as OcrData | null

  // The checklist pre-ticks what the data already proves; the reviewer confirms the rest.
  const auto = useMemo<Record<CheckKey, boolean>>(
    () => ({
      name: ocr?.name_check === 'match',
      event: Boolean(a?.event_name && a?.category_name),
      date: Boolean(a?.start_date),
      readable: false,
    }),
    [ocr?.name_check, a?.event_name, a?.category_name, a?.start_date],
  )
  const [ticked, setTicked] = useState<Record<CheckKey, boolean>>({ name: false, event: false, date: false, readable: false })
  useEffect(() => setTicked(auto), [auto, id])

  const allTicked = CHECKLIST.every((c) => ticked[c.key])
  const canReview = isFaculty && a?.status === 'pending'

  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />
  if (detail.loading && !a) {
    return (
      <div className="grid gap-6 lg:grid-cols-2" role="status" aria-label="Loading submission">
        <Skeleton className="h-[560px] w-full" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    )
  }
  if (!a) {
    return (
      <EmptyState
        title="Submission not found"
        description="It may have been withdrawn, or it isn’t in your department."
        action={<LinkButton to={back}>Back</LinkButton>}
      />
    )
  }

  const studentPath = `/${profile.role}/students/${a.student_id}`

  return (
    <div className="space-y-6">
      <Link to={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> {isFaculty ? 'Verification Center' : 'Achievements'}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">
            {a.category_name} · {formatDateRange(a.start_date, a.end_date)}
          </p>
          <h1 className="mt-0.5 break-words text-2xl font-semibold sm:text-3xl">{a.event_name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AchievementStatusBadge status={a.status} />
          {od.data && <OdStatusBadge status={od.data.status} />}
        </div>
      </header>

      {a.status === 'verified' && a.verification_code && (
        <Alert tone="success" title={`Verified${a.verified_at ? ` on ${formatDateTime(a.verified_at)}` : ''}`}>
          Verification ID <span className="font-mono font-semibold">{a.verification_code}</span>
          {a.review_comment && <> · “{a.review_comment}”</>}
        </Alert>
      )}
      {(a.status === 'rejected' || a.status === 'changes_requested') && a.review_comment && (
        <Alert tone={a.status === 'rejected' ? 'error' : 'info'} title={a.status === 'rejected' ? 'Rejected' : 'Changes requested'}>
          “{a.review_comment}”{a.reviewed_at && <span className="block text-xs opacity-80">{formatDateTime(a.reviewed_at)}</span>}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: the evidence */}
        <section aria-label="Certificate" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Certificate</h2>
          {certificate.error ? (
            <ErrorState message={certificate.error} onRetry={certificate.reload} />
          ) : certificate.loading && !cert ? (
            <Skeleton className="h-[560px] w-full" />
          ) : cert ? (
            <CertificateViewer path={cert.storage_path} mime={cert.mime_type} name={cert.file_name} />
          ) : (
            <Alert tone="warning" title="No certificate file">This submission has no attached certificate.</Alert>
          )}
        </section>

        {/* RIGHT: the claim */}
        <div className="min-w-0 space-y-6">
          <SectionCard
            title="Student"
            action={
              <Link to={studentPath} className="text-sm font-medium text-ink-600 underline underline-offset-2 hover:text-ink-900">
                Achievement history
              </Link>
            }
          >
            <DescriptionList
              items={[
                { label: 'Name', value: a.student_name },
                { label: 'Register number', value: a.register_number },
                { label: 'Department', value: a.department_name },
                { label: 'Year', value: a.student_year ? `Year ${a.student_year}${a.student_section ? ` · Section ${a.student_section}` : ''}` : null },
              ]}
            />
          </SectionCard>

          <SectionCard title="Achievement">
            <DescriptionList
              items={[
                { label: 'Event', value: a.event_name },
                { label: 'Organization', value: a.organization },
                { label: 'Date', value: formatDateRange(a.start_date, a.end_date) },
                { label: 'Result', value: a.result ?? 'Participation' },
                { label: 'Type', value: a.category_name },
                { label: 'Submitted', value: a.submitted_at ? formatDateTime(a.submitted_at) : null },
              ]}
            />
            {a.description && (
              <div className="mt-4 border-t border-paper-200 pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-500">Description</p>
                <p className="mt-1 whitespace-pre-line text-sm">{a.description}</p>
              </div>
            )}
          </SectionCard>

          {ocr && (
            <SectionCard title="Automatic reading vs. what was submitted">
              {ocr.name_check && (
                <p className="mb-3 text-sm">
                  {ocr.name_check === 'match' && <span className="font-medium text-verified-700">✓ Name on the certificate matches the student’s profile.</span>}
                  {ocr.name_check === 'partial' && <span className="font-medium text-pending-700">⚠ Name only partly matches the student’s profile.</span>}
                  {ocr.name_check === 'mismatch' && <span className="font-medium text-rejected-700">⚠ Name on the certificate does not match the student’s profile.</span>}
                  {ocr.name_check === 'unknown' && <span className="text-ink-500">No student name could be read from the file.</span>}
                  {ocr.extracted?.studentName && ocr.name_check !== 'match' && <> Certificate says “{ocr.extracted.studentName}”.</>}
                </p>
              )}
              <ScanComparison ocr={ocr} submitted={{ eventName: a.event_name, organization: a.organization, startDate: a.start_date, result: a.result }} />
            </SectionCard>
          )}

          {od.data && (
            <SectionCard title="OD request">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-700">
                  {od.data.venue} · {formatDateRange(od.data.event_date, od.data.event_end_date)}
                </p>
                <LinkButton to={`/${profile.role}/od/${od.data.id}`} size="sm" variant="secondary" icon={<ClipboardList className="size-4" aria-hidden />}>
                  Open OD request
                </LinkButton>
              </div>
            </SectionCard>
          )}

          {canReview && (
            <SectionCard title="Verification checklist" description="Confirm each point before verifying.">
              <ul className="space-y-3">
                {CHECKLIST.map((c) => (
                  <li key={c.key}>
                    <Checkbox
                      label={
                        <>
                          {c.label}
                          {auto[c.key] && <span className="ml-2 text-xs text-verified-700">auto-checked</span>}
                        </>
                      }
                      checked={ticked[c.key]}
                      onChange={(e) => setTicked((t) => ({ ...t, [c.key]: e.target.checked }))}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <ReviewActions
                  variant="full"
                  achievementId={a.id}
                  eventName={a.event_name}
                  studentName={a.student_name}
                  verifyDisabled={!allTicked}
                  verifyDisabledReason="Tick every checklist item to verify"
                  onDone={() => navigate('/faculty')}
                />
                {!allTicked && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
                    <ShieldCheck className="size-3.5" aria-hidden /> Verify unlocks when every checklist item is ticked. You can reject or request changes at any time.
                  </p>
                )}
              </div>
            </SectionCard>
          )}

          {!isFaculty && a.status === 'pending' && (
            <Alert tone="info">Only faculty in the student’s department can verify or reject this submission.</Alert>
          )}
        </div>
      </div>
    </div>
  )
}
