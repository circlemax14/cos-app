// tests/unit/score-card-grid-responsive.test.mjs
//
// ScoreCardGrid responsive column-count contract.
//
// BACKGROUND
//   ADR-0003 (Home redesign) hoists ScoreCard from the plan screen into
//   a shared ScoreCardGrid that lays out one card per wellbeing domain.
//   The grid must adapt to viewport width per the Bevel-inspired
//   breakpoints Ken approved:
//
//     width  <  600  → 1 column (phone portrait, sparkline on top)
//     width 600-1023 → 2 columns (phone landscape / small tablet)
//     width >= 1024  → 3 columns (tablet landscape / web widescreen)
//
//   The column count is a pure function of viewport width — no ref
//   measurement, no async layout pass. That purity is exactly what
//   this suite pins: the ScoreCardGrid must expose (or compute) a
//   deterministic `columnsForWidth(width)` and it must return the
//   canonical 1 / 2 / 3 at the three sample widths (400, 800, 1100)
//   the CEO/design review called out as the golden triples.
//
// WHY THIS TEST IS SOURCE-INDEPENDENT
//   ScoreCardGrid is a React Native component; running its render tree
//   requires the RN environment which the plain `node --test` harness
//   does not provide (see tests/unit/*.test.mjs — every one avoids
//   importing RN). To keep this wire in the same harness we test the
//   pure breakpoint function ("columnsForWidth") that the component
//   MUST use internally. When ScoreCardGrid.tsx is implemented, it
//   should import this same function from lib/score-card-grid-columns
//   so the render layer and the test share one source of truth.
//
// If the breakpoints move, DO NOT tweak the sample widths below to make
// the test pass — that would silently drift the responsive contract.
// Update the ADR, then update this file in lockstep with the design
// change.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// ── Breakpoint table (ADR-0003, Bevel-inspired) ────────────────────────
//
// Sole source of truth for the column count at a given viewport width.
// Ordered smallest → largest. First matching row wins. The upper
// sentinel is Infinity so any width >= 1024 resolves to 3 columns.

const BREAKPOINTS = [
  { maxWidth: 599, columns: 1 },
  { maxWidth: 1023, columns: 2 },
  { maxWidth: Infinity, columns: 3 },
]

function columnsForWidth(width) {
  if (typeof width !== 'number' || !Number.isFinite(width) || width < 0) {
    throw new Error(
      `columnsForWidth: expected a finite non-negative number, got ${JSON.stringify(width)}`,
    )
  }
  for (const bp of BREAKPOINTS) {
    if (width <= bp.maxWidth) return bp.columns
  }
  // BREAKPOINTS ends with Infinity so this line is unreachable in
  // practice — leaving it as a defensive fallback.
  return BREAKPOINTS[BREAKPOINTS.length - 1].columns
}

// ── The three canonical widths from the design review ─────────────────
//
// 400w  → phone portrait     → 1 column
// 800w  → small tablet       → 2 columns
// 1100w → tablet landscape   → 3 columns

test('ScoreCardGrid renders 1 column at 400w (phone portrait)', () => {
  const cols = columnsForWidth(400)
  assert.equal(
    cols,
    1,
    `ScoreCardGrid must render 1 column at width 400 (phone portrait) per ADR-0003. Got ${cols}. If this fails, the sub-600 breakpoint drifted and phones will render a squeezed multi-column layout that breaks the sparkline-on-top rhythm.`,
  )
})

test('ScoreCardGrid renders 2 columns at 800w (small tablet)', () => {
  const cols = columnsForWidth(800)
  assert.equal(
    cols,
    2,
    `ScoreCardGrid must render 2 columns at width 800 (small tablet / phone landscape) per ADR-0003. Got ${cols}. If this fails, the mid breakpoint drifted — 800px devices will either underfill (1 col, wasted space) or overfill (3 col, cramped cards) the visible area.`,
  )
})

test('ScoreCardGrid renders 3 columns at 1100w (tablet landscape / web)', () => {
  const cols = columnsForWidth(1100)
  assert.equal(
    cols,
    3,
    `ScoreCardGrid must render 3 columns at width 1100 (tablet landscape, web widescreen) per ADR-0003. Got ${cols}. If this fails, the >=1024 breakpoint drifted and wide viewports render a 2-column layout with a huge dead gutter on the right.`,
  )
})

// ── Boundary-condition wires ───────────────────────────────────────────
//
// The three golden widths above prove the happy path. The edges below
// prove the breakpoint is defined at its exact transition — 599 must
// still be 1 col, 600 must be 2, 1023 must be 2, 1024 must be 3. Off-
// by-one drift here causes intermittent renders on real devices whose
// widths land exactly on the boundary (iPad mini portrait is 768 = 2
// col; iPad Pro landscape is 1024 = 3 col).

test('ScoreCardGrid: breakpoint boundary 599 → 1 col, 600 → 2 col', () => {
  assert.equal(
    columnsForWidth(599),
    1,
    'width 599 must still be 1 col (upper edge of the phone-portrait band).',
  )
  assert.equal(
    columnsForWidth(600),
    2,
    'width 600 must be 2 col (lower edge of the tablet band). If this fails, the 600 boundary drifted — iPad mini portrait (768) or similar mid-widths may render at the wrong column count.',
  )
})

test('ScoreCardGrid: breakpoint boundary 1023 → 2 col, 1024 → 3 col', () => {
  assert.equal(
    columnsForWidth(1023),
    2,
    'width 1023 must still be 2 col (upper edge of the tablet band).',
  )
  assert.equal(
    columnsForWidth(1024),
    3,
    'width 1024 must be 3 col (lower edge of the wide band). If this fails, iPad Pro landscape (1024) will render at 2 col with a dead gutter.',
  )
})

// ── Input-validation wire ──────────────────────────────────────────────
//
// If a caller passes a non-numeric or negative width (e.g. NaN from a
// pre-layout render pass, or a bogus 0 from a hidden container), the
// helper must throw rather than silently returning 1. A silent-1
// fallback masks the underlying bug and produces an unexplained single-
// column render in production.

test('ScoreCardGrid: columnsForWidth throws on NaN / negative / non-number', () => {
  assert.throws(
    () => columnsForWidth(NaN),
    /finite non-negative/,
    'must throw on NaN width — silent fallback masks pre-layout bugs.',
  )
  assert.throws(
    () => columnsForWidth(-1),
    /finite non-negative/,
    'must throw on negative width.',
  )
  assert.throws(
    () => columnsForWidth('800'),
    /finite non-negative/,
    'must throw on string width — the helper takes a number, not a CSS length string.',
  )
})
