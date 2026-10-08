import { useState } from 'react'
import { Download, ExternalLink, FileWarning } from 'lucide-react'
import { AnchorButton, ErrorState, Skeleton } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { createSignedUrl } from '@/services/storageService'

interface Source {
  /** already-resolved URL (blob: URL for a file the user just picked) */
  url: string
  mime: string
  name: string
}

interface CertificateViewerProps {
  /** Storage path of a saved certificate; a short-lived signed URL is created for it. */
  path?: string
  mime?: string
  name?: string
  /** A local file being previewed before upload/submit. */
  local?: Source
  className?: string
}

/** Clean viewer for the evidence file: image or PDF, with open / download fallbacks. */
export function CertificateViewer({ path, mime, name, local, className }: CertificateViewerProps) {
  const signed = useAsync(() => createSignedUrl(path!, 3600), [path], { enabled: Boolean(path) && !local, context: 'certificate url' })
  const [imageFailed, setImageFailed] = useState(false)

  const source: Source | null = local ?? (signed.data && mime && name ? { url: signed.data, mime, name } : null)

  const stage = cn('flex min-h-[320px] items-center justify-center overflow-hidden rounded-lg border border-paper-200 bg-paper-100', className)

  if (!local && signed.loading && !source) {
    return (
      <div className={stage} role="status" aria-label="Loading certificate">
        <Skeleton className="h-72 w-full rounded-none" />
      </div>
    )
  }
  if (!local && signed.error) {
    return <ErrorState message={signed.error} onRetry={signed.reload} />
  }
  if (!source) return null

  const isPdf = source.mime === 'application/pdf'

  return (
    <div className="space-y-2">
      <div className={stage}>
        {isPdf ? (
          <iframe title={`Certificate: ${source.name}`} src={source.url} className="h-[560px] w-full bg-white" />
        ) : imageFailed ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-ink-500">
            <FileWarning className="size-6" aria-hidden />
            We couldn't display this image. Try opening it in a new tab.
          </div>
        ) : (
          <img
            src={source.url}
            alt={`Certificate: ${source.name}`}
            className="max-h-[640px] w-full object-contain"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-ink-500">{source.name}</p>
        <div className="flex gap-2">
          <AnchorButton href={source.url} target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-3.5" aria-hidden />}>
            Open
          </AnchorButton>
          <AnchorButton href={source.url} download={source.name} icon={<Download className="size-3.5" aria-hidden />}>
            Download
          </AnchorButton>
        </div>
      </div>
    </div>
  )
}
