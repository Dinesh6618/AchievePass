import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { reportError } from '@/lib/errors'

interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
}

/**
 * Runs `fn` whenever `deps` change and exposes loading / error / data.
 * Stale responses from superseded runs are ignored. `reload()` re-runs without
 * clearing the current data, so lists don't flash back to a skeleton.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList,
  options: { enabled?: boolean; context?: string } = {},
) {
  const { enabled = true, context = 'load' } = options
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: null, loading: enabled })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ data: s.data, error: reportError(err, context), loading: false }))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, context, ...deps])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback(
    (updater: T | ((prev: T | undefined) => T | undefined)) =>
      setState((s) => ({
        ...s,
        data: typeof updater === 'function' ? (updater as (p: T | undefined) => T | undefined)(s.data) : updater,
      })),
    [],
  )

  return { ...state, reload, setData }
}
