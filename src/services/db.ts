import type { PostgrestError } from '@supabase/supabase-js'

type Result<T> = { data: T | null; error: PostgrestError | null }

/** Throws the PostgREST error (so `toUserMessage` can translate it) or returns the data. */
export function unwrap<T>(res: Result<T>): T {
  if (res.error) throw res.error
  return res.data as T
}

/** Same as unwrap but for queries that may legitimately return no row. */
export function unwrapMaybe<T>(res: Result<T>): T | null {
  if (res.error) throw res.error
  return res.data ?? null
}

/** PostgREST returns an object for to-one embeds and an array otherwise. Normalise to one-or-null. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Fetches every row of a query by walking the 1000-row PostgREST page limit.
 * `max` is a safety net for runaway reports.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<Result<T[]>>,
  pageSize = 1000,
  max = 20000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; from < max; from += pageSize) {
    const rows = unwrap(await build(from, from + pageSize - 1))
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}

export interface Page<T> {
  rows: T[]
  total: number
}
