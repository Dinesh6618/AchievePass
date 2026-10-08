import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { AchievementStatus, EventCategory } from '@/types'
import { categoryIcon } from './categoryIcons'

interface WalletProps {
  categories: EventCategory[]
  achievements: { category_id: string; status: AchievementStatus }[]
  /** Link each tile to the achievements list filtered by category. */
  hrefFor?: (category: EventCategory) => string
  /** Tailwind grid-cols classes; defaults to a wide responsive grid. */
  columns?: string
}

/** "Hackathons: 8 · Workshops: 12 · …" — one tile per category, empty ones muted. */
export function AchievementWallet({
  categories,
  achievements,
  hrefFor,
  columns = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
}: WalletProps) {
  const tiles = categories.map((c) => {
    const mine = achievements.filter((a) => a.category_id === c.id && a.status !== 'draft')
    return { category: c, total: mine.length, verified: mine.filter((a) => a.status === 'verified').length }
  })

  return (
    <ul className={cn('grid gap-3', columns)}>
      {tiles.map(({ category, total, verified }) => {
        const Icon = categoryIcon(category.slug)
        const body = (
          <>
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-md',
                total ? 'bg-ink-900 text-gold-400' : 'bg-paper-200 text-ink-400',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <p className={cn('mt-3 font-display text-3xl font-semibold tabular-nums', !total && 'text-ink-300')}>{total}</p>
            <p className="text-sm font-medium text-ink-700">{category.name}</p>
            <p className="text-xs text-ink-500">{total ? `${verified} verified` : 'None yet'}</p>
          </>
        )
        return (
          <li key={category.id}>
            {hrefFor && total > 0 ? (
              <Link
                to={hrefFor(category)}
                className="card block h-full p-4 transition-colors hover:border-ink-300"
                aria-label={`${category.name}: ${total}, ${verified} verified`}
              >
                {body}
              </Link>
            ) : (
              <div className={cn('card h-full p-4', !total && 'bg-white/60')}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
