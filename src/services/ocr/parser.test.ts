import { describe, expect, it } from 'vitest'
import { compareStudentName, extractDates, parseCertificateText } from './parser'

const HACKATHON = `VM COLLEGE OF ENGINEERING
CERTIFICATE OF ACHIEVEMENT
This is to certify that Mr. DINESH KUMAR of III Year B.Tech Computer Science and Engineering has participated in the National Level Hackathon "VMEDITHON V3.0" organized by XYZ Institute of Technology held on 17 September 2026 and secured Finalist position.
Date of issue: 25 September 2026`

const WORKSHOP = `RAJAM INSTITUTE OF TECHNOLOGY
Department of Information Technology
CERTIFICATE OF PARTICIPATION
Presented to
PRIYA SHARMA
for actively participating in the Two Day Workshop on "Cloud Computing with AWS"
conducted by AWS Student Community on 12-13 March 2026.`

const SIH = `Smart India Hackathon 2026
Certificate of Participation
This certificate is awarded to K. Dinesh for participating in Smart India Hackathon 2026 (Grand Finale) held on 09/12/2026 at Pune.
Ministry of Education's Innovation Cell`

describe('parseCertificateText', () => {
  it('reads a hackathon finalist certificate', () => {
    const f = parseCertificateText(HACKATHON)
    expect(f.studentName).toBe('Dinesh Kumar')
    expect(f.eventName).toBe('VMEDITHON V3.0')
    expect(f.organization).toBe('XYZ Institute of Technology')
    expect(f.startDate).toBe('2026-09-17') // event date, not the 25 Sep issue date
    expect(f.endDate).toBeNull()
    expect(f.result).toBe('Finalist')
    expect(f.certificateType).toBe('hackathon')
  })

  it('reads a multi-day workshop and keeps the topic', () => {
    const f = parseCertificateText(WORKSHOP)
    expect(f.studentName).toBe('Priya Sharma')
    expect(f.eventName).toBe('Two Day Workshop on Cloud Computing with AWS')
    expect(f.organization).toBe('AWS Student Community')
    expect(f.startDate).toBe('2026-03-12')
    expect(f.endDate).toBe('2026-03-13')
    expect(f.result).toBe('Participant')
    expect(f.certificateType).toBe('workshop')
  })

  it('handles initials and day-first numeric dates', () => {
    const f = parseCertificateText(SIH)
    expect(f.studentName).toBe('K. Dinesh')
    expect(f.eventName).toBe('Smart India Hackathon 2026 (Grand Finale)')
    expect(f.startDate).toBe('2026-12-09')
    expect(f.certificateType).toBe('hackathon')
  })

  it('returns nulls instead of guessing on unrelated text', () => {
    const f = parseCertificateText('Invoice 4471\nTotal due: 1,200.00')
    expect(f).toEqual({
      studentName: null,
      eventName: null,
      organization: null,
      startDate: null,
      endDate: null,
      result: null,
      certificateType: null,
    })
  })
})

describe('extractDates', () => {
  it('parses the common written formats and rejects impossible dates', () => {
    const starts = (t: string) => extractDates(t).map((d) => d.start)
    expect(starts('17th Sep, 2026')).toEqual(['2026-09-17'])
    expect(starts('September 17, 2026')).toEqual(['2026-09-17'])
    expect(starts('2026-09-17')).toEqual(['2026-09-17'])
    expect(starts('31/02/2026')).toEqual([]) // no 31 Feb, no month 31
    expect(starts('13/25/2026')).toEqual([])
  })

  it('flips month-first numerics when day-first is impossible', () => {
    expect(extractDates('12/25/2026')[0].start).toBe('2026-12-25')
  })

  it('treats "17 & 18 September 2026" as one range', () => {
    const [hit] = extractDates('held on 17th & 18th September 2026')
    expect(hit).toMatchObject({ start: '2026-09-17', end: '2026-09-18' })
  })
})

describe('compareStudentName', () => {
  it('matches the spec example: extracted first name only', () => {
    expect(compareStudentName('Dinesh Kumar', 'Dinesh')).toBe('partial')
    expect(compareStudentName('Dinesh', 'Dinesh Kumar')).toBe('match')
  })

  it('tolerates initials, order and one-letter OCR slips', () => {
    expect(compareStudentName('Dinesh Kumar', 'K. Dinesh')).toBe('match')
    expect(compareStudentName('Kumar Dinesh', 'Dinesh Kumar')).toBe('match')
    expect(compareStudentName('Dinesh Kumar', 'Dinesh Kumer')).toBe('match')
    expect(compareStudentName('Dinesh Kumar', 'Mr. Dinesh Kumar')).toBe('match')
  })

  it('flags a different person', () => {
    expect(compareStudentName('Dinesh Kumar', 'Priya Sharma')).toBe('mismatch')
  })

  it('falls back to the raw text when no name was extracted', () => {
    expect(compareStudentName('Dinesh Kumar', null, 'awarded to dinesh kumar of CSE')).toBe('match')
    expect(compareStudentName('Dinesh Kumar', null, 'awarded to someone else')).toBe('mismatch')
    expect(compareStudentName('Dinesh Kumar', null, '')).toBe('unknown')
  })
})
