import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { AchievementStatusBadge } from '@/components/ui'
import { formatDateRange } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { AchievementStatus } from '@/types'
import { categoryIcon } from './categoryIcons'

export interface TimelineItem {
  id: string
  event_name: string
  category_name: string
  category_slug: string
  start_date: string
  end_date: string | null
  organization: string | null
  result: string | null
  status: AchievementStatus
}

const NODE_RING: Record<AchievementStatus, string> = {
  verified: 'border-verified-600 bg-verified-50 text-verified-700',
  pending: 'border-pending-600 bg-pending-50 text-pending-700',
  rejected: 'border-rejected-600 bg-rejected-50 text-rejected-700',
  changes_requested: 'border-info-600 bg-info-50 text-info-700',
  draft: 'border-paper-300 bg-paper-100 text-ink-500',
}

/** "Hackathon → Workshop → Internship": the route a student took through the year. */
export function JourneyRoute({ items }: { items: TimelineItem[] }) {
  // collapse consecutive repeats so "Hackathon → Hackathon" reads as one leg
  const legs: string[] = []
  for (const item of items) {
    if (legs[legs.length - 1] !== item.category_name) legs.push(item.category_name)
  }
  if (legs.length === 0) return null
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Your route this year">
      {legs.map((leg, i) => (
        <Fragment key={`${leg}-${i}`}>
          {i > 0 && <ChevronRight className="size-4 text-gold-500" aria-hidden />}
          <li className="rounded-full border border-paper-300 bg-white px-3 py-1 text-xs font-semibold text-ink-700">{leg}</li>
        </Fragment>
      ))}
    </ol>
  )
}

interface JourneyTimelineProps {
  items: TimelineItem[]
  hrefFor: (item: TimelineItem) => string
  className?: string
}

/** Vertical milestone timeline, oldest first so it reads as the story of the year. */
export function JourneyTimeline({ items, hrefFor, className }: JourneyTimelineProps) {
  const sorted = [...items].sort((a, b) => a.start_date.localeCompare(b.start_date))
  return (
    <ol className={cn('relative space-y-5', className)}>
      <span aria-hidden className="absolute bottom-6 left-[19px] top-6 w-0.5 bg-paper-300" />
      {sorted.map((item) => {
        const Icon = categoryIcon(item.category_slug)
        return (
          <li key={item.id} className="relative flex gap-4">
            <span
              className={cn(
                'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2',
                NODE_RING[item.status],
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <Link
              to={hrefFor(item)}
              className="card block min-w-0 flex-1 p-4 transition-colors hover:border-ink-300 focus-visible:border-ink-700"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">
                  {item.category_name} · {formatDateRange(item.start_date, item.end_date)}
                </p>
                <AchievementStatusBadge status={item.status} />
              </div>
              <h3 className="mt-1 break-words font-display text-lg font-semibold leading-snug">{item.event_name}</h3>
              <p className="mt-0.5 text-sm text-ink-500">
                {[item.result, item.organization].filter(Boolean).join(' · ') || 'Participation'}
              </p>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
