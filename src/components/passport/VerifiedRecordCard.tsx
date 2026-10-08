import { useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Copy, Download, ExternalLink } from 'lucide-react'
import { VerifiedStamp } from '@/components/brand/VerifiedStamp'
import { AnchorButton, Button, useToast } from '@/components/ui'
import { downloadBlob } from '@/lib/csv'
import { formatDateRange } from '@/lib/dates'
import { verificationUrl } from '@/services/verificationService'
import { categoryIcon } from './categoryIcons'

interface VerifiedRecordCardProps {
  record: {
    event_name: string
    category_name: string
    category_slug: string
    result: string | null
    organization: string | null
    start_date: string
    end_date: string | null
    verification_code: string
  }
  studentName: string
  institution?: string | null
  /** compact = list tile; full = detail page */
  variant?: 'compact' | 'full'
}

/** The professional digital record: stamp, details and a scannable QR that opens the public check page. */
export function VerifiedRecordCard({ record, studentName, institution, variant = 'full' }: VerifiedRecordCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const toast = useToast()
  const url = verificationUrl(record.verification_code)
  const Icon = categoryIcon(record.category_slug)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Verification link copied.')
    } catch {
      toast.error("Couldn't copy automatically — select the ID and copy it manually.")
    }
  }

  const downloadQr = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) downloadBlob(`certipass-${record.verification_code}.png`, blob)
      else toast.error("Couldn't create the QR image. Try again.")
    })
  }

  return (
    <article className="card print-avoid-break overflow-hidden" aria-label={`Verified record: ${record.event_name}`}>
      <div className="flex items-center justify-between gap-3 bg-ink-900 px-5 py-3 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold-400">CertiPass verified</p>
        <p className="font-mono text-xs tracking-wider text-ink-200">{record.verification_code}</p>
      </div>

      <div className={variant === 'full' ? 'grid gap-6 p-5 sm:grid-cols-[1fr_auto]' : 'grid gap-4 p-4 sm:grid-cols-[1fr_auto]'}>
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gold-50 text-gold-600">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-600">{record.category_name}</p>
              <h3 className="break-words font-display text-xl font-semibold leading-snug">{record.event_name}</h3>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Student" value={studentName} />
            <Field label="Achievement" value={record.result ?? 'Participation'} />
            <Field label="Date" value={formatDateRange(record.start_date, record.end_date)} />
            <Field label="Organization" value={record.organization} />
            <Field label="Verified by" value={institution ?? 'Institution'} />
          </dl>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={copyLink} icon={<Copy className="size-3.5" aria-hidden />}>
              Copy link
            </Button>
            <AnchorButton href={url} target="_blank" rel="noopener noreferrer" icon={<ExternalLink className="size-3.5" aria-hidden />}>
              Public page
            </AnchorButton>
            <Button size="sm" variant="secondary" onClick={downloadQr} icon={<Download className="size-3.5" aria-hidden />}>
              QR image
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:gap-3">
          <div className="rounded-lg border border-paper-200 bg-white p-2">
            <QRCodeCanvas
              ref={canvasRef}
              value={url}
              size={variant === 'full' ? 148 : 112}
              level="M"
              marginSize={1}
              title={`QR code for ${record.verification_code}`}
            />
          </div>
          <VerifiedStamp className="size-16 sm:size-20" />
        </div>
      </div>
    </article>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="break-words text-ink-900">{value}</dd>
    </div>
  )
}
