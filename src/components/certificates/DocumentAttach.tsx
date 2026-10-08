import { useEffect, useRef, useState } from 'react'
import { FileText, Paperclip, Trash2 } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import { reportError } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import {
  ACCEPT_ATTR,
  buildStoragePath,
  MAX_UPLOAD_BYTES,
  removeFiles,
  uploadWithProgress,
  validateUpload,
} from '@/services/storageService'

export interface AttachedDocument {
  path: string
  name: string
  size?: number
  /** true when uploaded in this session and not yet saved with the request */
  fresh: boolean
}

interface DocumentAttachProps {
  userId: string
  label: string
  hint?: string
  value: AttachedDocument | null
  onChange: (doc: AttachedDocument | null) => void
  disabled?: boolean
}

/** Optional supporting file (invitation letter, permission slip…) uploaded to the private bucket. */
export function DocumentAttach({ userId, label, hint, value, onChange, disabled }: DocumentAttachProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const pick = async (file: File) => {
    setError(null)
    const problem = validateUpload(file)
    if (problem) return setError(problem)

    const controller = (abort.current = new AbortController())
    const path = buildStoragePath(userId, file.name, 'od')
    setProgress(0)
    try {
      await uploadWithProgress(path, file, setProgress, controller.signal)
      // a freshly uploaded file that is being replaced was never saved, so it can go
      if (value?.fresh) void removeFiles([value.path])
      onChange({ path, name: file.name, size: file.size, fresh: true })
    } catch (err) {
      void removeFiles([path])
      if ((err as { code?: string })?.code !== 'aborted') {
        setError(reportError(err, 'document upload', "The upload didn't finish. Please try again."))
      }
    } finally {
      setProgress(null)
    }
  }

  const remove = () => {
    if (value?.fresh) void removeFiles([value.path])
    onChange(null)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink-800">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void pick(file)
        }}
      />
      {error && <Alert tone="error">{error}</Alert>}

      {progress !== null ? (
        <div className="rounded-md border border-paper-300 bg-white p-3" aria-live="polite">
          <p className="text-sm text-ink-700">Uploading… {Math.round(progress * 100)}%</p>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-200"
          >
            <div className="h-full rounded-full bg-gold-500" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : value ? (
        <div className="flex items-center gap-3 rounded-md border border-paper-300 bg-white p-3">
          <FileText className="size-5 shrink-0 text-ink-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.name}</p>
            {value.size !== undefined && <p className="text-xs text-ink-500">{formatBytes(value.size)}</p>}
          </div>
          <Button size="sm" variant="ghost" onClick={remove} disabled={disabled} icon={<Trash2 className="size-3.5" aria-hidden />}>
            Remove
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          icon={<Paperclip className="size-4" aria-hidden />}
        >
          Attach a file
        </Button>
      )}
      <p className="text-xs text-ink-500">{hint ?? `PDF, JPG or PNG · up to ${formatBytes(MAX_UPLOAD_BYTES)}`}</p>
    </div>
  )
}
