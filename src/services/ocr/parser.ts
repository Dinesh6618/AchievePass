import { nameSimilarity, tokens } from '@/lib/similarity'
import type { ExtractedFields, NameCheck } from './types'

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const ORD = '(?:st|nd|rd|th)?'

function iso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

interface DateHit {
  start: string
  end: string | null
  index: number
  /** higher = more likely to be the event date than an issue date */
  score: number
}

function scoreByContext(text: string, index: number): number {
  const before = text.slice(Math.max(0, index - 45), index).toLowerCase()
  let score = 0
  if (/(held on|conducted on|organi[sz]ed on|event date|date of event|from|during|dated|on)\s*[:\-]?\s*$/.test(before)) score += 2
  if (/(date of issue|issued on|issue date|issued)\s*[:\-]?\s*$/.test(before)) score -= 1
  if (/\bdate\s*[:\-]?\s*$/.test(before)) score -= 1
  return score
}

export function extractDates(text: string): DateHit[] {
  const flat = text.replace(/\s+/g, ' ')
  const hits: DateHit[] = []
  const taken: [number, number][] = []
  const overlaps = (a: number, b: number) => taken.some(([s, e]) => a < e && b > s)
  const add = (match: RegExpExecArray, start: string | null, end: string | null) => {
    if (!start) return
    const range: [number, number] = [match.index, match.index + match[0].length]
    if (overlaps(...range)) return
    taken.push(range)
    hits.push({ start, end, index: match.index, score: scoreByContext(flat, match.index) + (end ? 1 : 0) })
  }

  // 17-19 September 2026 / 17th & 18th Sep, 2026 / 17 to 19 September 2026
  for (const m of flat.matchAll(new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:-|–|—|to|&|and)\\s*(\\d{1,2})${ORD}\\s+${MONTH_RE}[a-z]*\\.?,?\\s+(\\d{4})\\b`, 'gi'))) {
    const month = MONTHS[m[3].toLowerCase()]
    const y = Number(m[4])
    const a = iso(y, month, Number(m[1]))
    const b = iso(y, month, Number(m[2]))
    if (a && b && b >= a) add(m as RegExpExecArray, a, b)
  }

  // 17 September 2026 / 17th Sep, 2026 / 17-Sep-2026
  for (const m of flat.matchAll(new RegExp(`\\b(\\d{1,2})${ORD}[\\s\\-/.,]*${MONTH_RE}[a-z]*\\.?[\\s\\-/.,]*(\\d{4})\\b`, 'gi'))) {
    add(m as RegExpExecArray, iso(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1])), null)
  }

  // September 17, 2026
  for (const m of flat.matchAll(new RegExp(`\\b${MONTH_RE}[a-z]*\\.?\\s+(\\d{1,2})${ORD},?\\s+(\\d{4})\\b`, 'gi'))) {
    add(m as RegExpExecArray, iso(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2])), null)
  }

  // 2026-09-17
  for (const m of flat.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    add(m as RegExpExecArray, iso(Number(m[1]), Number(m[2]), Number(m[3])), null)
  }

  // 17/09/2026 · 17-09-2026 · 17.09.2026  (day first, as is normal in India; flip if impossible)
  for (const m of flat.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b/g)) {
    const a = Number(m[1])
    const b = Number(m[2])
    const y = Number(m[3])
    add(m as RegExpExecArray, iso(y, b, a) ?? iso(y, a, b), null)
  }

  return hits.sort((x, y) => y.score - x.score || x.index - y.index)
}

// ---------------------------------------------------------------------------
// Student name
// ---------------------------------------------------------------------------

const NAME_TRIGGER =
  /\b(?:this is to certify that|is hereby awarded to|hereby awarded to|is awarded to|awarded to|proudly presented to|is presented to|presented to|certify that|certifies that|is granted to|conferred (?:up)?on|is given to|given to|name of the (?:participant|student)|(?:participant|student) name)\s*[:\-]?\s*/i

const HONORIFIC = /^(mr|ms|mrs|miss|dr|shri|smt|selvan|selvi|kum|prof|er)\.?$/i
const NAME_STOPWORDS = new Set([
  'of', 'from', 'for', 'has', 'have', 'had', 'studying', 'student', 'in', 'participated', 'participation',
  'secured', 'successfully', 'bearing', 'roll', 'reg', 'register', 'department', 'dept', 'with', 'who', 'as',
  'on', 'at', 'the', 'is', 'was', 'and', 'bearing', 'pursuing', 'final', 'second', 'third', 'first', 'year',
  'completed', 'attended', 'won', 'under', 'an', 'a', 'to', 'by', 'this', 'that', 'certificate', 'b', 'be',
])

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s'’-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

export function extractStudentName(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ')
  const trigger = NAME_TRIGGER.exec(flat)
  if (!trigger) return null
  const rest = flat.slice(trigger.index + trigger[0].length, trigger.index + trigger[0].length + 90)

  const picked: string[] = []
  for (const raw of rest.split(' ')) {
    const word = raw.replace(/[,;:]+$/g, '')
    if (!word) continue
    if (picked.length === 0 && HONORIFIC.test(word)) continue
    if (!/^[A-Za-z][A-Za-z.'’-]*$/.test(word)) break
    if (NAME_STOPWORDS.has(word.toLowerCase())) break
    // names are Capitalised or UPPERCASE; a lowercase word means the sentence went on
    if (!/^[A-Z]/.test(word)) break
    picked.push(word)
    if (picked.length === 5 || /[,;]$/.test(raw)) break
  }
  if (picked.length === 0) return null
  const joined = picked.join(' ')
  return joined === joined.toUpperCase() ? titleCase(joined) : joined
}

// ---------------------------------------------------------------------------
// Event, organisation, result, type
// ---------------------------------------------------------------------------

const EVENT_KEYWORDS =
  /\b(hackathon|ideathon|codeathon|\w+thon|workshop|symposium|conference|contest|competition|webinar|bootcamp|summit|techfest|olympiad|challenge|seminar|internship|paper presentation|tournament|championship|quiz|expo|fest|conclave|meetup|masterclass)\b/i

const EVENT_LEAD =
  /(?:participated in|participation in|participating in|participated at|attended|attending|secured (?:\w+ ){0,3}(?:in|at)|won (?:\w+ ){0,3}(?:in|at)|winner of|runner[- ]?up in|finalist in|completed|successfully completed|presented (?:a )?paper (?:titled|entitled)|entitled|titled|for (?:his|her|their) (?:participation|presentation) in|for participating in|in the event|in the)\s+(?:the\s+)?(?:an?\s+)?/gi

// Where the event title stops. Plain "on" is NOT a terminator ("Workshop on Cloud Computing"),
// a trailing date is trimmed separately by TRAILING_DATE.
const EVENT_END =
  /\s+(?:organi[sz]ed|conducted|held|hosted|jointly|in association|which|that|under|powered)\b|\.(?:\s|$)|[;|]|\s{2,}/i

const TRAILING_DATE = new RegExp(
  `\\s+(?:on|from|during|dated)\\s+(?:\\d|${MONTH_RE}\\b).*$`,
  'i',
)

function cleanup(value: string): string {
  return value.replace(/^[\s"“”'‘’:\-–—]+|[\s"“”'‘’:,\-–—.]+$/g, '').replace(/\s+/g, ' ').trim()
}

/** `National Level Hackathon "VMEDITHON V3.0"` → the quoted name; `Workshop on "Cloud"` → keep the topic. */
function resolveQuoted(raw: string): string {
  const q = /["“]([^"“”]{3,100})["”]/.exec(raw)
  if (!q) return cleanup(raw)
  const before = raw.slice(0, q.index)
  if (/\b(?:on|titled|entitled|:)\s*$/i.test(before)) return cleanup(raw.replace(/["“”]/g, ''))
  return cleanup(q[1])
}

export function extractEventName(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ')

  // "participated in the <EVENT> organised by …"
  EVENT_LEAD.lastIndex = 0
  let lead: RegExpExecArray | null
  while ((lead = EVENT_LEAD.exec(flat))) {
    const rest = flat.slice(lead.index + lead[0].length, lead.index + lead[0].length + 140)
    const end = EVENT_END.exec(rest)
    const cut = (end ? rest.slice(0, end.index) : rest).replace(TRAILING_DATE, '')
    const candidate = resolveQuoted(cut)
    if (candidate.length >= 4 && candidate.length <= 120 && !/^(a|an|the)\s*$/i.test(candidate)) return candidate
  }

  // "VMEDITHON V3.0" in quotes
  const quoted = /["“]([^"“”]{4,120})["”]/.exec(flat)
  if (quoted) {
    const q = cleanup(quoted[1])
    if (q && !/certificate/i.test(q)) return q
  }

  // A heading-style line that names an event type
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (line.length > 100 || line.length < 4) continue
    if (/certificate|presented|awarded|certify|signature|date|place:/i.test(line)) continue
    if (EVENT_KEYWORDS.test(line)) return cleanup(line)
  }
  return null
}

export function extractOrganization(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ')
  const lead = /(?:organi[sz]ed by|conducted by|hosted by|presented by|in association with|jointly (?:organi[sz]ed )?by|offered by|issued by|powered by)\s+(?:the\s+)?/i.exec(flat)
  if (lead) {
    const rest = flat.slice(lead.index + lead[0].length, lead.index + lead[0].length + 120)
    const end = /\s+(?:on|at|from|during|held|which|and\s+(?:was|were)|for)\b|\.(?:\s|$)|[;|]|\s{2,}/i.exec(rest)
    const candidate = cleanup(end ? rest.slice(0, end.index) : rest)
    if (candidate.length >= 3) return candidate
  }

  const orgLine = /(college|university|institute|institution|technolog|academy|school of|foundation|association|society|club|ieee|acm|pvt|ltd|labs|solutions|chapter)/i
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8)) {
    if (line.length >= 6 && line.length <= 100 && orgLine.test(line) && !/certificate|awarded|certify/i.test(line)) {
      return cleanup(line)
    }
  }
  return null
}

const RESULT_RULES: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/\b(?:first|1st)\s+(?:prize|place|position|rank)\b/i, 'First Prize'],
  [/\b(?:second|2nd)\s+(?:prize|place|position|rank)\b/i, 'Second Prize'],
  [/\b(?:third|3rd)\s+(?:prize|place|position|rank)\b/i, 'Third Prize'],
  [/\bwinners?\b/i, 'Winner'],
  [/\brunner[- ]?up\b/i, 'Runner-up'],
  [/\bsemi[- ]?finalists?\b/i, 'Semi-finalist'],
  [/\bfinalists?\b/i, 'Finalist'],
  [/\btop\s+(\d{1,3})\b/i, (m) => `Top ${m[1]}`],
  [/\bbest\s+(paper|project|team|performer|presentation|poster|idea)\b/i, (m) => `Best ${titleCase(m[1])}`],
  [/\bspecial\s+(?:mention|prize|jury)\b/i, 'Special Mention'],
  [/\bmerit\b/i, 'Merit'],
  [/\bparticipa(?:tion|nt|ted|ting)\b/i, 'Participant'],
  [/\b(?:completion|completed)\b/i, 'Completed'],
  [/\battend(?:ed|ee|ance)\b/i, 'Attendee'],
]

export function extractResult(text: string): string | null {
  for (const [pattern, label] of RESULT_RULES) {
    const m = pattern.exec(text)
    if (m) return typeof label === 'string' ? label : label(m)
  }
  return null
}

const TYPE_RULES: [string, RegExp][] = [
  ['hackathon', /\b(hackathon|ideathon|codeathon|\w+thon)\b/gi],
  ['paper-presentation', /\b(paper presentation|paper titled|research paper|poster presentation|paper entitled)\b/gi],
  ['internship', /\b(internship|intern)\b/gi],
  ['workshop', /\b(workshop|bootcamp|hands[- ]on|training (?:session|program))\b/gi],
  ['symposium', /\b(symposium|techfest|tech fest|technical fest|cultural fest)\b/gi],
  ['conference', /\b(conference|summit|webinar|seminar|conclave)\b/gi],
  ['competition', /\b(contest|competition|quiz|olympiad|challenge|tournament|championship)\b/gi],
  ['certification', /\b(nptel|coursera|udemy|certification|certified|certificate of completion|online course)\b/gi],
  ['club-activity', /\b(club|chapter|volunteer(?:ing)?|nss|ncc|student branch)\b/gi],
]

export function detectCertificateType(text: string): string | null {
  let best: { slug: string; hits: number } | null = null
  for (const [slug, pattern] of TYPE_RULES) {
    const hits = (text.match(pattern) ?? []).length
    // earlier rules win ties, so a hackathon "paper" prize isn't mistaken for a paper presentation
    if (hits > 0 && (!best || hits > best.hits)) best = { slug, hits }
  }
  return best?.slug ?? null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseCertificateText(text: string): ExtractedFields {
  const dates = extractDates(text)
  const best = dates[0]
  return {
    studentName: extractStudentName(text),
    eventName: extractEventName(text),
    organization: extractOrganization(text),
    startDate: best?.start ?? null,
    endDate: best?.end ?? null,
    result: extractResult(text),
    certificateType: detectCertificateType(text),
  }
}

function nameTokens(name: string): string[] {
  return tokens(name).filter((t) => !HONORIFIC.test(t))
}

/**
 * Compares the name found on the certificate with the logged-in student's profile name.
 * Tolerates initials ("K. Dinesh"), word order, extra surnames and small OCR typos.
 * When no name was extracted, falls back to looking for the profile name in the raw text.
 */
export function compareStudentName(profileName: string, extracted: string | null, rawText = ''): NameCheck {
  const mine = nameTokens(profileName)
  if (mine.length === 0) return 'unknown'

  const pool = extracted ? nameTokens(extracted) : []
  const haystack = pool.length ? pool : tokens(rawText)
  if (haystack.length === 0) return 'unknown'

  const covered = mine.filter((t) => {
    if (t.length === 1) return haystack.some((h) => h[0] === t)
    return haystack.some((h) => (h.length === 1 ? h === t[0] : nameSimilarity(h, t) >= 0.8))
  })
  const ratio = covered.length / mine.length

  if (ratio === 1) return 'match'
  if (ratio >= 0.5) return 'partial'
  return 'mismatch'
}
