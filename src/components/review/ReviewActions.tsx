import { useState } from 'react'
import { CheckCircle2, Eye, MessageSquareMore, XCircle } from 'lucide-react'
import { CertificateViewer } from '@/components/certificates/CertificateViewer'
import { Alert, Button, ErrorState, Modal, Skeleton, TextAreaField, useToast } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { getCertificateFor } from '@/services/achievementService'
import { rejectAchievement, requestAchievementChanges, verifyAchievement } from '@/services/reviewService'

type Dialog = 'verify' | 'reject' | 'changes' | null

interface ReviewActionsProps {
  achievementId: string
  eventName: string
  studentName: string
  onDone: () => void
  /** compact = queue card; full = the verification screen */
  variant?: 'compact' | 'full'
  /** full variant: verification stays disabled until the checklist is complete */
  verifyDisabled?: boolean
  verifyDisabledReason?: string
}

const REJECT_HINT = 'e.g. Certificate date does not match the submitted event date.'
const CHANGES_HINT = 'e.g. Please add the name of the organising institution.'

export function CertificateModal({ achievementId, title, open, onClose }: { achievementId: string; title: string; open: boolean; onClose: () => void }) {
  const cert = useAsync(() => getCertificateFor(achievementId), [achievementId], { enabled: open, context: 'certificate for modal' })
  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {cert.error ? (
        <ErrorState message={cert.error} onRetry={cert.reload} />
      ) : cert.loading && !cert.data ? (
        <Skeleton className="h-96 w-full" />
      ) : cert.data ? (
        <CertificateViewer path={cert.data.storage_path} mime={cert.data.mime_type} name={cert.data.file_name} />
      ) : (
        <p className="text-sm text-ink-500">No certificate file is attached to this submission.</p>
      )}
    </Modal>
  )
}

/** Verify / Reject / Request-changes, with the reason dialogs the workflow requires. */
export function ReviewActions({
  achievementId,
  eventName,
  studentName,
  onDone,
  variant = 'compact',
  verifyDisabled,
  verifyDisabledReason,
}: ReviewActionsProps) {
  const toast = useToast()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [viewing, setViewing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const full = variant === 'full'
  const close = () => {
    if (busy) return
    setDialog(null)
    setText('')
    setError(null)
  }

  const submit = async () => {
    const needsText = dialog === 'reject' || dialog === 'changes'
    if (needsText && text.trim().length < 5) {
      setError(
        dialog === 'reject'
          ? 'Please give the student a reason for the rejection (at least 5 characters).'
          : 'Please tell the student what needs to change (at least 5 characters).',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (dialog === 'verify') {
        const code = await verifyAchievement(achievementId, text)
        toast.success(`Verified · ID ${code}`)
      } else if (dialog === 'reject') {
        await rejectAchievement(achievementId, text)
        toast.success('Rejected. The student has been notified with your reason.')
      } else if (dialog === 'changes') {
        await requestAchievementChanges(achievementId, text)
        toast.success('Sent back to the student for changes.')
      }
      setDialog(null)
      setText('')
      onDone()
    } catch (err) {
      setError(reportError(err, 'review action', "We couldn't record your decision. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const size = full ? 'lg' : 'sm'

  return (
    <>
      <div className={cn(full ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-wrap gap-2')}>
        {!full && (
          <Button size={size} variant="secondary" onClick={() => setViewing(true)} icon={<Eye className="size-4" aria-hidden />}>
            View Certificate
          </Button>
        )}
        <Button
          size={size}
          variant="success"
          disabled={verifyDisabled}
          title={verifyDisabled ? verifyDisabledReason : undefined}
          onClick={() => setDialog('verify')}
          icon={<CheckCircle2 className="size-4" aria-hidden />}
          className={full ? 'uppercase tracking-wide sm:col-span-2' : undefined}
        >
          {full ? 'Verify certificate' : 'Verify'}
        </Button>
        <Button
          size={size}
          variant="danger"
          onClick={() => setDialog('reject')}
          icon={<XCircle className="size-4" aria-hidden />}
          className={full ? 'uppercase tracking-wide' : undefined}
        >
          Reject
        </Button>
        <Button
          size={size}
          variant="secondary"
          onClick={() => setDialog('changes')}
          icon={<MessageSquareMore className="size-4" aria-hidden />}
          className={full ? 'uppercase tracking-wide' : undefined}
        >
          {full ? 'Request changes' : 'Request Information'}
        </Button>
      </div>

      {!full && <CertificateModal achievementId={achievementId} title={`Certificate — ${eventName}`} open={viewing} onClose={() => setViewing(false)} />}

      <Modal
        open={dialog !== null}
        onClose={close}
        size="md"
        title={dialog === 'verify' ? 'Verify this certificate?' : dialog === 'reject' ? 'Reject this submission' : 'Request changes'}
        description={`${studentName} · ${eventName}`}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={dialog === 'verify' ? 'success' : dialog === 'reject' ? 'danger' : 'primary'}
              onClick={submit}
              loading={busy}
            >
              {dialog === 'verify' ? 'Verify & issue QR record' : dialog === 'reject' ? 'Reject' : 'Send request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          {dialog === 'verify' ? (
            <>
              <p className="text-sm text-ink-700">
                This issues a verification ID and QR code the student can share. Only verify once you’ve checked the certificate.
              </p>
              <TextAreaField label="Comment for the student (optional)" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            </>
          ) : (
            <TextAreaField
              label={dialog === 'reject' ? 'Reason for rejection' : 'What needs to change?'}
              required
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={dialog === 'reject' ? REJECT_HINT : CHANGES_HINT}
              hint="The student will see this message."
              maxLength={500}
            />
          )}
        </div>
      </Modal>
    </>
  )
}
