export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

/**
 * Cells starting with = + - @ (or tab/CR) can run as formulas when the file is
 * opened in Excel/Sheets. Student-supplied text goes into these exports, so
 * neutralise those cells with a leading apostrophe.
 */
function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCSV<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadCSV(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
