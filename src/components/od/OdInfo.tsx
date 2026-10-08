import { ExternalLink, Paperclip } from 'lucide-react'
import { AnchorButton, DescriptionList, Skeleton } from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { formatDateRange, formatTime } from '@/lib/dates'
import { createSignedUrl } from '@/services/storageService'
import type { OdDetail } from '@/types'

export function AttachmentLink({ path, name }: { path: string; name: string | null }) {
  const url = useAsync(() => createSignedUrl(path, 3600), [path], { context: 'attachment url' })
  if (url.loading && !url.data) return <Skeleton className="h-9 w-48" />
  if (!url.data) return <span className="text-sm text-ink-500">Attachment unavailable{url.error ? ` — ${url.error}` : ''}</span>
  return (
    <AnchorButton href={url.data} target="_blank" rel="noopener noreferrer" icon={<Paperclip className="size-3.5" aria-hidden />}>
      {name ?? 'Open attachment'} <ExternalLink className="size-3" aria-hidden />
    </AnchorButton>
  )
}

/** Event + reason + attachment, shared by the student's page and the faculty review screen. */
export function OdInfo({ od }: { od: OdDetail }) {
  const time = od.start_time ? `${formatTime(od.start_time)}${od.end_time ? ` – ${formatTime(od.end_time)}` : ''}` : null
  return (
    <div className="space-y-5">
      <DescriptionList
        items={[
          { label: 'Event', value: od.event_name },
          { label: 'Event type', value: od.category_name },
          { label: 'Organization', value: od.organization },
          { label: 'Date', value: formatDateRange(od.event_date, od.event_end_date) },
          { label: 'Time', value: time },
          { label: 'Venue', value: od.venue },
        ]}
      />
      <div className="border-t border-paper-200 pt-4">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-500">Reason for OD</p>
        <p className="mt-1 whitespace-pre-line text-sm text-ink-900">{od.reason}</p>
      </div>
      {od.additional_document_path && (
        <div className="border-t border-paper-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-500">Additional document</p>
          <AttachmentLink path={od.additional_document_path} name={od.additional_document_name} />
        </div>
      )}
    </div>
  )
}
