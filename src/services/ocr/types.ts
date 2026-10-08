/**
 * OCR is deliberately isolated behind these types so the engine can be swapped
 * (in-browser Tesseract today; a cloud Document-AI service tomorrow) without touching UI code.
 */

/** What we try to read off a certificate. Every field is optional — OCR can miss any of them. */
export interface ExtractedFields {
  studentName: string | null
  eventName: string | null
  organization: string | null
  /** ISO yyyy-mm-dd */
  startDate: string | null
  endDate: string | null
  result: string | null
  /** slug of a seeded event category (e.g. "hackathon") */
  certificateType: string | null
}

export interface RawScan {
  /** Full text, when the engine returns it. The parser turns this into fields. */
  text?: string
  /** Fields the engine already structured itself (they win over parsed ones). */
  fields?: Partial<ExtractedFields>
  /** 0–100, if the engine reports one */
  confidence?: number
  /** how the text was obtained */
  source: 'pdf-text' | 'ocr' | 'remote'
}

export interface ScanContext {
  onProgress?: (fraction: number, status: string) => void
  signal?: AbortSignal
}

export interface OcrProvider {
  id: string
  label: string
  /** Cheap check (no network) — false means "go straight to manual entry". */
  isAvailable(): boolean
  scan(file: File, ctx: ScanContext): Promise<RawScan>
}

export type ScanOutcome =
  | { status: 'ok'; fields: ExtractedFields; rawText: string; provider: string; confidence?: number }
  | { status: 'empty'; provider: string; rawText: string } // engine ran but found nothing usable
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string; provider: string }

export type NameCheck = 'match' | 'partial' | 'mismatch' | 'unknown'
