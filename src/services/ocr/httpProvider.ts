import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import type { ExtractedFields, OcrProvider, RawScan } from './types'

/**
 * Plug in any server-side OCR / Document-AI service by pointing VITE_OCR_API_URL at an
 * endpoint of your own (keep third-party API keys on that server, never in this bundle).
 *
 * Request : POST multipart/form-data, field "file" = the certificate (PDF/JPG/PNG)
 * Response: 200 application/json — every key optional
 *   {
 *     "text":   "full recognised text",              // parsed here if "fields" is missing
 *     "fields": {                                    // overrides parsed values
 *       "student_name": "...", "event_name": "...", "organization": "...",
 *       "start_date": "2026-09-17", "end_date": null, "result": "Finalist",
 *       "certificate_type": "hackathon"              // an event-category slug
 *     },
 *     "confidence": 0-100
 *   }
 */
interface HttpResponse {
  text?: string
  confidence?: number
  fields?: Partial<{
    student_name: string | null
    event_name: string | null
    organization: string | null
    start_date: string | null
    end_date: string | null
    result: string | null
    certificate_type: string | null
  }>
}

const TIMEOUT_MS = 45_000

export const httpProvider: OcrProvider = {
  id: 'http',
  label: 'Remote OCR service',

  isAvailable: () => /^https?:\/\//.test(env.ocrApiUrl),

  async scan(file, ctx): Promise<RawScan> {
    ctx.onProgress?.(0.1, 'Sending the certificate to the reader…')
    const body = new FormData()
    body.append('file', file)

    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout

    const res = await fetch(env.ocrApiUrl, { method: 'POST', body, signal })
    if (!res.ok) throw new AppError(`The OCR service returned an error (${res.status}).`)

    const json = (await res.json()) as HttpResponse
    ctx.onProgress?.(1, 'Done')

    const f = json.fields ?? {}
    const fields: Partial<ExtractedFields> = {}
    const set = <K extends keyof ExtractedFields>(key: K, value: string | null | undefined) => {
      if (value) fields[key] = value as ExtractedFields[K]
    }
    set('studentName', f.student_name)
    set('eventName', f.event_name)
    set('organization', f.organization)
    set('startDate', f.start_date)
    set('endDate', f.end_date)
    set('result', f.result)
    set('certificateType', f.certificate_type)

    return { text: json.text, fields, confidence: json.confidence, source: 'remote' }
  },
}
