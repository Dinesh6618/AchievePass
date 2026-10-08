import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ClipboardList, Save, Send } from 'lucide-react'
import { AchievementDetailsForm } from '@/components/certificates/AchievementDetailsForm'
import {
  EMPTY_FORM,
  achievementToForm,
  formFromScan,
  formToInput,
  missingRequired,
  validateAchievementForm,
  type AchievementFormErrors,
  type AchievementFormState,
} from '@/components/certificates/achievementForm'
import { CertificateUploader, type UploadedCertificate } from '@/components/certificates/CertificateUploader'
import { CertificateViewer } from '@/components/certificates/CertificateViewer'
import { NameCheckNotice, ScanSummary } from '@/components/certificates/ScanSummary'
import {
  Alert,
  AchievementStatusBadge,
  Button,
  DescriptionList,
  ErrorState,
  LinkButton,
  PageHeader,
  Skeleton,
  useToast,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCategories } from '@/hooks/useReference'
import { formatDateRange } from '@/lib/dates'
import { AppError, reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  createAchievement,
  findDuplicates,
  getAchievement,
  replaceCertificate,
  submitAchievement,
  updateAchievement,
  type CertificateInput,
  type DuplicateMatch,
} from '@/services/achievementService'
import { compareStudentName, type ScanOutcome } from '@/services/ocr'
import { removeFiles } from '@/services/storageService'

type Step = 'upload' | 'details' | 'confirm'
type SaveMode = 'submit' | 'od' | 'draft'

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'details', label: 'Check details' },
  { id: 'confirm', label: 'Confirm' },
]

const EDITABLE = new Set(['draft', 'changes_requested', 'rejected'])

function Stepper({ step }: { step: Step }) {
  const index = STEPS.findIndex((s) => s.id === step)
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < index
        const current = i === index
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none" aria-current={current ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                done && 'border-ink-900 bg-ink-900 text-gold-400',
                current && 'border-gold-500 bg-gold-50 text-gold-700',
                !done && !current && 'border-paper-300 bg-white text-ink-400',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-sm font-medium', current ? 'text-ink-900' : 'text-ink-500')}>{s.label}</span>
            {i < STEPS.length - 1 && <span aria-hidden className={cn('h-px flex-1', done ? 'bg-ink-900' : 'bg-paper-300')} />}
          </li>
        )
      })}
    </ol>
  )
}

export default function AchievementWizardPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  useDocumentTitle(isEdit ? 'Edit achievement' : 'Add achievement')

  const profile = useProfile()
  const navigate = useNavigate()
  const toast = useToast()
  const categories = useCategories()
  const existing = useAsync(() => getAchievement(id!), [id], { enabled: isEdit, context: 'achievement for edit' })

  const [step, setStep] = useState<Step>(isEdit ? 'details' : 'upload')
  const [cert, setCert] = useState<UploadedCertificate | null>(null)
  const [scan, setScan] = useState<ScanOutcome | null>(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<AchievementFormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<AchievementFormErrors>({})
  const [reviewing, setReviewing] = useState(false) // read-only "certificate detected" summary vs. editable form
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null)
  const [saving, setSaving] = useState<SaveMode | null>(null)

  const committed = useRef(false)
  const certRef = useRef<UploadedCertificate | null>(null)
  certRef.current = cert
  const initialised = useRef(false)

  // ---- edit mode: load the record once -------------------------------------------------
  const record = existing.data
  useEffect(() => {
    if (!record || initialised.current) return
    initialised.current = true
    setForm(achievementToForm(record))
  }, [record])

  // ---- leave guards: don't strand an uploaded-but-unsaved file -------------------------
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (certRef.current && !committed.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      const pending = certRef.current
      if (pending && !committed.current) {
        URL.revokeObjectURL(pending.previewUrl)
        void removeFiles([pending.storagePath])
      }
    }
  }, [])

  const categoryList = useMemo(() => categories.data ?? [], [categories.data])

  const handleUploaderChange = useCallback(
    (next: UploadedCertificate | null, outcome: ScanOutcome | null) => {
      setCert(next)
      setScan(outcome)
      setDuplicates(null)
      if (next && outcome?.status === 'ok') {
        const patch = formFromScan(outcome.fields, categoryList)
        const merged = { ...EMPTY_FORM, ...(isEdit ? form : {}), ...patch }
        setForm(merged)
        setErrors({})
        setReviewing(missingRequired(merged).length === 0)
      } else if (next) {
        setReviewing(false)
      }
    },
    [categoryList, form, isEdit],
  )

  const nameCheck = useMemo(
    () => (scan?.status === 'ok' ? compareStudentName(profile.full_name, scan.fields.studentName, scan.rawText) : null),
    [scan, profile.full_name],
  )

  /** Fields whose current value is exactly what the reader found → show the "read from certificate" tick. */
  const fromScan = useMemo(() => {
    const set = new Set<keyof AchievementFormState>()
    if (scan?.status !== 'ok') return set
    const patch = formFromScan(scan.fields, categoryList)
    for (const key of Object.keys(patch) as (keyof AchievementFormState)[]) {
      if (patch[key] && patch[key] === form[key]) set.add(key)
    }
    return set
  }, [scan, categoryList, form])

  const updateForm = (patch: Partial<AchievementFormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch) as (keyof AchievementFormState)[]) delete next[k]
      return next
    })
    setDuplicates(null)
  }

  const categoryName = categoryList.find((c) => c.id === form.categoryId)?.name ?? null

  // ---- step 2 → 3 ----------------------------------------------------------------------
  const goToConfirm = async (skipDuplicateCheck = false) => {
    const found = validateAchievementForm(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setReviewing(false)
      toast.error('Please fix the highlighted fields.')
      return
    }

    if (!skipDuplicateCheck) {
      setCheckingDuplicates(true)
      try {
        const matches = await findDuplicates({
          studentId: profile.id,
          eventName: form.eventName,
          startDate: form.startDate,
          fileHash: cert?.hash,
          excludeAchievementId: id,
        })
        if (matches.length > 0) {
          setDuplicates(matches)
          setReviewing(false)
          return
        }
      } catch (err) {
        // A failed duplicate check must not block the student; the review step still protects the data.
        reportError(err, 'duplicate check')
        toast.warning("We couldn't check for duplicates just now, so please make sure this isn't already in your passport.")
      } finally {
        setCheckingDuplicates(false)
      }
    }
    setDuplicates(null)
    setStep('confirm')
  }

  // ---- save ----------------------------------------------------------------------------
  const certificateInput = (): CertificateInput | null => {
    if (!cert) return null
    return {
      storage_path: cert.storagePath,
      file_name: cert.fileName,
      mime_type: cert.mime,
      size_bytes: cert.size,
      file_hash: cert.hash,
      ocr_data:
        scan?.status === 'ok'
          ? { provider: scan.provider, extracted: scan.fields, name_check: nameCheck, confirmed_at: new Date().toISOString() }
          : { provider: scan && 'provider' in scan ? scan.provider : null, extracted: null, manual_entry: true },
    }
  }

  const save = async (mode: SaveMode) => {
    setSaving(mode)
    try {
      const input = formToInput(form)
      const certInput = certificateInput()
      let achievementId: string
      let submitted: boolean

      if (!isEdit) {
        if (!certInput) throw new AppError('Upload a certificate before saving.')
        const res = await createAchievement(profile.id, input, certInput, { submit: mode !== 'draft' })
        achievementId = res.id
        submitted = res.submitted
        committed.current = true
      } else {
        if (!record) throw new AppError('This achievement is still loading. Please wait a moment.')
        achievementId = record.id
        await updateAchievement(record.id, input)
        if (certInput) {
          await replaceCertificate(record.id, profile.id, certInput, record.certificate?.storage_path)
          committed.current = true
        }
        submitted = false
        if (mode !== 'draft') {
          await submitAchievement(record.id)
          submitted = true
        }
      }

      toast.success(
        submitted
          ? 'Submitted for verification. Faculty will review it soon.'
          : isEdit
            ? 'Changes saved.'
            : 'Saved as a draft. Submit it whenever you’re ready.',
      )
      navigate(
        mode === 'od' && submitted ? `/student/od/new?achievement=${achievementId}` : `/student/achievements/${achievementId}`,
        { replace: true },
      )
    } catch (err) {
      toast.error(reportError(err, 'save achievement', "We couldn't save your achievement. Please try again."))
      // A partially completed create leaves a recoverable draft on the server; keep the uploaded file for it.
      if (!isEdit && err instanceof AppError && /saved as a draft/i.test(err.message)) committed.current = true
    } finally {
      setSaving(null)
    }
  }

  // ---- render --------------------------------------------------------------------------
  if (isEdit) {
    if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />
    if (existing.loading && !record) return <Skeleton className="h-96 w-full" />
    if (!record) {
      return <Alert tone="warning" title="Achievement not found">It may have been removed. <Link className="underline" to="/student/achievements">Back to achievements</Link></Alert>
    }
    if (!EDITABLE.has(record.status)) {
      return (
        <Alert
          tone="info"
          title="This achievement can't be edited right now"
          action={<LinkButton size="sm" variant="secondary" to={`/student/achievements/${record.id}`}>View</LinkButton>}
        >
          {record.status === 'pending' ? 'It is waiting for faculty review.' : 'It has been verified and is locked.'}
        </Alert>
      )
    }
  }

  const existingCert = record?.certificate
    ? { path: record.certificate.storage_path, mime: record.certificate.mime_type, name: record.certificate.file_name }
    : null
  const hasCertificate = Boolean(cert || existingCert)
  const showPreview = step !== 'upload' && (cert || existingCert)

  return (
    <div>
      <PageHeader
        eyebrow={isEdit ? 'Edit achievement' : 'New achievement'}
        title={isEdit ? 'Update your achievement' : 'Add an achievement'}
        subtitle={
          isEdit && record?.review_comment ? undefined : 'Upload your certificate and we’ll fill in the details — you confirm before anything is sent.'
        }
        actions={
          <LinkButton to="/student/achievements" variant="ghost" size="sm" icon={<ArrowLeft className="size-4" aria-hidden />}>
            Cancel
          </LinkButton>
        }
      />

      {isEdit && record?.review_comment && (
        <Alert
          className="mb-6"
          tone={record.status === 'rejected' ? 'error' : 'info'}
          title={record.status === 'rejected' ? 'Faculty rejected this submission' : 'Faculty asked for changes'}
        >
          “{record.review_comment}”
        </Alert>
      )}

      <Stepper step={step} />

      <div className={cn('grid gap-6', showPreview && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <div className="min-w-0">
          {/* ------------------------------ STEP 1 ------------------------------ */}
          {step === 'upload' && (
            <div className="space-y-5">
              <CertificateUploader
                userId={profile.id}
                value={cert}
                scan={scan}
                existing={existingCert}
                onChange={handleUploaderChange}
                onBusyChange={setUploading}
              />
              <div className="flex justify-end">
                <Button
                  size="lg"
                  disabled={!hasCertificate || uploading}
                  onClick={() => setStep('details')}
                  icon={<ArrowRight className="size-4" aria-hidden />}
                  className="flex-row-reverse"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* ------------------------------ STEP 2 ------------------------------ */}
          {step === 'details' && (
            <div className="space-y-5">
              {duplicates && (
                <Alert
                  tone="warning"
                  title="This looks like something you've already added"
                  action={
                    <Button size="sm" variant="secondary" onClick={() => void goToConfirm(true)}>
                      It's different — continue
                    </Button>
                  }
                >
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {duplicates.map((d) => (
                      <li key={d.achievement.id}>
                        <Link target="_blank" rel="noopener noreferrer" className="font-medium underline" to={`/student/achievements/${d.achievement.id}`}>
                          {d.achievement.event_name}
                        </Link>{' '}
                        ({formatDateRange(d.achievement.start_date)}) —{' '}
                        {d.reason === 'same-file' ? 'you uploaded this exact file before' : 'same event around the same date'}{' '}
                        <AchievementStatusBadge status={d.achievement.status} className="align-middle" />
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}

              {scan?.status === 'ok' && reviewing ? (
                <ScanSummary
                  fields={scan.fields}
                  nameCheck={nameCheck ?? 'unknown'}
                  profileName={profile.full_name}
                  categoryName={categoryName}
                  busy={checkingDuplicates}
                  onConfirm={() => void goToConfirm()}
                  onEdit={() => setReviewing(false)}
                />
              ) : (
                <div className="card space-y-5 p-5 sm:p-6">
                  {scan?.status === 'ok' ? (
                    <div className="space-y-3">
                      <Alert tone="info" title="Check the details">
                        Fields marked “read from certificate” were filled in automatically — please correct anything that looks wrong.
                      </Alert>
                      {nameCheck && <NameCheckNotice check={nameCheck} extracted={scan.fields.studentName} profileName={profile.full_name} />}
                    </div>
                  ) : cert ? (
                    <Alert tone="info" title="Enter the details from your certificate">
                      {scan?.status === 'failed'
                        ? scan.reason
                        : scan?.status === 'unavailable'
                          ? scan.reason
                          : scan?.status === 'empty'
                            ? "We couldn't find readable text on this certificate."
                            : 'Automatic reading was skipped.'}
                    </Alert>
                  ) : null}

                  <AchievementDetailsForm
                    value={form}
                    errors={errors}
                    categories={categoryList}
                    fromScan={fromScan}
                    onChange={updateForm}
                  />

                  <div className="flex flex-wrap justify-between gap-3 border-t border-paper-200 pt-5">
                    <Button
                      variant="secondary"
                      icon={<ArrowLeft className="size-4" aria-hidden />}
                      onClick={() => setStep('upload')}
                    >
                      {isEdit ? 'Replace certificate' : 'Back'}
                    </Button>
                    <Button
                      size="lg"
                      loading={checkingDuplicates}
                      onClick={() => void goToConfirm()}
                      icon={<ArrowRight className="size-4" aria-hidden />}
                      className="flex-row-reverse"
                    >
                      Confirm &amp; Continue
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------ STEP 3 ------------------------------ */}
          {step === 'confirm' && (
            <div className="card space-y-6 p-5 sm:p-6">
              <div>
                <h2 className="text-xl font-semibold">Ready to submit?</h2>
                <p className="mt-1 text-sm text-ink-500">
                  Faculty in your department will review this certificate. You’ll be notified of the decision.
                </p>
              </div>

              <DescriptionList
                items={[
                  { label: 'Event', value: form.eventName },
                  { label: 'Event type', value: categoryName },
                  { label: 'Organization', value: form.organization },
                  { label: 'Date', value: formatDateRange(form.startDate, form.endDate || null) },
                  { label: 'Achievement', value: form.result || 'Participation' },
                  { label: 'Certificate', value: cert?.fileName ?? existingCert?.name },
                ]}
              />
              {form.description && <p className="whitespace-pre-line text-sm text-ink-700">{form.description}</p>}

              {nameCheck && nameCheck !== 'match' && nameCheck !== 'unknown' && (
                <NameCheckNotice check={nameCheck} extracted={scan?.status === 'ok' ? scan.fields.studentName : null} profileName={profile.full_name} />
              )}

              <div className="space-y-3 border-t border-paper-200 pt-5">
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  loading={saving === 'submit'}
                  disabled={saving !== null}
                  onClick={() => void save('submit')}
                  icon={<Send className="size-4" aria-hidden />}
                >
                  {isEdit ? 'Save & resubmit' : 'Submit for verification'}
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    loading={saving === 'od'}
                    disabled={saving !== null}
                    onClick={() => void save('od')}
                    icon={<ClipboardList className="size-4" aria-hidden />}
                  >
                    {isEdit ? 'Resubmit & create OD request' : 'Submit & create OD request'}
                  </Button>
                  <Button
                    variant="ghost"
                    loading={saving === 'draft'}
                    disabled={saving !== null}
                    onClick={() => void save('draft')}
                    icon={<Save className="size-4" aria-hidden />}
                  >
                    {isEdit ? 'Save changes' : 'Save as draft'}
                  </Button>
                  <Button variant="ghost" disabled={saving !== null} onClick={() => setStep('details')} icon={<ArrowLeft className="size-4" aria-hidden />}>
                    Back
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {showPreview && (
          <aside aria-label="Certificate preview" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Your certificate</p>
            <CertificateViewer
              local={cert ? { url: cert.previewUrl, mime: cert.mime, name: cert.fileName } : undefined}
              path={cert ? undefined : existingCert?.path}
              mime={existingCert?.mime}
              name={existingCert?.name}
              className="min-h-[240px]"
            />
          </aside>
        )}
      </div>
    </div>
  )
}
