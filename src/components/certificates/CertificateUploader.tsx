import { useEffect, useRef, useState, type DragEvent } from 'react'
import { CheckCircle2, FileText, Info, Loader2, RefreshCcw, ScanText, Trash2, UploadCloud, X } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import { CertificateViewer } from './CertificateViewer'
import { reportError } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import { getOcrProvider, scanCertificate, type ScanOutcome } from '@/services/ocr'
import {
  ACCEPT_ATTR,
  buildStoragePath,
  MAX_UPLOAD_BYTES,
  removeFiles,
  resolveMime,
  sha256Hex,
  uploadWithProgress,
  validateUpload,
  type AcceptedMime,
} from '@/services/storageService'

export interface UploadedCertificate {
  storagePath: string
  fileName: string
  mime: AcceptedMime
  size: number
  hash: string | null
  /** blob: URL of the local file, used for the instant preview */
  previewUrl: string
}

interface WorkState {
  fileName: string
  uploadPct: number
  uploading: boolean
  scanning: boolean
  scanPct: number
  scanLabel: string
}

interface CertificateUploaderProps {
  userId: string
  value: UploadedCertificate | null
  scan: ScanOutcome | null
  /** A certificate already saved on the achievement (edit mode), shown until replaced. */
  existing?: { path: string; mime: string; name: string } | null
  onChange: (cert: UploadedCertificate | null, scan: ScanOutcome | null) => void
  onBusyChange?: (busy: boolean) => void
}

/**
 * Upload-first drop zone. Uploading and reading (OCR) run in parallel; the user watches both,
 * can skip the reading at any time, and always ends up with a preview they can replace or remove.
 */
export function CertificateUploader({ userId, value, scan, existing, onChange, onBusyChange }: CertificateUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadAbort = useRef<AbortController | null>(null)
  const scanAbort = useRef<AbortController | null>(null)
  const [work, setWork] = useState<WorkState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const scanEnabled = getOcrProvider() !== null

  useEffect(
    () => () => {
      uploadAbort.current?.abort()
      scanAbort.current?.abort()
    },
    [],
  )

  const setBusy = (busy: boolean) => onBusyChange?.(busy)

  const discard = async (cert: UploadedCertificate | null) => {
    if (!cert) return
    URL.revokeObjectURL(cert.previewUrl)
    await removeFiles([cert.storagePath])
  }

  const handleFile = async (file: File) => {
    setError(null)
    const problem = validateUpload(file)
    if (problem) {
      setError(problem)
      return
    }
    const mime = resolveMime(file)
    if (!mime) return

    // Replacing: drop the previous upload (it was never attached to a record).
    const previous = value
    if (previous) {
      onChange(null, null)
      void discard(previous)
    }

    const upload = (uploadAbort.current = new AbortController())
    const reader = (scanAbort.current = new AbortController())
    const path = buildStoragePath(userId, file.name)
    const previewUrl = URL.createObjectURL(file)

    setBusy(true)
    setWork({
      fileName: file.name,
      uploadPct: 0,
      uploading: true,
      scanning: scanEnabled,
      scanPct: 0,
      scanLabel: 'Preparing the reader…',
    })

    const hashPromise = sha256Hex(file)
    const uploadPromise = uploadWithProgress(path, file, (p) => setWork((w) => w && { ...w, uploadPct: p }), upload.signal).then(
      () => setWork((w) => w && { ...w, uploading: false, uploadPct: 1 }),
    )
    const scanPromise: Promise<ScanOutcome | null> = scanEnabled
      ? scanCertificate(file, {
          signal: reader.signal,
          onProgress: (pct, label) => setWork((w) => w && { ...w, scanPct: pct, scanLabel: label }),
        })
          .catch(() => null) // skipped / cancelled → manual entry
          .finally(() => setWork((w) => w && { ...w, scanning: false }))
      : Promise.resolve(null)

    try {
      const [hash, , outcome] = await Promise.all([hashPromise, uploadPromise, scanPromise])
      onChange({ storagePath: path, fileName: file.name, mime, size: file.size, hash, previewUrl }, outcome)
    } catch (err) {
      reader.abort()
      URL.revokeObjectURL(previewUrl)
      void removeFiles([path]) // the upload may have partly landed
      if ((err as { code?: string })?.code !== 'aborted') {
        setError(reportError(err, 'certificate upload', "The upload didn't finish. Check your connection and try again."))
      }
    } finally {
      setWork(null)
      setBusy(false)
    }
  }

  const cancel = () => {
    uploadAbort.current?.abort()
    scanAbort.current?.abort()
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTR}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = '' // allow re-selecting the same file
        if (file) void handleFile(file)
      }}
    />
  )

  // ---- in flight -------------------------------------------------------------------
  if (work) {
    return (
      <div className="card space-y-5 p-6" aria-live="polite">
        {picker}
        <div className="flex items-center gap-3">
          <FileText className="size-5 shrink-0 text-ink-400" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{work.fileName}</p>
          <Button size="sm" variant="ghost" onClick={cancel} icon={<X className="size-4" aria-hidden />}>
            Cancel
          </Button>
        </div>

        <ProgressRow
          label="Uploading certificate"
          done={!work.uploading}
          value={work.uploadPct}
          icon={<UploadCloud className="size-4" aria-hidden />}
        />
        {scanEnabled && (
          <div>
            <ProgressRow
              label={work.scanLabel.startsWith('Reading') ? 'Reading your certificate…' : work.scanLabel}
              done={!work.scanning}
              value={work.scanPct}
              icon={<ScanText className="size-4" aria-hidden />}
            />
            {work.scanning && (
              <button
                type="button"
                onClick={() => scanAbort.current?.abort()}
                className="mt-1.5 text-xs font-medium text-ink-500 underline underline-offset-2 hover:text-ink-900"
              >
                Skip reading — I'll enter the details myself
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---- uploaded: preview ----------------------------------------------------------
  if (value || existing) {
    return (
      <div className="space-y-4">
        {picker}
        {error && <Alert tone="error">{error}</Alert>}
        <CertificateViewer
          local={value ? { url: value.previewUrl, mime: value.mime, name: value.fileName } : undefined}
          path={value ? undefined : existing?.path}
          mime={existing?.mime}
          name={existing?.name}
        />
        {value && <ScanBadge scan={scan} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            {value ? `${formatBytes(value.size)} · uploaded securely` : 'Saved with this achievement'}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              icon={<RefreshCcw className="size-3.5" aria-hidden />}
            >
              Replace
            </Button>
            {value && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const old = value
                  onChange(null, null)
                  void discard(old)
                }}
                icon={<Trash2 className="size-3.5" aria-hidden />}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ---- empty: drop zone -----------------------------------------------------------
  return (
    <div className="space-y-3">
      {error && <Alert tone="error" title="That file can't be used">{error}</Alert>}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors',
          dragging ? 'border-gold-500 bg-gold-50' : 'border-paper-300 bg-white',
        )}
      >
        {picker}
        <span className="flex size-14 items-center justify-center rounded-full bg-gold-50 text-gold-600">
          <UploadCloud className="size-7" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold">Upload your certificate</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-500">
          Drag a file here, or choose one. We'll read the details so you don't have to type them.
        </p>
        <Button className="mt-5" size="lg" onClick={() => inputRef.current?.click()} icon={<UploadCloud className="size-5" aria-hidden />}>
          Choose certificate
        </Button>
        <p className="mt-4 text-xs text-ink-400">PDF, JPG or PNG · up to {formatBytes(MAX_UPLOAD_BYTES)}</p>
      </div>
    </div>
  )
}

function ProgressRow({ label, value, done, icon }: { label: string; value: number; done: boolean; icon: React.ReactNode }) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium text-ink-800">
          {done ? <CheckCircle2 className="size-4 text-verified-600" aria-hidden /> : icon}
          {done ? label.replace(/…$/, '') : label}
        </span>
        <span className="tabular-nums text-ink-500">
          {done ? 'Done' : <Loader2 className="inline size-3.5 animate-spin" aria-hidden />} {!done && `${pct}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={done ? 100 : pct}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-200"
      >
        <div
          className={cn('h-full rounded-full transition-[width]', done ? 'bg-verified-600' : 'bg-gold-500')}
          style={{ width: `${done ? 100 : pct}%` }}
        />
      </div>
    </div>
  )
}

function ScanBadge({ scan }: { scan: ScanOutcome | null }) {
  if (!getOcrProvider()) return null
  if (!scan) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-500">
        <Info className="size-4" aria-hidden /> Reading was skipped — you'll enter the details yourself in the next step.
      </p>
    )
  }
  if (scan.status === 'ok') {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-verified-700">
        <CheckCircle2 className="size-4" aria-hidden /> We read your certificate — you'll confirm the details next.
      </p>
    )
  }
  return (
    <Alert tone="info">
      {scan.status === 'empty'
        ? "We couldn't find readable text on this certificate. You can enter the details yourself."
        : scan.reason}
    </Alert>
  )
}
