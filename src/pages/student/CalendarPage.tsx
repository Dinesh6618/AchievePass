import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  AchievementStatusBadge,
  Button,
  EmptyState,
  ErrorState,
  Modal,
  OdStatusBadge,
  PageHeader,
  Skeleton,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateLong, formatDateRange, formatMonthYear, parseISODate, toISODate, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { listMyAchievements } from '@/services/achievementService'
import { listMyOds } from '@/services/odService'
import type { AchievementStatus, OdStatus } from '@/types'

interface CalEvent {
  key: string
  title: string
  start: string
  end: string
  odStatus: OdStatus | null
  certStatus: AchievementStatus
  odId?: string
  achievementId: string
}

const CHIP: Record<OdStatus | 'none', string> = {
  pending: 'bg-pending-50 text-pending-700 border-pending-600/40',
  approved: 'bg-verified-50 text-verified-700 border-verified-600/40',
  rejected: 'bg-rejected-50 text-rejected-700 border-rejected-600/40',
  more_info: 'bg-info-50 text-info-700 border-info-600/40',
  none: 'bg-paper-100 text-ink-600 border-paper-300',
}

const LEGEND: { label: string; key: OdStatus | 'none' }[] = [
  { label: 'OD pending', key: 'pending' },
  { label: 'OD approved', key: 'approved' },
  { label: 'OD rejected', key: 'rejected' },
  { label: 'More info needed', key: 'more_info' },
  { label: 'No OD request', key: 'none' },
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthGrid(month: Date): string[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - cursor.getDay())
  const weeks: string[][] = []
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(toISODate(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  } while (cursor.getMonth() === month.getMonth() || weeks.length < 4)
  return weeks
}

export default function CalendarPage() {
  useDocumentTitle('OD calendar')
  const profile = useProfile()
  const ods = useAsync(() => listMyOds(profile.id), [profile.id], { context: 'calendar ods' })
  const achievements = useAsync(() => listMyAchievements(profile.id), [profile.id], { context: 'calendar achievements' })

  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)

  const events = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = []
    for (const o of ods.data ?? []) {
      out.push({
        key: `od-${o.id}`,
        title: o.event_name,
        start: o.event_date,
        end: o.event_end_date ?? o.event_date,
        odStatus: o.status,
        certStatus: o.achievement_status,
        odId: o.id,
        achievementId: o.achievement_id,
      })
    }
    for (const a of achievements.data ?? []) {
      if (a.od_request || a.status === 'draft') continue
      out.push({
        key: `ach-${a.id}`,
        title: a.event_name,
        start: a.start_date,
        end: a.end_date ?? a.start_date,
        odStatus: null,
        certStatus: a.status,
        achievementId: a.id,
      })
    }
    return out.sort((x, y) => x.start.localeCompare(y.start))
  }, [ods.data, achievements.data])

  const weeks = useMemo(() => monthGrid(month), [month])
  const eventsOn = (day: string) => events.filter((e) => e.start <= day && day <= e.end)
  const monthEvents = useMemo(() => {
    const from = toISODate(new Date(month.getFullYear(), month.getMonth(), 1))
    const to = toISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0))
    return events.filter((e) => e.start <= to && e.end >= from)
  }, [events, month])

  const today = todayISO()
  const shift = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  const open = (day: string, key?: string) => {
    setOpenDay(day)
    setFocusKey(key ?? null)
  }

  const error = ods.error ?? achievements.error
  const loading = (ods.loading && !ods.data) || (achievements.loading && !achievements.data)
  const dayEvents = openDay ? eventsOn(openDay) : []
  const orderedDayEvents = [...dayEvents].sort((a, b) => (a.key === focusKey ? -1 : b.key === focusKey ? 1 : 0))

  return (
    <div>
      <PageHeader eyebrow="Schedule" title="OD calendar" subtitle="Events and on-duty requests by date. Select one to see its status." />

      {error ? (
        <ErrorState message={error} onRetry={() => { ods.reload(); achievements.reload() }} />
      ) : loading ? (
        <Skeleton className="h-[480px] w-full" />
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing on your calendar yet"
          description="Events and OD requests appear here once you add an achievement."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold" aria-live="polite">
              {formatMonthYear(month)}
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => shift(-1)} aria-label="Previous month" icon={<ChevronLeft className="size-4" aria-hidden />} />
              <Button variant="secondary" size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
                Today
              </Button>
              <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Next month" icon={<ChevronRight className="size-4" aria-hidden />} />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-paper-200 bg-paper/70" role="row">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader" className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-ink-500">
                  {d}
                </div>
              ))}
            </div>
            <div role="grid" aria-label={`Calendar for ${formatMonthYear(month)}`}>
              {weeks.map((week) => (
                <div key={week[0]} role="row" className="grid grid-cols-7">
                  {week.map((day) => {
                    const inMonth = parseISODate(day).getMonth() === month.getMonth()
                    const list = eventsOn(day)
                    const visible = list.slice(0, 2)
                    return (
                      <div
                        key={day}
                        role="gridcell"
                        className={cn(
                          'min-h-[76px] border-b border-r border-paper-100 p-1 sm:min-h-[104px] sm:p-1.5',
                          !inMonth && 'bg-paper/50',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => list.length > 0 && open(day)}
                          disabled={list.length === 0}
                          aria-label={`${formatDateLong(day)}${list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}` : ''}`}
                          className={cn(
                            'mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium',
                            !inMonth && 'text-ink-300',
                            day === today && 'bg-ink-900 text-white',
                            list.length > 0 && day !== today && 'hover:bg-paper-200',
                          )}
                        >
                          {parseISODate(day).getDate()}
                        </button>
                        <div className="space-y-1">
                          {visible.map((e) => (
                            <button
                              key={e.key}
                              type="button"
                              onClick={() => open(day, e.key)}
                              className={cn(
                                'block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium leading-tight sm:text-xs',
                                CHIP[e.odStatus ?? 'none'],
                              )}
                              title={e.title}
                            >
                              <span className="sr-only sm:not-sr-only">{e.title}</span>
                              <span className="sm:hidden" aria-hidden>•</span>
                            </button>
                          ))}
                          {list.length > visible.length && (
                            <button type="button" onClick={() => open(day)} className="px-1 text-[10px] font-medium text-ink-500 hover:text-ink-900 sm:text-xs">
                              +{list.length - visible.length} more
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-600" aria-label="Legend">
            {LEGEND.map((l) => (
              <li key={l.key} className="flex items-center gap-1.5">
                <span className={cn('size-3 rounded border', CHIP[l.key])} aria-hidden /> {l.label}
              </li>
            ))}
          </ul>

          <section aria-labelledby="agenda-heading">
            <h2 id="agenda-heading" className="mb-3 text-base font-semibold">
              This month
            </h2>
            {monthEvents.length === 0 ? (
              <p className="text-sm text-ink-500">No events in {formatMonthYear(month)}.</p>
            ) : (
              <ul className="space-y-2">
                {monthEvents.map((e) => (
                  <li key={e.key}>
                    <button
                      type="button"
                      onClick={() => open(e.start < toISODate(new Date(month.getFullYear(), month.getMonth(), 1)) ? e.end : e.start, e.key)}
                      className="card flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:border-ink-300"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{e.title}</span>
                        <span className="text-sm text-ink-500">{formatDateRange(e.start, e.end)}</span>
                      </span>
                      {e.odStatus ? <OdStatusBadge status={e.odStatus} /> : <span className="stamp border-paper-300 bg-paper-100 text-ink-600">No OD</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Modal
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        title={openDay ? formatDateLong(openDay) : ''}
        description={`${dayEvents.length} ${dayEvents.length === 1 ? 'event' : 'events'}`}
        size="md"
      >
        <ul className="space-y-5">
          {orderedDayEvents.map((e) => (
            <li key={e.key} className="space-y-3 border-b border-paper-100 pb-5 last:border-0 last:pb-0">
              <h3 className="font-display text-lg font-semibold">{e.title}</h3>
              <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                <dt className="text-ink-500">Date</dt>
                <dd>{formatDateRange(e.start, e.end)}</dd>
                <dt className="text-ink-500">OD status</dt>
                <dd>{e.odStatus ? <OdStatusBadge status={e.odStatus} /> : <span className="text-ink-600">No OD request</span>}</dd>
                <dt className="text-ink-500">Certificate</dt>
                <dd><AchievementStatusBadge status={e.certStatus} /></dd>
              </dl>
              <div className="flex flex-wrap gap-3 text-sm">
                {e.odId && (
                  <Link to={`/student/od/${e.odId}`} className="font-medium underline underline-offset-2">
                    Open OD request
                  </Link>
                )}
                <Link to={`/student/achievements/${e.achievementId}`} className="font-medium underline underline-offset-2">
                  Open achievement
                </Link>
                {!e.odId && (e.certStatus === 'pending' || e.certStatus === 'verified') && (
                  <Link to={`/student/od/new?achievement=${e.achievementId}`} className="font-medium underline underline-offset-2">
                    Request OD
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
