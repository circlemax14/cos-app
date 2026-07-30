// tests/unit/score-band-contrast.test.mjs
//
// WCAG-AA contrast enforcement for ScoreBand foreground/background pairs.
//
// BACKGROUND
//   ADR-0002 (Wellbeing Score) + ADR-0003 (Home redesign) define a 4-band
//   score palette used by the ScoreCard hero and the domain sparkline
//   chips: Thriving / Steady / Watch / Care. Each band renders a coloured
//   badge or tile with a label on top. The retokenize amend in ADR-0003
//   explicitly commits to WCAG-AA contrast (>= 4.5:1 for normal text) on
//   every fg/bg pair; that promise is load-bearing for accessibility
//   compliance and for the elder / low-vision cohort the app targets.
//
// WHAT THIS SUITE DEFENDS
//   For each of the four ScoreBand pairs (fg on bg AND, where applicable,
//   the inverse label styling), assert that the WCAG 2.x contrast ratio
//   is >= 4.5:1. The ratio is computed inline via the W3C-defined
//   relative-luminance formula so this file has zero external deps and
//   runs under the plain `node --test` harness (no TS transpile,
//   consistent with tests/unit/*.test.mjs).
//
// If a band pair drifts below 4.5:1, DO NOT lower the threshold to make
// this test pass. Retokenize the offending band and update
// SCORE_BAND_PAIRS below in lockstep with the design change.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// ── WCAG contrast helpers (inline; no external lib) ────────────────────
//
// Formulas: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
//           https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
//
// Accepts 6-digit hex like "#RRGGBB" (case-insensitive, leading `#`
// optional). Anything else throws — a malformed token in the table
// should trip the suite immediately rather than silently coerce.

function hexToRgb(hex) {
  const clean = hex.replace(/^#/, '').toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(clean)) {
    throw new Error(`hexToRgb: expected #RRGGBB, got ${JSON.stringify(hex)}`)
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

// sRGB → linear per WCAG 2.x.
function channelToLinear(c8) {
  const c = c8 / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const R = channelToLinear(r)
  const G = channelToLinear(g)
  const B = channelToLinear(b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrastRatio(fgHex, bgHex) {
  const L1 = relativeLuminance(fgHex)
  const L2 = relativeLuminance(bgHex)
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ── Sanity checks on the helpers themselves ────────────────────────────
//
// White on black is the canonical 21:1 extreme; same colour is exactly
// 1:1. If either identity drifts, the suite below is measuring the
// wrong thing and every downstream assertion is untrustworthy.

test('contrast helper: white on black is 21:1', () => {
  const r = contrastRatio('#FFFFFF', '#000000')
  // Allow tiny float slack; expected exact value is 21.
  assert.ok(
    Math.abs(r - 21) < 1e-6,
    `expected 21.0, got ${r}. Helper drift — do not trust downstream band assertions until fixed.`,
  )
})

test('contrast helper: identical colours are 1:1', () => {
  const r = contrastRatio('#7A5AF8', '#7A5AF8')
  assert.ok(
    Math.abs(r - 1) < 1e-6,
    `expected 1.0, got ${r}. Helper drift — do not trust downstream band assertions until fixed.`,
  )
})

// ── ScoreBand fg/bg pairs (ADR-0002 + ADR-0003 retokenize) ─────────────
//
// Each band ships two variants used across the ScoreCard hero, the
// sparkline chips, and the domain badges:
//   - `label`  — text foreground rendered ON the band's tint/fill
//   - `onFill` — text foreground rendered on the accent fill used when
//                the band is emphasized (e.g. the Care CTA button)
//
// The values below are the ADR-approved tokens. Retokenize amend in
// ADR-0003 forces WCAG-AA (>= 4.5:1) for every one.

const WCAG_AA_NORMAL_TEXT = 4.5

const SCORE_BAND_PAIRS = [
  // Thriving — deep green ink on soft mint tint; white on solid green.
  { band: 'Thriving', variant: 'label', fg: '#0B4A2F', bg: '#D6F1E2' },
  { band: 'Thriving', variant: 'onFill', fg: '#FFFFFF', bg: '#0B7A46' },

  // Steady — deep blue ink on soft sky tint; white on solid blue.
  { band: 'Steady', variant: 'label', fg: '#0B3A66', bg: '#DCEBF9' },
  { band: 'Steady', variant: 'onFill', fg: '#FFFFFF', bg: '#0B5FAE' },

  // Watch — deep amber ink on soft amber tint; near-black on solid amber
  // (white on amber famously fails AA, so the fill variant uses ink).
  { band: 'Watch', variant: 'label', fg: '#5C3A00', bg: '#FCE8B2' },
  { band: 'Watch', variant: 'onFill', fg: '#1A1300', bg: '#F5B301' },

  // Care — deep red ink on soft blush tint; white on solid red.
  { band: 'Care', variant: 'label', fg: '#6B0F1A', bg: '#FADCDF' },
  { band: 'Care', variant: 'onFill', fg: '#FFFFFF', bg: '#B3261E' },
]

// One test per pair so a single failure names the exact band + variant
// in the reporter output. Chunk-style discipline: mechanical wire, not
// a bundled sweep.
for (const { band, variant, fg, bg } of SCORE_BAND_PAIRS) {
  test(`ScoreBand contrast: ${band} / ${variant} (fg ${fg} on bg ${bg}) meets WCAG-AA 4.5:1`, () => {
    const ratio = contrastRatio(fg, bg)
    assert.ok(
      ratio >= WCAG_AA_NORMAL_TEXT,
      `WCAG-AA violation on ScoreBand[${band}].${variant}: ratio ${ratio.toFixed(
        2,
      )}:1 < 4.5:1 (fg ${fg}, bg ${bg}). Do NOT lower the threshold — retokenize the band and update SCORE_BAND_PAIRS. ADR-0002 + ADR-0003 retokenize amend commit to AA on every ScoreBand fg/bg pair.`,
    )
  })
}

// ── Self-verification (drift trip wires) ───────────────────────────────
//
// Prove the assertion actually snaps shut when a bad pair is submitted.
// If either self-check inverts, the ratio helper or the >= gate is
// broken and none of the ScoreBand assertions above can be trusted.

test('self-check: mid-grey text on white FAILS the 4.5:1 gate', () => {
  // #808080 on #FFFFFF is a canonical AA failure (~3.95:1).
  const ratio = contrastRatio('#808080', '#FFFFFF')
  assert.ok(
    ratio < WCAG_AA_NORMAL_TEXT,
    `self-check: expected mid-grey on white < 4.5:1, got ${ratio.toFixed(
      2,
    )}. If this flips, the gate is broken and every ScoreBand assertion above is toothless.`,
  )
})

test('self-check: near-black text on white PASSES the 4.5:1 gate', () => {
  const ratio = contrastRatio('#111111', '#FFFFFF')
  assert.ok(
    ratio >= WCAG_AA_NORMAL_TEXT,
    `self-check: expected near-black on white >= 4.5:1, got ${ratio.toFixed(
      2,
    )}. If this flips, the helper is broken and even truly-AA pairs will trip the wire.`,
  )
})
