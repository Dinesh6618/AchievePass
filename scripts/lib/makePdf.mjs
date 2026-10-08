/**
 * Builds a one-page PDF with a real text layer (Helvetica, no dependencies).
 * Used by the seed script so sample certificates can be read by the in-browser reader (pdf.js).
 */
export function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, '\\$&')
  let y = 740
  const content = ['BT', '/F1 22 Tf', '72 780 Td', `(${esc(lines[0])}) Tj`, 'ET']
  for (const line of lines.slice(1)) {
    content.push('BT', '/F1 13 Tf', `72 ${y} Td`, `(${esc(line)}) Tj`, 'ET')
    y -= 24
  }
  const stream = content.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}
