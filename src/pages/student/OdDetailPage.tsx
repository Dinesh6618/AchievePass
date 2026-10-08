import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Circle, Pencil, Trash2 } from 'lucide-react'
import { CertificateViewer } from '@/components/certificates/CertificateViewer'
import { OdInfo } from '@/components/od/OdInfo'
import {
  AchievementStatusBadge,
  Alert,
  Button,
  ConfirmDialog,
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
import { formatDateTime } from '@/lib/dates'
import { reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { getAchievement } from '@/services/achievementService'
import { getOd, withdrawOd } from '@/services/odService'
import type { OdDetail } from '@/types'

function Progress({ od }: { od: OdDetail }) {
  const decided = od.status === 'approved' || od.status === 'rejected'
  const steps = [
    { label: 'Submitted', time: od.created_at, done: true },
    {
      label: od.status === 'more_info' ? 'Faculty asked for more information' : 'Faculty review',
      time: od.reviewed_at,
      done: od.status !== 'pending',
    },
    {
      label: od.status === 'approved' ? 'Approved' : od.status === 'rejected' ? 'Rejected' : 'Decision',
      time: decided ? od.reviewed_at : null,
      done: decided,
    },
  ]
  return (
    <ol className="space-y-4" aria-label="Request progress">
      {steps.map((s) => (
        <li key={s.label} className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
              s.done ? 'border-verified-600 bg-verified-600 text-white' : 'border-paper-300 bg-white text-transparent',
            )}
          >
            {s.done ? <Check className="size-3" aria-hidden /> : <Circle className="size-2" aria-hidden />}
          </span>
          <div>
            <p className={cn('text-sm font-medium', s.done ? 'text-ink-900' : 'text-ink-400')}>{s.label}</p>
            {s.time && s.done && <p className="text-xs text-ink-500">{formatDateTime(s.time)}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function OdDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const od = useAsync(() => getOd(id), [id], { context: 'od detail' })
  const o = od.data
  useDocumentTitle(o ? `OD: ${o.event_name}` : 'OD request')

  // The certificate lives on the linked achievement.
  const achievement = useAsync(() => getAchievement(o!.achievement_id), [o?.achievement_id], {
    enabled: Boolean(o),
    context: 'od achievement',
  })

  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  if (od.error) return <ErrorState message={od.error} onRetry={od.reload} />
  if (od.loading && !o) return <Skeleton className="h-96 w-full" />
  if (!o) {
    return (
      <EmptyState
        title="OD request not found"
        description="It may have been withdrawn, or the link is wrong."
        action={<LinkButton to="/student/od">Back to OD requests</LinkButton>}
      />
    )
  }

  const cert = achievement.data?.certificate
  const canEdit = o.status === 'more_info'
  const canWithdraw = o.status === 'pending' || o.status === 'more_info'

  const onWithdraw = async () => {
    setBusy(true)
    try {
      await withdrawOd(o)
      toast.success('OD request withdrawn.')
      navigate('/student/od', { replace: true })
    } catch (err) {
      toast.error(reportError(err, 'withdraw OD'))
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/student/od" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> OD requests
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-600">OD request</p>
          <h1 className="mt-0.5 break-words text-2xl font-semibold sm:text-3xl">{o.event_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OdStatusBadge status={o.status} />
            <AchievementStatusBadge status={o.achievement_status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <LinkButton to={`/student/od/${o.id}/edit`} icon={<Pencil className="size-4" aria-hidden />}>
              Update &amp; resubmit
            </LinkButton>
          )}
          <LinkButton to={`/student/achievements/${o.achievement_id}`} variant="secondary">
            View achievement
          </LinkButton>
          {canWithdraw && (
            <Button variant="ghost" onClick={() => setConfirm(true)} icon={<Trash2 className="size-4" aria-hidden />}>
              Withdraw
            </Button>
          )}
        </div>
      </header>

      {o.review_comment && o.status !== 'pending' && (
        <Alert
          tone={o.status === 'approved' ? 'success' : o.status === 'rejected' ? 'error' : 'info'}
          title={o.status === 'approved' ? 'Approved' : o.status === 'rejected' ? 'Faculty rejected this request' : 'Faculty need more information'}
        >
          “{o.review_comment}”
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <SectionCard title="Request details">
            <OdInfo od={o} />
          </SectionCard>
          <SectionCard title="Certificate">
            {achievement.loading && !achievement.data ? (
              <Skeleton className="h-64 w-full" />
            ) : cert ? (
              <CertificateViewer path={cert.storage_path} mime={cert.mime_type} name={cert.file_name} />
            ) : (
              <p className="text-sm text-ink-500">{achievement.error ?? 'No certificate is attached to the linked achievement.'}</p>
            )}
          </SectionCard>
        </div>
        <SectionCard title="Progress" className="h-fit">
          <Progress od={o} />
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={onWithdraw}
        loading={busy}
        danger
        title="Withdraw this OD request?"
        confirmLabel="Withdraw"
        message="The request will be removed and faculty will no longer see it. Your achievement stays in your passport."
      />
    </div>
  )
}
