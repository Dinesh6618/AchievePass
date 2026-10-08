import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Eye, MessageSquareText, Pencil, Send, Trash2 } from 'lucide-react'
import { CertificateViewer } from '@/components/certificates/CertificateViewer'
import { categoryIcon } from '@/components/passport/categoryIcons'
import { VerifiedRecordCard } from '@/components/passport/VerifiedRecordCard'
import {
  AchievementStatusBadge,
  Alert,
  Button,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorState,
  LinkButton,
  OdStatusBadge,
  SectionCard,
  Skeleton,
  useToast,
} from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePublicSettings } from '@/hooks/useReference'
import { useProfile } from '@/contexts/AuthContext'
import { formatDateRange, formatDateTime } from '@/lib/dates'
import { reportError } from '@/lib/errors'
import { deleteAchievement, getAchievement, submitAchievement } from '@/services/achievementService'

export default function AchievementDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const profile = useProfile()
  const settings = usePublicSettings()
  const result = useAsync(() => getAchievement(id), [id], { context: 'achievement detail' })
  const a = result.data
  useDocumentTitle(a?.event_name ?? 'Achievement')

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState<'delete' | 'submit' | null>(null)

  if (result.error) return <ErrorState message={result.error} onRetry={result.reload} />
  if (result.loading && !a) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading achievement">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!a) {
    return (
      <EmptyState
        title="Achievement not found"
        description="It may have been deleted, or the link is wrong."
        action={<LinkButton to="/student/achievements">Back to achievements</LinkButton>}
      />
    )
  }

  const Icon = categoryIcon(a.category.slug)
  const editable = a.status === 'draft' || a.status === 'changes_requested' || a.status === 'rejected'
  const canSubmitDirectly = a.status === 'draft' && Boolean(a.certificate)
  const hasOd = Boolean(a.od_request)
  const canRequestOd = (a.status === 'pending' || a.status === 'verified') && !hasOd

  const onDelete = async () => {
    setBusy('delete')
    try {
      await deleteAchievement(a)
      toast.success('Achievement deleted.')
      navigate('/student/achievements', { replace: true })
    } catch (err) {
      toast.error(reportError(err, 'delete achievement'))
      setConfirmDelete(false)
    } finally {
      setBusy(null)
    }
  }

  const onSubmit = async () => {
    setBusy('submit')
    try {
      await submitAchievement(a.id)
      toast.success('Submitted for verification.')
      result.reload()
    } catch (err) {
      toast.error(reportError(err, 'submit achievement'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/student/achievements" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> Achievements
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-gold-400">
            <Icon className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">
              {a.category.name} · {formatDateRange(a.start_date, a.end_date)}
            </p>
            <h1 className="mt-0.5 break-words text-2xl font-semibold sm:text-3xl">{a.event_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AchievementStatusBadge status={a.status} />
              {a.od_request && <OdStatusBadge status={a.od_request.status} />}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canSubmitDirectly && (
            <Button loading={busy === 'submit'} onClick={onSubmit} icon={<Send className="size-4" aria-hidden />}>
              Submit for verification
            </Button>
          )}
          {editable && (
            <LinkButton to={`/student/achievements/${a.id}/edit`} variant="secondary" icon={<Pencil className="size-4" aria-hidden />}>
              {a.status === 'draft' ? 'Edit' : 'Edit & resubmit'}
            </LinkButton>
          )}
          {canRequestOd && (
            <LinkButton to={`/student/od/new?achievement=${a.id}`} variant={a.status === 'verified' ? 'primary' : 'secondary'} icon={<ClipboardList className="size-4" aria-hidden />}>
              Create OD request
            </LinkButton>
          )}
          {a.od_request && (
            <LinkButton to={`/student/od/${a.od_request.id}`} variant="secondary" icon={<Eye className="size-4" aria-hidden />}>
              View OD request
            </LinkButton>
          )}
          {editable && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="size-4" aria-hidden />}>
              Delete
            </Button>
          )}
        </div>
      </header>

      {a.review_comment && (a.status === 'rejected' || a.status === 'changes_requested') && (
        <Alert
          tone={a.status === 'rejected' ? 'error' : 'info'}
          title={a.status === 'rejected' ? 'Faculty rejected this submission' : 'Faculty asked for changes'}
        >
          <p className="flex items-start gap-2">
            <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>“{a.review_comment}”</span>
          </p>
          <p className="mt-1 text-xs opacity-80">
            Fix the issue and use <strong>Edit &amp; resubmit</strong> to send it back for review.
          </p>
        </Alert>
      )}

      {a.status === 'verified' && a.verification_code && (
        <VerifiedRecordCard
          studentName={profile.full_name}
          institution={settings.data?.institution_name}
          record={{
            event_name: a.event_name,
            category_name: a.category.name,
            category_slug: a.category.slug,
            result: a.result,
            organization: a.organization,
            start_date: a.start_date,
            end_date: a.end_date,
            verification_code: a.verification_code,
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <SectionCard title="Details">
            <DescriptionList
              items={[
                { label: 'Event', value: a.event_name },
                { label: 'Event type', value: a.category.name },
                { label: 'Organization', value: a.organization },
                { label: 'Date', value: formatDateRange(a.start_date, a.end_date) },
                { label: 'Achievement', value: a.result ?? 'Participation' },
                { label: 'Added', value: formatDateTime(a.created_at) },
              ]}
            />
            {a.description && (
              <div className="mt-5 border-t border-paper-200 pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-ink-500">Description</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-800">{a.description}</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Status history">
            <ol className="space-y-3 text-sm">
              <li className="flex justify-between gap-3">
                <span className="text-ink-600">Created</span>
                <span className="text-ink-500">{formatDateTime(a.created_at)}</span>
              </li>
              {a.submitted_at && (
                <li className="flex justify-between gap-3">
                  <span className="text-ink-600">Submitted for verification</span>
                  <span className="text-ink-500">{formatDateTime(a.submitted_at)}</span>
                </li>
              )}
              {a.reviewed_at && (
                <li className="flex justify-between gap-3">
                  <span className="text-ink-600">Last reviewed by faculty</span>
                  <span className="text-ink-500">{formatDateTime(a.reviewed_at)}</span>
                </li>
              )}
            </ol>
          </SectionCard>
        </div>

        <SectionCard title="Certificate">
          {a.certificate ? (
            <CertificateViewer path={a.certificate.storage_path} mime={a.certificate.mime_type} name={a.certificate.file_name} />
          ) : (
            <EmptyState title="No certificate attached" description="Edit this achievement to upload one." className="border-0 py-8" />
          )}
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        loading={busy === 'delete'}
        danger
        title="Delete this achievement?"
        confirmLabel="Delete"
        message={
          hasOd ? (
            <>This achievement has an OD request linked to it. Withdraw the OD request first, then delete the achievement.</>
          ) : (
            <>“{a.event_name}” and its certificate will be permanently removed. This can't be undone.</>
          )
        }
      />
    </div>
  )
}
