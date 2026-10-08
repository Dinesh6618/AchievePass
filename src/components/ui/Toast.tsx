import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const styles: Record<ToastKind, { box: string; icon: typeof Info }> = {
  success: { box: 'border-verified-600/40 bg-verified-50 text-verified-700', icon: CheckCircle2 },
  error: { box: 'border-rejected-600/40 bg-rejected-50 text-rejected-700', icon: XCircle },
  info: { box: 'border-info-600/40 bg-info-50 text-info-700', icon: Info },
  warning: { box: 'border-pending-600/40 bg-pending-50 text-pending-700', icon: AlertTriangle },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setItems((cur) => [...cur.slice(-3), { id, kind, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 5000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
      warning: (m) => push('warning', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {items.map((t) => {
          const s = styles[t.kind]
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg',
                s.box,
              )}
            >
              <s.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="flex-1 font-medium">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-m-1 rounded p-1 opacity-70 hover:opacity-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
