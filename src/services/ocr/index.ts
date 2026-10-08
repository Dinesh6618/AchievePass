import { env } from '@/lib/env'
import { isNetworkError } from '@/lib/errors'
import { httpProvider } from './httpProvider'
import { parseCertificateText } from './parser'
import { tesseractProvider } from './tesseractProvider'
import type { ExtractedFields, OcrProvider, ScanContext, ScanOutcome } from './types'

export { compareStudentName, parseCertificateText } from './parser'
export type { ExtractedFields, NameCheck, ScanOutcome } from './types'

const PROVIDERS: Record<string, OcrProvider> = {
  tesseract: tesseractProvider,
  http: httpProvider,
}

/** "none" (or any unknown id) disables scanning: the wizard goes straight to manual entry. */
export function getOcrProvider(): OcrProvider | null {
  return PROVIDERS[env.ocrProvider] ?? null
}

const FIELD_KEYS = [
  'studentName', 'eventName', 'organization', 'startDate', 'endDate', 'result', 'certificateType',
] as const satisfies readonly (keyof ExtractedFields)[]

function hasAnyField(fields: ExtractedFields): boolean {
  return FIELD_KEYS.some((k) => Boolean(fields[k]))
}

/**
 * Reads a certificate and never throws for OCR problems: every failure becomes a
 * ScanOutcome the UI can explain, so the application never depends on OCR to work.
 * (A user-initiated cancel is the one case that rethrows an AppError with code "aborted".)
 */
export async function scanCertificate(file: File, ctx: ScanContext = {}): Promise<ScanOutcome> {
  const provider = getOcrProvider()
  if (!provider || !provider.isAvailable()) {
    return { status: 'unavailable', reason: 'Automatic reading is not enabled — please enter the details below.' }
  }

  try {
    const raw = await provider.scan(file, ctx)
    const rawText = raw.text ?? ''
    const parsed = rawText ? parseCertificateText(rawText) : null

    const fields: ExtractedFields = {
      studentName: null, eventName: null, organization: null,
      startDate: null, endDate: null, result: null, certificateType: null,
      ...parsed,
    }
    for (const [key, value] of Object.entries(raw.fields ?? {})) {
      if (value) (fields as unknown as Record<string, unknown>)[key] = value
    }

    if (!hasAnyField(fields)) return { status: 'empty', provider: provider.id, rawText }
    return { status: 'ok', fields, rawText, provider: provider.id, confidence: raw.confidence }
  } catch (err) {
    if ((err as { code?: string })?.code === 'aborted' || ctx.signal?.aborted) throw err
    console.error('[CertiPass] certificate scan failed', err)
    return {
      status: 'failed',
      provider: provider.id,
      reason: isNetworkError(err)
        ? "We couldn't load the certificate reader — check your connection. You can enter the details yourself."
        : "We couldn't read this certificate automatically. You can enter the details yourself.",
    }
  }
}
