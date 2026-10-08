import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

/** Built on the native <dialog>: focus trapping, Escape-to-close and aria-modal come for free. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-xl border border-paper-200 bg-white p-0 shadow-xl backdrop:bg-ink-950/50',
        widths[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-paper-200 px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-md p-1.5 text-ink-500 hover:bg-paper-100 hover:text-ink-900"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-paper-200 bg-paper/60 px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  loading,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-700">{message}</div>
    </Modal>
  )
}
