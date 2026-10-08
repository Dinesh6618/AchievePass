/**
 * Chart colours. Every hue below was run through the dataviz palette validator on the white card
 * surface (#ffffff):
 *   verified/pending/rejected  → passes lightness, chroma, CVD ΔE ≥ 15 and normal-vision floors
 *   + info blue (4 outcomes)   → passes the same gates
 * `pending` (gold) is 2.57:1 on white, which the method allows only with visible labels or a table
 * view — every chart here ships a legend with counts, tooltips and a "View as table" twin.
 * `neutral` is the deliberate de-emphasis grey of the "emphasis" form; it is not an identity hue.
 * The app is light-only, so there is no dark variant.
 */
export const CHART = {
  surface: '#ffffff',
  /** slot 1 — a lone series (the title names it, so no legend box) */
  primary: '#2563a8',
  verified: '#1f7a4d',
  pending: '#c99a3b',
  info: '#2563a8',
  rejected: '#b4322d',
  neutral: '#7088a9',

  // chrome: recessive, solid hairlines, text in ink tokens (never the data colour)
  grid: '#f3eee2',
  axis: '#d6cdb6',
  tick: '#4e668a',
  ink: '#131e31',
  inkSecondary: '#3b5072',
} as const

export const BAR_THICKNESS = 20 // ≤ 24px, never fill the slot
export const BAR_RADIUS = 4 // rounded data end only

export const tickStyle = { fill: CHART.tick, fontSize: 12 } as const
