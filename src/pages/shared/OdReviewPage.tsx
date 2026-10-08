import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, FileSearch, MessageSquareMore, XCircle } from 'lucide-react'
import { CertificateViewer } from '@/components/certificates/CertificateViewer'
import { OdInfo } from '@/components/od/OdInfo'
import {
  AchievementStatusBadge,
  Alert,
  Button,
  DescriptionList,
  EmptyState,
  ErrorState,
  LinkButton,
  Modal,
  OdStatusBadge,
  SectionCard,
  Skeleton,
  TextAreaField,
  useToast,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateTime } from '@/lib/dates'
import { reportError } from '@/lib/errors'
import { getCertificateFor } from '@/services/achievementService'
import { getOd, reviewOd } from '@/services/odService'

type Decision = 'approved' | 'rejected' | 'more_info'

const DIALOG: Record<Decision, { title: string; label: string; button: string; success: string; required: boolean; placeholder: string }> = {
  approved: {
    title: 'Approve this OD request?',
    label: 'Comment for the student (optional)',
    button: 'Approve OD',
    success: 'OD request approved.',
    required: false,
    placeholder: '',
  },
  rejected: {
    title: 'Reject this OD request',
    label: 'Reason for rejection',
    button: 'Reject OD',
    success: 'OD request rejected. The student has been notified.',
    required: true,
    placeholder: 'e.g. The event dates clash with the internal examinations.',
  },
  more_info: {
    title: 'Ask for more information',
    label: 'What do you need from the student?',
    button: 'Send request',
    success: 'The student has been asked for more information.',
    required: true,
    placeholder: 'e.g. Please attach the invitation letter from the organisers.',
  },
}

export default function OdReviewPage() {
  const { id = '' } = useParams()
  const profile = useProfile()
  const toast = useToast()
  const isFaculty = profile.role === 'faculty'
  const od = useAsync(() => getOd(id), [id], { context: 'od review' })
  const o = od.data
  useDocumentTitle(o ? `OD: ${o.event_name}` : 'OD request')
  const certificate = useAsync(() => getCertificateFor(o!.achievement_id), [o?.achievement_id], {
    enabled: Boolean(o),
    context: 'od certificate',
  })

  const [decision, setDecision] = useState<Decision | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    if (busy) return
    setDecision(null)
    setText('')
    setError(null)
  }

  const submit = async () => {
    if (!decision) return
    const cfg = DIALOG[decision]
    if (cfg.required && text.trim().length < 5) {
      setError('Please write a short comment (at least 5 characters) so the student knows what to do next.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await reviewOd(id, decision, text)
      toast.success(cfg.success)
      setDecision(null)
      setText('')
      od.reload()
    } catch (err) {
      setError(reportError(err, 'review OD', "We couldn't record your decision. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const back = isFaculty ? '/faculty/od' : '/admin/od'

  if (od.error) return <ErrorState message={od.error} onRetry={od.reload} />
  if (od.loading && !o) return <Skeleton className="h-96 w-full" />
  if (!o) {
    return (
      <EmptyState
        title="OD request not found"
        description="It may have been withdrawn, or it isn’t in your department."
        action={<LinkButton to={back}>Back to OD requests</LinkButton>}
      />
    )
  }

  const cert = certificate.data
  const canDecide = isFaculty && o.status === 'pending'

  return (
    <div className="space-y-6">
      <Link to={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> OD requests
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">OD request</p>
          <h1 className="mt-0.5 break-words text-2xl font-semibold sm:text-3xl">{o.event_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OdStatusBadge status={o.status} />
            <span className="text-xs text-ink-500">Certificate:</span>
            <AchievementStatusBadge status={o.achievement_status} />
          </div>
        </div>
        {canDecide && (
          <div className="flex flex-wrap gap-2">
            <Button variant="success" onClick={() => setDecision('approved')} icon={<CheckCircle2 className="size-4" aria-hidden />}>
              Approve
            </Button>
            <Button variant="danger" onClick={() => setDecision('rejected')} icon={<XCircle className="size-4" aria-hidden />}>
              Reject
            </Button>
            <Button variant="secondary" onClick={() => setDecision('more_info')} icon={<MessageSquareMore className="size-4" aria-hidden />}>
              Request information
            </Button>
          </div>
        )}
      </header>

      {o.status !== 'pending' && (
        <Alert
          tone={o.status === 'approved' ? 'success' : o.status === 'rejected' ? 'error' : 'info'}
          title={
            o.status === 'approved' ? 'Approved' : o.status === 'rejected' ? 'Rejected' : 'More information requested'
          }
        >
          {o.reviewed_at && <span className="block text-xs opacity-80">{formatDateTime(o.reviewed_at)}</span>}
          {o.review_comment ? `“${o.review_comment}”` : 'No comment was left.'}
        </Alert>
      )}
      {o.status === 'pending' && o.achievement_status === 'pending' && isFaculty && (
        <Alert
          tone="info"
          action={
            <LinkButton size="sm" variant="secondary" to={`/faculty/review/${o.achievement_id}`} icon={<FileSearch className="size-4" aria-hidden />}>
              Review certificate
            </LinkButton>
          }
        >
          The linked certificate hasn’t been verified yet.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <SectionCard
            title="Student"
            action={
              <Link to={`/${profile.role}/students/${o.student_id}`} className="text-sm font-medium text-ink-600 underline underline-offset-2 hover:text-ink-900">
                Achievement history
              </Link>
            }
          >
            <DescriptionList
              items={[
                { label: 'Name', value: o.student_name },
                { label: 'Register number', value: o.register_number },
                { label: 'Department', value: o.department_name },
                { label: 'Year', value: o.student_year ? `Year ${o.student_year}` : null },
              ]}
            />
          </SectionCard>
          <SectionCard title="Request">
            <OdInfo od={o} />
            <p className="mt-4 border-t border-paper-100 pt-3 text-xs text-ink-500">Submitted {formatDateTime(o.created_at)}</p>
          </SectionCard>
        </div>

        <section aria-label="Certificate" className="min-w-0">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Certificate</h2>
          {certificate.loading && !cert ? (
            <Skeleton className="h-[480px] w-full" />
          ) : cert ? (
            <CertificateViewer path={cert.storage_path} mime={cert.mime_type} name={cert.file_name} />
          ) : (
            <Alert tone="warning">{certificate.error ?? 'No certificate is attached to the linked achievement.'}</Alert>
          )}
        </section>
      </div>

      <Modal
        open={decision !== null}
        onClose={close}
        title={decision ? DIALOG[decision].title : ''}
        description={`${o.student_name} · ${o.event_name}`}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={decision === 'approved' ? 'success' : decision === 'rejected' ? 'danger' : 'primary'}
              onClick={submit}
              loading={busy}
            >
              {decision ? DIALOG[decision].button : ''}
            </Button>
          </>
        }
      >
        {decision && (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <TextAreaField
              label={DIALOG[decision].label}
              required={DIALOG[decision].required}
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={DIALOG[decision].placeholder}
              maxLength={500}
              hint="The student will see this message."
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
