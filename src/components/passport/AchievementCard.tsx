import { Link } from 'react-router-dom'
import { FileCheck2, MessageSquareWarning } from 'lucide-react'
import { AchievementStatusBadge, OdStatusBadge } from '@/components/ui'
import { formatDateRange } from '@/lib/dates'
import type { Achievement } from '@/types'
import { categoryIcon } from './categoryIcons'

export function AchievementCard({ achievement: a }: { achievement: Achievement }) {
  const Icon = categoryIcon(a.category.slug)
  const needsAttention = a.status === 'changes_requested' || a.status === 'rejected'
  return (
    <Link
      to={`/student/achievements/${a.id}`}
      className="card flex gap-4 p-4 transition-colors hover:border-ink-300 focus-visible:border-ink-700"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-ink-900 text-gold-400">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">
            {a.category.name} · {formatDateRange(a.start_date, a.end_date)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {a.od_request && <OdStatusBadge status={a.od_request.status} />}
            <AchievementStatusBadge status={a.status} />
          </div>
        </div>
        <h3 className="mt-1 break-words font-display text-lg font-semibold leading-snug">{a.event_name}</h3>
        <p className="text-sm text-ink-500">{[a.result, a.organization].filter(Boolean).join(' · ') || 'Participation'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          {a.certificate && (
            <span className="inline-flex items-center gap-1">
              <FileCheck2 className="size-3.5" aria-hidden /> Certificate attached
            </span>
          )}
          {needsAttention && a.review_comment && (
            <span className="inline-flex items-center gap-1 font-medium text-rejected-700">
              <MessageSquareWarning className="size-3.5" aria-hidden /> Faculty left a comment
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
