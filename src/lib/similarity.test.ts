import { describe, expect, it } from 'vitest'
import { levenshtein, nameSimilarity, normalizeText, tokenDice } from './similarity'

describe('similarity', () => {
  it('normalises case, accents and punctuation', () => {
    expect(normalizeText('  VMEDITHON  V3.0!! ')).toBe('vmedithon v3 0')
    expect(normalizeText('Café-Hack')).toBe('cafe hack')
  })

  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
  })

  it('treats near-identical event names as duplicates but different events as distinct', () => {
    expect(nameSimilarity('VMEDITHON V3.0', 'vmedithon v3')).toBeGreaterThanOrEqual(0.82)
    expect(nameSimilarity('Smart India Hackathon 2026', 'Smart India Hackathon, 2026')).toBe(1)
    expect(nameSimilarity('Hackathon', 'Smart India Hackathon')).toBeLessThan(0.82)
    expect(nameSimilarity('Cloud Computing Workshop', 'Robotics Symposium')).toBeLessThan(0.5)
  })

  it('is order-insensitive at the word level', () => {
    expect(tokenDice('Machine Learning Workshop', 'Workshop Machine Learning')).toBe(1)
  })
})
