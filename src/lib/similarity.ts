/** Lower-cases, strips accents and punctuation, collapses whitespace. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function tokens(value: string): string[] {
  const n = normalizeText(value)
  return n ? n.split(' ') : []
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[b.length]
}

/** 1 = identical, 0 = nothing in common. Character-level similarity of the normalised strings. */
export function levenshteinRatio(a: string, b: string): number {
  const x = normalizeText(a)
  const y = normalizeText(b)
  const max = Math.max(x.length, y.length)
  return max === 0 ? 1 : 1 - levenshtein(x, y) / max
}

/** Sørensen–Dice coefficient over word sets: order-insensitive, penalises extra words. */
export function tokenDice(a: string, b: string): number {
  const x = new Set(tokens(a))
  const y = new Set(tokens(b))
  if (x.size === 0 && y.size === 0) return 1
  if (x.size === 0 || y.size === 0) return 0
  let shared = 0
  for (const t of x) if (y.has(t)) shared++
  return (2 * shared) / (x.size + y.size)
}

/** Best of character-level and word-level similarity — robust to typos and to re-ordered words. */
export function nameSimilarity(a: string, b: string): number {
  return Math.max(levenshteinRatio(a, b), tokenDice(a, b))
}
