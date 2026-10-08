export type ClassValue = string | false | null | undefined | 0 | ClassValue[]

/** Tiny className joiner (we do not need tailwind-merge's conflict resolution here). */
export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  for (const v of values) {
    if (!v) continue
    if (Array.isArray(v)) {
      const inner = cn(...v)
      if (inner) out.push(inner)
    } else {
      out.push(v)
    }
  }
  return out.join(' ')
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * PostgREST `.or()` / `.ilike()` filters are built from strings, so user input must not be
 * able to inject extra filter syntax. Keep letters, digits, spaces and a few safe separators.
 */
export function sanitizeSearchTerm(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s._\-@/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
  wrapped.cancel = () => t && clearTimeout(t)
  return wrapped
}

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const item of items) {
    const k = key(item)
    ;(out[k] ??= []).push(item)
  }
  return out
}

/** Random temporary password (letters + digits, no look-alike characters) using the browser CSPRNG. */
export function generatePassword(length = 12): string {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + digits
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length]
  const chars = [pick(letters), pick(digits)]
  while (chars.length < length) chars.push(pick(all))
  // Fisher–Yates so the guaranteed letter/digit aren't always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** Cryptographically strong id for storage object names. */
export function randomId(): string {
  return crypto.randomUUID()
}

export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  return `${base || 'file'}${ext ? `.${ext}` : ''}`
}
