/**
 * End-to-end check of the certificate "reading" path that needs no OCR engine:
 *   generated PDF (what scripts/seed.mjs uploads) → pdf.js text layer → itemsToText → parser.
 * Uses pdf.js's Node build; the browser provider uses the same extraction code.
 */
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM helper without type declarations
import { makePdf } from './lib/makePdf.mjs'
import { compareStudentName, parseCertificateText } from '../src/services/ocr/parser'
import { itemsToText } from '../src/services/ocr/tesseractProvider'

async function pdfText(bytes: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 })
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    return itemsToText((await page.getTextContent()).items)
  } finally {
    await task.destroy()
  }
}

describe('generated certificate PDF → text → fields', () => {
  it('round-trips the seed certificate', async () => {
    const pdf = makePdf([
      'CERTIFICATE OF ACHIEVEMENT',
      'XYZ INSTITUTE OF TECHNOLOGY',
      'This is to certify that DINESH KUMAR of CSE Department',
      'has participated in the VMEDITHON V3.0 organized by XYZ Institute of Technology',
      'held on 17 September 2026 and secured Finalist.',
      '',
      'Organizing Secretary                       Convenor',
    ])
    const text = await pdfText(pdf)
    expect(text).toContain('CERTIFICATE OF ACHIEVEMENT')

    const fields = parseCertificateText(text)
    expect(fields.studentName).toBe('Dinesh Kumar')
    expect(fields.eventName).toBe('VMEDITHON V3.0')
    expect(fields.organization).toBe('XYZ Institute of Technology')
    expect(fields.startDate).toBe('2026-09-17')
    expect(fields.result).toBe('Finalist')
    expect(fields.certificateType).toBe('hackathon')
    expect(compareStudentName('Dinesh Kumar', fields.studentName, text)).toBe('match')
  })

  it('keeps reading order top to bottom', async () => {
    const text = await pdfText(makePdf(['TITLE LINE', 'second line', 'third line']))
    expect(text.split('\n').map((l) => l.trim())).toEqual(['TITLE LINE', 'second line', 'third line'])
  })
})
