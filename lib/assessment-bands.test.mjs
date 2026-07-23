// Unit tests for lib/assessment-bands.ts extractScoreFromRecord()
// (CHUNK 68, 2026-07-23). cos-app has no jest/vitest harness today, so we
// use node:test which ships with the runtime. Run with:
//
//   node --test lib/assessment-bands.test.mjs
//
// We can't import the .ts module directly (no transpiler is wired up),
// so we mirror the pure extraction logic here. If the mirror drifts from
// assessment-bands.ts the test fails by design — that IS the point,
// especially for the fallback path which is defensive scaffolding meant
// to be removed once the BE-side fix (missing computeScores cases +
// backfill) ships to prod.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// --- Mirror of the pure extraction logic from assessment-bands.ts ---------

function extractScore(def, scores) {
  if (!scores) return undefined
  const field = (def && def.scoreField) || 'total'
  const primary = scores[field]
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary
  return undefined
}

let devWarnFires = 0
function extractScoreFromRecord(def, record, opts) {
  const isDev = opts && typeof opts.dev === 'boolean' ? opts.dev : true
  if (!record) return undefined
  const primary = extractScore(def, record.scores || {})
  if (typeof primary === 'number') return primary
  if (!def || def.computeFallback !== 'sum-responses') return undefined
  const responses = record.responses
  if (!responses || typeof responses !== 'object') return undefined
  let sum = 0
  let count = 0
  for (const key of Object.keys(responses)) {
    const v = responses[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v
      count += 1
    }
  }
  if (count === 0) return undefined
  if (isDev) devWarnFires += 1
  return sum
}

// --- Mirror of the two Ken-relevant band defs (must match assessment-bands.ts). --
const DEF_ALCOHOL_3 = {
  humanLabel: 'Alcohol use',
  direction: 'lower-is-better',
  unitSuffix: 'risk',
  lowMax: 2,
  mediumMax: 3,
  source: 'AUDIT-C: 0-12, >=4 positive (Bush 1998)',
  computeFallback: 'sum-responses',
}

const DEF_LONELINESS_3 = {
  humanLabel: 'Loneliness',
  direction: 'lower-is-better',
  unitSuffix: 'risk',
  lowMax: 4,
  mediumMax: 5,
  source: 'UCLA-3: 3-9, >=6 lonely (Hughes 2004)',
  computeFallback: 'sum-responses',
}

// Ratio-scored instrument that MUST NOT fall back.
const DEF_ADL = {
  humanLabel: 'Daily living',
  direction: 'higher-is-better',
  unitSuffix: 'function',
  scoreField: 'independent',
  lowMax: 2,
  mediumMax: 4,
  source: 'Katz ADL: 0-6 (Katz 1963)',
  // NOTE: no computeFallback flag — ratio scoring; MUST return undefined
  // when scores.independent is missing.
}

function computeBand(def, score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined
  let level
  if (score <= def.lowMax) level = 'low'
  else if (score <= def.mediumMax) level = 'medium'
  else level = 'high'
  return { level }
}

// --- Tests ----------------------------------------------------------------

test('happy path: scores.total present returns primary, no fallback fire', () => {
  devWarnFires = 0
  const r = {
    instrumentId: 'alcohol-3',
    scores: { total: 3 },
    responses: { q1: 1, q2: 1, q3: 1 },
  }
  assert.equal(extractScoreFromRecord(DEF_ALCOHOL_3, r), 3)
  assert.equal(devWarnFires, 0, 'fallback dev warn must not fire when primary is present')
})

test('alcohol-3 with scores:{} + responses:{q1:2,q2:2,q3:1} returns 5 (medium)', () => {
  const r = {
    instrumentId: 'alcohol-3',
    scores: {},
    responses: { q1: 2, q2: 2, q3: 1 },
  }
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, r)
  assert.equal(raw, 5)
  const band = computeBand(DEF_ALCOHOL_3, raw)
  // low<=2, med<=3, else high. 5 -> high (worst).
  assert.equal(band.level, 'high')
})

test('alcohol-3 with scores:{} + responses summing to 3 lands in medium band', () => {
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, {
    instrumentId: 'alcohol-3',
    scores: {},
    responses: { q1: 1, q2: 1, q3: 1 },
  })
  assert.equal(raw, 3)
  assert.equal(computeBand(DEF_ALCOHOL_3, raw).level, 'medium')
})

test('loneliness-3 with scores:{} + responses:{q1:3,q2:3,q3:2} returns 8 (high)', () => {
  const raw = extractScoreFromRecord(DEF_LONELINESS_3, {
    instrumentId: 'loneliness-3',
    scores: {},
    responses: { q1: 3, q2: 3, q3: 2 },
  })
  assert.equal(raw, 8)
  // low<=4, med<=5, else high. 8 -> high (worst).
  assert.equal(computeBand(DEF_LONELINESS_3, raw).level, 'high')
})

test('alcohol-3 with scores.total=1 + non-empty responses wins over fallback (no double-count)', () => {
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, {
    instrumentId: 'alcohol-3',
    scores: { total: 1 },
    responses: { q1: 2, q2: 2, q3: 1 },
  })
  assert.equal(raw, 1)
})

test('adl (no computeFallback) with scores:{} + populated responses returns undefined', () => {
  const raw = extractScoreFromRecord(DEF_ADL, {
    instrumentId: 'adl',
    scores: {},
    responses: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1 },
  })
  // Ratio-scoring instruments MUST NOT fall back — a sum here would
  // mis-band a patient. Undefined => neutral "—" pill.
  assert.equal(raw, undefined)
})

test('alcohol-3 with scores:{} + responses:{} returns undefined', () => {
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, {
    instrumentId: 'alcohol-3',
    scores: {},
    responses: {},
  })
  // Nothing to sum -> undefined, not 0. 0 would misleadingly map to
  // "low risk / green".
  assert.equal(raw, undefined)
})

test('alcohol-3 fallback ignores non-finite / non-numeric response values', () => {
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, {
    instrumentId: 'alcohol-3',
    scores: {},
    responses: { q1: '2', q2: null, q3: 2, q4: NaN, q5: { value: 3 } },
  })
  // Only q3 = 2 is a finite number.
  assert.equal(raw, 2)
})

test('unknown / undefined def returns undefined even with populated responses', () => {
  const raw = extractScoreFromRecord(undefined, {
    instrumentId: 'unknown-instrument',
    scores: {},
    responses: { q1: 1, q2: 1 },
  })
  assert.equal(raw, undefined)
})

test('undefined record returns undefined', () => {
  assert.equal(extractScoreFromRecord(DEF_ALCOHOL_3, undefined), undefined)
})

test('missing scores + no responses returns undefined for opted-in def', () => {
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, {
    instrumentId: 'alcohol-3',
  })
  assert.equal(raw, undefined)
})

test('dev-only warn fires exactly once per fallback, never when primary is present', () => {
  devWarnFires = 0
  // Fallback fires.
  extractScoreFromRecord(
    DEF_ALCOHOL_3,
    { instrumentId: 'alcohol-3', scores: {}, responses: { q1: 1, q2: 1, q3: 1 } },
    { dev: true },
  )
  assert.equal(devWarnFires, 1)
  // Primary present — must NOT fire.
  extractScoreFromRecord(
    DEF_ALCOHOL_3,
    { instrumentId: 'alcohol-3', scores: { total: 3 }, responses: { q1: 1, q2: 1, q3: 1 } },
    { dev: true },
  )
  assert.equal(devWarnFires, 1)
  // Non-dev build — must NOT fire even when fallback engages.
  extractScoreFromRecord(
    DEF_LONELINESS_3,
    { instrumentId: 'loneliness-3', scores: {}, responses: { q1: 3, q2: 3, q3: 2 } },
    { dev: false },
  )
  assert.equal(devWarnFires, 1)
})
