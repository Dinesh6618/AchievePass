// Event dates are calendar dates ("2026-09-17"), not instants. Parse them as local
// dates so they never shift a day because of the viewer's time zone.

export function parseISODate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

const short = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const long = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const monthYear = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })

export function formatDate(value: string | null | undefined): string {
  return value ? short.format(parseISODate(value)) : '—'
}

export function formatDateLong(value: string | null | undefined): string {
  return value ? long.format(parseISODate(value)) : '—'
}

export function formatDateRange(start: string, end?: string | null): string {
  if (!end || end === start) return formatDate(start)
  const s = parseISODate(start)
  const e = parseISODate(end)
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${short.format(e)}`
  }
  return `${short.format(s)} – ${short.format(e)}`
}

export function formatDateTime(timestamp: string | null | undefined): string {
  return timestamp ? dateTime.format(new Date(timestamp)) : '—'
}

export function formatMonthYear(date: Date): string {
  return monthYear.format(date)
}

/** "14:30:00" → "2:30 PM" */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [h, m] = value.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} d ago`
  return short.format(new Date(timestamp))
}

/** Every calendar day an event touches, as ISO strings (capped to avoid runaway ranges). */
export function eachDay(start: string, end?: string | null, cap = 31): string[] {
  const from = parseISODate(start)
  const to = parseISODate(end && end >= start ? end : start)
  const days: string[] = []
  for (let d = new Date(from); d <= to && days.length < cap; d.setDate(d.getDate() + 1)) {
    days.push(toISODate(d))
  }
  return days
}

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
