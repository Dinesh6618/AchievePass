import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FileCheck2, Send } from 'lucide-react'
import { DocumentAttach, type AttachedDocument } from '@/components/certificates/DocumentAttach'
import {
  AchievementStatusBadge,
  Alert,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  SectionCard,
  SelectField,
  Skeleton,
  TextAreaField,
  TextField,
  useToast,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useCategories } from '@/hooks/useReference'
import { formatDateRange } from '@/lib/dates'
import { AppError, reportError } from '@/lib/errors'
import { listMyAchievements } from '@/services/achievementService'
import { createOd, getOd, resubmitOd, type OdFields } from '@/services/odService'
import { removeFiles } from '@/services/storageService'
import type { Achievement } from '@/types'

interface OdForm {
  eventName: string
  organization: string
  categoryId: string
  eventDate: string
  eventEndDate: string
  startTime: string
  endTime: string
  venue: string
  reason: string
}

type Errors = Partial<Record<keyof OdForm, string>>

const EMPTY: OdForm = {
  eventName: '', organization: '', categoryId: '', eventDate: '', eventEndDate: '',
  startTime: '', endTime: '', venue: '', reason: '',
}

const trimTime = (t: string | null) => (t ? t.slice(0, 5) : '')

function fromAchievement(a: Achievement): Partial<OdForm> {
  return {
    eventName: a.event_name,
    organization: a.organization ?? '',
    categoryId: a.category_id,
    eventDate: a.start_date,
    eventEndDate: a.end_date ?? '',
  }
}

function validate(f: OdForm): Errors {
  const e: Errors = {}
  if (f.eventName.trim().length < 2) e.eventName = 'Enter the event name.'
  if (!f.categoryId) e.categoryId = 'Choose the event type.'
  if (!f.eventDate) e.eventDate = 'Enter the event date.'
  if (f.eventEndDate && f.eventDate && f.eventEndDate < f.eventDate) e.eventEndDate = 'The end date can’t be before the start date.'
  if (f.startTime && f.endTime && f.endTime <= f.startTime) e.endTime = 'End time must be after the start time.'
  if (f.venue.trim().length < 2) e.venue = 'Enter the venue.'
  if (f.reason.trim().length < 10) e.reason = 'Explain why you need OD (at least 10 characters).'
  else if (f.reason.length > 1500) e.reason = 'Keep the reason under 1500 characters.'
  return e
}

export default function OdFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  useDocumentTitle(isEdit ? 'Update OD request' : 'New OD request')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const profile = useProfile()
  const categories = useCategories()

  const achievements = useAsync(() => listMyAchievements(profile.id), [profile.id], { enabled: !isEdit, context: 'achievements for OD' })
  const od = useAsync(() => getOd(id!), [id], { enabled: isEdit, context: 'OD for edit' })

  const [achievementId, setAchievementId] = useState(params.get('achievement') ?? '')
  const [form, setForm] = useState<OdForm>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [doc, setDoc] = useState<AttachedDocument | null>(null)
  const [saving, setSaving] = useState(false)
  const committed = useRef(false)
  const docRef = useRef<AttachedDocument | null>(null)
  docRef.current = doc
  const originalDocPath = useRef<string | null>(null)

  const eligible = useMemo(
    () => (achievements.data ?? []).filter((a) => (a.status === 'pending' || a.status === 'verified') && !a.od_request),
    [achievements.data],
  )
  const selected = eligible.find((a) => a.id === achievementId) ?? null

  // New request: prefill from the chosen achievement (only when the choice changes).
  const prefilledFor = useRef<string | null>(null)
  useEffect(() => {
    if (isEdit || !selected || prefilledFor.current === selected.id) return
    prefilledFor.current = selected.id
    setForm((f) => ({ ...f, ...fromAchievement(selected) }))
  }, [isEdit, selected])

  // Edit: load the existing request once.
  const loadedOd = od.data
  const editInit = useRef(false)
  useEffect(() => {
    if (!loadedOd || editInit.current) return
    editInit.current = true
    setForm({
      eventName: loadedOd.event_name,
      organization: loadedOd.organization ?? '',
      categoryId: loadedOd.category_id,
      eventDate: loadedOd.event_date,
      eventEndDate: loadedOd.event_end_date ?? '',
      startTime: trimTime(loadedOd.start_time),
      endTime: trimTime(loadedOd.end_time),
      venue: loadedOd.venue,
      reason: loadedOd.reason,
    })
    if (loadedOd.additional_document_path) {
      originalDocPath.current = loadedOd.additional_document_path
      setDoc({ path: loadedOd.additional_document_path, name: loadedOd.additional_document_name ?? 'Attachment', fresh: false })
    }
  }, [loadedOd])

  // Remove an uploaded-but-never-saved attachment if the student walks away.
  useEffect(
    () => () => {
      const pending = docRef.current
      if (pending?.fresh && !committed.current) void removeFiles([pending.path])
    },
    [],
  )

  const set = <K extends keyof OdForm>(key: K) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((cur) => ({ ...cur, [key]: undefined }))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      toast.error('Please fix the highlighted fields.')
      return
    }

    const fields: OdFields = {
      category_id: form.categoryId,
      event_name: form.eventName,
      organization: form.organization || null,
      event_date: form.eventDate,
      event_end_date: form.eventEndDate || null,
      start_time: form.startTime || null,
      end_time: form.endTime || null,
      venue: form.venue,
      reason: form.reason,
      additional_document_path: doc?.path ?? null,
      additional_document_name: doc?.name ?? null,
    }

    setSaving(true)
    try {
      let odId: string
      if (isEdit && loadedOd) {
        await resubmitOd(loadedOd.id, fields)
        odId = loadedOd.id
        if (originalDocPath.current && originalDocPath.current !== doc?.path) await removeFiles([originalDocPath.current])
      } else {
        if (!selected) throw new AppError('Choose which achievement this OD request is for.')
        odId = await createOd(profile.id, selected.id, fields)
      }
      committed.current = true
      toast.success(isEdit ? 'OD request updated and sent back for review.' : 'OD request submitted.')
      navigate(`/student/od/${odId}`, { replace: true })
    } catch (err) {
      toast.error(reportError(err, 'save OD request', "We couldn't submit your OD request. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  // ---------------------------------------------------------------- guards
  const header = (
    <PageHeader
      eyebrow={isEdit ? 'Update request' : 'New request'}
      title={isEdit ? 'Update your OD request' : 'Request On-Duty (OD)'}
      subtitle="Your certificate is attached automatically from the linked achievement."
      actions={
        <LinkButton to="/student/od" variant="ghost" size="sm" icon={<ArrowLeft className="size-4" aria-hidden />}>
          Cancel
        </LinkButton>
      }
    />
  )

  if (isEdit) {
    if (od.error) return <ErrorState message={od.error} onRetry={od.reload} />
    if (od.loading && !loadedOd) return <Skeleton className="h-96 w-full" />
    if (!loadedOd) return <EmptyState title="OD request not found" action={<LinkButton to="/student/od">Back to OD requests</LinkButton>} />
    if (loadedOd.status !== 'more_info') {
      return (
        <Alert tone="info" title="This request can't be edited" action={<LinkButton size="sm" variant="secondary" to={`/student/od/${loadedOd.id}`}>View</LinkButton>}>
          You can only change an OD request after faculty ask for more information.
        </Alert>
      )
    }
  } else {
    if (achievements.error) return <ErrorState message={achievements.error} onRetry={achievements.reload} />
    if (achievements.loading && !achievements.data) return <Skeleton className="h-96 w-full" />
    if (eligible.length === 0) {
      return (
        <div>
          {header}
          <EmptyState
            icon={FileCheck2}
            title="No achievement ready for an OD request"
            description="An OD request is linked to a submitted achievement without one. Add your certificate first — you can request OD in the same step."
            action={<LinkButton to="/student/achievements/new">Add Achievement</LinkButton>}
          />
        </div>
      )
    }
  }

  const certificate = isEdit ? null : selected?.certificate
  const showForm = isEdit || selected

  return (
    <div>
      {header}

      {isEdit && loadedOd?.review_comment && (
        <Alert className="mb-6" tone="info" title="Faculty need more information">
          “{loadedOd.review_comment}”
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {!isEdit && (
          <SectionCard title="Which achievement is this for?">
            <SelectField
              label="Achievement"
              required
              value={achievementId}
              onChange={(e) => setAchievementId(e.target.value)}
              hint="Only submitted achievements without an OD request are listed."
            >
              <option value="">Select…</option>
              {eligible.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.event_name} — {formatDateRange(a.start_date, a.end_date)}
                </option>
              ))}
            </SelectField>
            {selected && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-500">
                Certificate status: <AchievementStatusBadge status={selected.status} />
              </p>
            )}
          </SectionCard>
        )}

        {showForm && (
          <>
            <SectionCard title="Student">
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Student" value={profile.full_name} readOnly />
                <TextField label="Register number" value={profile.register_number ?? ''} readOnly />
              </div>
            </SectionCard>

            <SectionCard title="Event">
              <div className="space-y-5">
                <TextField label="Event name" required value={form.eventName} onChange={set('eventName')} error={errors.eventName} maxLength={200} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField label="Organization" value={form.organization} onChange={set('organization')} maxLength={200} />
                  <SelectField label="Event type" required value={form.categoryId} onChange={set('categoryId')} error={errors.categoryId}>
                    <option value="">Select…</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField label="Event date" type="date" required value={form.eventDate} onChange={set('eventDate')} error={errors.eventDate} />
                  <TextField label="End date" type="date" min={form.eventDate || undefined} value={form.eventEndDate} onChange={set('eventEndDate')} error={errors.eventEndDate} hint="Only for multi-day events" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField label="Start time" type="time" value={form.startTime} onChange={set('startTime')} error={errors.startTime} />
                  <TextField label="End time" type="time" value={form.endTime} onChange={set('endTime')} error={errors.endTime} />
                </div>
                <TextField label="Venue" required value={form.venue} onChange={set('venue')} error={errors.venue} maxLength={200} placeholder="Where is the event held?" />
              </div>
            </SectionCard>

            <SectionCard title="Why do you need OD?">
              <TextAreaField
                label="Reason for OD"
                required
                rows={4}
                value={form.reason}
                onChange={set('reason')}
                error={errors.reason}
                maxLength={1500}
                hint={`${form.reason.trim().length}/1500 — mention the classes you will miss, if any.`}
              />
            </SectionCard>

            <SectionCard title="Documents">
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-ink-800">Certificate</p>
                  {isEdit ? (
                    <p className="mt-1 text-sm text-ink-500">Attached from your linked achievement.</p>
                  ) : certificate ? (
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-700">
                      <FileCheck2 className="size-4 text-verified-600" aria-hidden /> {certificate.file_name}
                      {selected && (
                        <Link to={`/student/achievements/${selected.id}`} target="_blank" className="text-xs underline">
                          view
                        </Link>
                      )}
                    </p>
                  ) : null}
                </div>
                <DocumentAttach
                  userId={profile.id}
                  label="Additional document (optional)"
                  hint="Invitation letter, permission slip or registration confirmation — PDF, JPG or PNG up to 10 MB."
                  value={doc}
                  onChange={setDoc}
                  disabled={saving}
                />
              </div>
            </SectionCard>

            <div className="flex flex-wrap justify-end gap-3">
              <LinkButton to="/student/od" variant="secondary">
                Cancel
              </LinkButton>
              <Button type="submit" size="lg" loading={saving} icon={<Send className="size-4" aria-hidden />}>
                {isEdit ? 'Update & resubmit' : 'Submit OD request'}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
