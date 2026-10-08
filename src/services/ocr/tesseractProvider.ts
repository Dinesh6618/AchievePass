import { AppError } from '@/lib/errors'
import type { OcrProvider, RawScan, ScanContext } from './types'

/**
 * In-browser OCR: no API key, no data leaves the device.
 *  - PDFs with a text layer are read directly with pdf.js (exact, instant).
 *  - Scanned PDFs and photos go through Tesseract.js.
 * Both libraries are dynamically imported, so they only cost bandwidth when a certificate is scanned.
 * Tesseract fetches its language data from a CDN on first use; if that fails the caller falls back to manual entry.
 */

const MAX_IMAGE_SIDE = 2400
const MIN_PDF_TEXT_CHARS = 40

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AppError('Scan cancelled.', 'aborted')
}

async function loadPdf(file: File) {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const data = new Uint8Array(await file.arrayBuffer())
  // pdf.js >= 6.2 (patched against arbitrary code execution from a crafted PDF). The upload is untrusted
  // input, so keep this dependency current. The loading task owns cleanup in v6.
  const task = pdfjs.getDocument({ data })
  return { task, doc: await task.promise }
}

interface TextItemLike {
  str: string
  transform: number[]
  hasEOL?: boolean
}

/** Rebuilds reading-order lines from pdf.js text items. */
export function itemsToText(items: unknown[]): string {
  const lines: { y: number; parts: { x: number; s: string }[] }[] = []
  for (const raw of items) {
    const item = raw as TextItemLike
    if (typeof item.str !== 'string' || !item.str.trim()) continue
    const x = item.transform[4]
    const y = item.transform[5]
    const line = lines.find((l) => Math.abs(l.y - y) < 3)
    if (line) line.parts.push({ x, s: item.str })
    else lines.push({ y, parts: [{ x, s: item.str }] })
  }
  return lines
    .sort((a, b) => b.y - a.y) // PDF y-axis points up
    .map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '))
    .join('\n')
}

async function pdfFirstPage(file: File) {
  const { task, doc } = await loadPdf(file)
  try {
    const page = await doc.getPage(1)
    const text = itemsToText((await page.getTextContent()).items)
    return { page, text, task }
  } catch (err) {
    await task.destroy()
    throw err
  }
}

async function renderPdfPage(page: Awaited<ReturnType<typeof pdfFirstPage>>['page']): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(3, MAX_IMAGE_SIDE / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AppError('This browser cannot render the PDF for scanning.')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas
}

/** Phone photos can be 12+ MP; shrinking keeps Tesseract fast and memory-safe. */
async function imageSource(file: File): Promise<Blob | HTMLCanvasElement> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas
  } catch {
    return file
  }
}

async function recognize(source: Blob | HTMLCanvasElement, ctx: ScanContext): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import('tesseract.js')
  throwIfAborted(ctx.signal)

  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') ctx.onProgress?.(0.3 + m.progress * 0.7, 'Reading your certificate…')
      else if (m.status.includes('loading') || m.status.includes('initializ')) {
        ctx.onProgress?.(0.05 + m.progress * 0.25, 'Preparing the reader…')
      }
    },
  })
  const onAbort = () => void worker.terminate()
  ctx.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const { data } = await worker.recognize(source)
    throwIfAborted(ctx.signal)
    return { text: data.text, confidence: data.confidence }
  } finally {
    ctx.signal?.removeEventListener('abort', onAbort)
    await worker.terminate().catch(() => undefined)
  }
}

export const tesseractProvider: OcrProvider = {
  id: 'tesseract',
  label: 'On-device OCR (Tesseract.js)',

  isAvailable: () => typeof window !== 'undefined' && typeof document !== 'undefined',

  async scan(file, ctx): Promise<RawScan> {
    ctx.onProgress?.(0.02, 'Opening the file…')

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const { page, text, task } = await pdfFirstPage(file)
      try {
        if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT_CHARS) {
          ctx.onProgress?.(1, 'Done')
          return { text, source: 'pdf-text' }
        }
        // Scanned PDF: no text layer, so render the first page and OCR it.
        ctx.onProgress?.(0.1, 'Rendering the PDF page…')
        const canvas = await renderPdfPage(page)
        const result = await recognize(canvas, ctx)
        return { text: result.text, confidence: result.confidence, source: 'ocr' }
      } finally {
        await task.destroy()
      }
    }

    const source = await imageSource(file)
    const result = await recognize(source, ctx)
    return { text: result.text, confidence: result.confidence, source: 'ocr' }
  },
}
