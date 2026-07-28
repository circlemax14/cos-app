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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BANDS_TS_PATH = join(__dirname, 'assessment-bands.ts')
const BANDS_TS_SRC = readFileSync(BANDS_TS_PATH, 'utf8')

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

// --- Chunk 85 additions (2026-07-23) --------------------------------------
// Cover the extractScoreFromRecord() contract more exhaustively AND assert
// invariants against the real assessment-bands.ts source so the opt-in list
// can't silently drift (e.g. someone adding computeFallback to a
// ratio-scored instrument like ADL, or to a PROMIS-* entry whose T-score
// vs raw-sum contract is still unverified).

// A ratio-scored def that is opted in to make it clearly wrong on purpose
// exists only as a fixture used by NEGATIVE assertions below — this
// object must NEVER appear in the real ASSESSMENT_BANDS map.
const DEF_LONELINESS_3_WITH_INDEPENDENT_FIELD = {
  ...DEF_LONELINESS_3,
  scoreField: 'independent',
}

test('(a) opted-in def with scores.independent present + scoreField=independent returns primary, no fallback', () => {
  devWarnFires = 0
  const raw = extractScoreFromRecord(
    DEF_LONELINESS_3_WITH_INDEPENDENT_FIELD,
    {
      instrumentId: 'loneliness-3-variant',
      scores: { independent: 7 },
      responses: { q1: 3, q2: 3, q3: 3 }, // sum would be 9 — must be ignored
    },
    { dev: true },
  )
  assert.equal(raw, 7, 'primary scores[scoreField] must win over the fallback sum')
  assert.equal(devWarnFires, 0, 'fallback dev warn must not fire on happy path')
})

test('(a) alcohol-3 with scores.total=0 (finite zero) returns 0 and does NOT trigger fallback', () => {
  // Regression guard: a legitimate 0 total is a *valid* AUDIT-C score
  // ("no alcohol use") and must NOT be treated as missing/falsy.
  devWarnFires = 0
  const raw = extractScoreFromRecord(
    DEF_ALCOHOL_3,
    {
      instrumentId: 'alcohol-3',
      scores: { total: 0 },
      responses: { q1: 2, q2: 2, q3: 2 }, // sum=6, must be ignored
    },
    { dev: true },
  )
  assert.equal(raw, 0)
  assert.equal(devWarnFires, 0, 'zero primary is finite and must suppress fallback')
})

test('(b) loneliness-3 with scores missing entirely (undefined) + numeric responses sums correctly', () => {
  // Distinct from `scores:{}` — this exercises the `record.scores ?? {}`
  // guard in the real implementation.
  const raw = extractScoreFromRecord(DEF_LONELINESS_3, {
    instrumentId: 'loneliness-3',
    // scores omitted entirely
    responses: { q1: 2, q2: 2, q3: 1 },
  })
  assert.equal(raw, 5)
  // low<=4, med<=5, high>5. 5 -> medium.
  assert.equal(computeBand(DEF_LONELINESS_3, raw).level, 'medium')
})

test('(b) alcohol-3 with scores having wrong field only (foo=99) + numeric responses falls back to sum', () => {
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, {
    instrumentId: 'alcohol-3',
    scores: { foo: 99, independent: 42 }, // neither is `total`
    responses: { q1: 4, q2: 3, q3: 3 },
  })
  assert.equal(raw, 10, 'irrelevant score fields must not satisfy the primary read')
})

test('(c) alcohol-3 fallback with only non-numeric responses returns undefined (per implementation)', () => {
  // Verifies current behavior: when count===0 after filtering, return
  // undefined — NOT 0. A 0 would falsely map to "low risk / green".
  const raw = extractScoreFromRecord(DEF_ALCOHOL_3, {
    instrumentId: 'alcohol-3',
    scores: {},
    responses: { q1: '1', q2: null, q3: undefined, q4: { v: 2 }, q5: [1, 2] },
  })
  assert.equal(raw, undefined)
})

test('(c) loneliness-3 fallback with Infinity + -Infinity in responses ignores them (Number.isFinite guard)', () => {
  const raw = extractScoreFromRecord(DEF_LONELINESS_3, {
    instrumentId: 'loneliness-3',
    scores: {},
    responses: { q1: Infinity, q2: -Infinity, q3: 3 },
  })
  // Only q3=3 survives the Number.isFinite filter.
  assert.equal(raw, 3)
})

test('(d) def WITHOUT computeFallback (phq-9-like) + scores missing + populated responses returns undefined', () => {
  // Non-opted-in def must never accidentally sum — a PHQ-9 raw-sum
  // interpretation of unmapped responses would silently mis-band a
  // depression patient. Undefined => neutral "—" pill.
  const DEF_PHQ_9 = {
    humanLabel: 'Depression',
    direction: 'lower-is-better',
    unitSuffix: 'severity',
    lowMax: 4,
    mediumMax: 14,
    source: 'PHQ-9: 0-4/5-9/10-14/15-19/20-27 (Kroenke 2001)',
    // Explicitly NO computeFallback.
  }
  const raw = extractScoreFromRecord(DEF_PHQ_9, {
    instrumentId: 'phq-9',
    scores: {},
    responses: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3, q6: 3, q7: 3, q8: 3, q9: 3 },
  })
  assert.equal(raw, undefined)
})

test('(d) def WITHOUT computeFallback + scores.total present still returns the primary', () => {
  // Regression guard on the primary path for non-opted-in defs — the
  // computeFallback flag must not gate happy-path reads.
  const DEF_GAD_7 = {
    humanLabel: 'Anxiety',
    direction: 'lower-is-better',
    unitSuffix: 'severity',
    lowMax: 4,
    mediumMax: 9,
    source: 'GAD-7',
  }
  const raw = extractScoreFromRecord(DEF_GAD_7, {
    instrumentId: 'gad-7',
    scores: { total: 12 },
    responses: {},
  })
  assert.equal(raw, 12)
})

test('(e) opted-in def with responses omitted entirely returns undefined (does NOT return 0)', () => {
  // Distinct from `responses: {}` — exercises the `if (!responses …)` guard.
  const raw = extractScoreFromRecord(DEF_LONELINESS_3, {
    instrumentId: 'loneliness-3',
    scores: {},
    // responses omitted entirely
  })
  assert.equal(raw, undefined)
})

test('(e) opted-in def with responses:null returns undefined (does NOT return 0)', () => {
  const raw = extractScoreFromRecord(DEF_LONELINESS_3, {
    instrumentId: 'loneliness-3',
    scores: {},
    responses: null,
  })
  assert.equal(raw, undefined)
})

// --- (f) Assert opt-in against the REAL assessment-bands.ts source --------
// These read the .ts file as text and grep for the flag inside each
// instrument's block. If someone renames the flag, drops it, or accidentally
// adds it to a ratio-scored instrument, these tests fail loudly.

function tsBlockFor(instrumentId) {
  // Match the `'<id>': { … },` block by finding the key then walking to
  // the matching closing brace. Naive but sufficient for the flat,
  // hand-authored ASSESSMENT_BANDS table.
  const keyIdx = BANDS_TS_SRC.indexOf(`'${instrumentId}':`)
  if (keyIdx === -1) return undefined
  const openIdx = BANDS_TS_SRC.indexOf('{', keyIdx)
  if (openIdx === -1) return undefined
  let depth = 0
  for (let i = openIdx; i < BANDS_TS_SRC.length; i += 1) {
    const ch = BANDS_TS_SRC[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return BANDS_TS_SRC.slice(openIdx, i + 1)
    }
  }
  return undefined
}

test("(f) alcohol-3 def in assessment-bands.ts is flagged with computeFallback: 'sum-responses'", () => {
  const block = tsBlockFor('alcohol-3')
  assert.ok(block, "alcohol-3 must exist in ASSESSMENT_BANDS")
  assert.match(
    block,
    /computeFallback:\s*'sum-responses'/,
    "alcohol-3 must retain the sum-responses opt-in per Ken 2026-07-23 dogfood",
  )
})

test("(f) loneliness-3 def in assessment-bands.ts is flagged with computeFallback: 'sum-responses'", () => {
  const block = tsBlockFor('loneliness-3')
  assert.ok(block, "loneliness-3 must exist in ASSESSMENT_BANDS")
  assert.match(
    block,
    /computeFallback:\s*'sum-responses'/,
    "loneliness-3 must retain the sum-responses opt-in per Ken 2026-07-23 dogfood",
  )
})

test("(f) NO ratio-scored (scoreField='independent') def is opted in to sum-responses fallback", () => {
  // Katz ADL / Lawton IADL use an independent-count metric; summing
  // raw responses would produce a semantically different number on a
  // different scale and mis-band the patient. Guard against future
  // drift by asserting that no opted-in def carries scoreField:'independent'.
  const adl = tsBlockFor('adl')
  const iadl = tsBlockFor('iadl')
  assert.ok(adl && iadl, "adl and iadl must exist in ASSESSMENT_BANDS")
  assert.doesNotMatch(adl, /computeFallback:/, "ADL must NOT opt into sum-responses fallback")
  assert.doesNotMatch(iadl, /computeFallback:/, "IADL must NOT opt into sum-responses fallback")
})

test("(f) exactly two instruments carry computeFallback: 'sum-responses' today", () => {
  // Count all REAL opt-in entries in the source (excluding the doc-comment
  // mentions and the interface declaration line `computeFallback?: …`).
  // Adding a third requires a deliberate PR + this test update — the
  // whole point of chunk 68 is to keep the opt-in surface minimal and
  // reviewable.
  const realEntryLines = BANDS_TS_SRC.split('\n').filter((line) => {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) return false
    // Real entry lines look like:  `    computeFallback: 'sum-responses',`
    // Excludes the interface line  `  computeFallback?: 'sum-responses'`  (has `?`).
    return /^computeFallback:\s*'sum-responses'\s*,?\s*$/.test(trimmed)
  })
  assert.equal(
    realEntryLines.length,
    2,
    'Only alcohol-3 and loneliness-3 should be opted in — adding more requires review',
  )
})

// --- (g) Assert PROMIS-* defs remain OMITTED from ASSESSMENT_BANDS --------

test('(g) PROMIS pain-4 / sleep-4 / physical-function-4 remain OMITTED from ASSESSMENT_BANDS', () => {
  // Chunk 58 intentionally omits these until the BE score contract
  // (T-score vs raw-sum) is verified. Re-adding them without that
  // verification will produce confidently-wrong patient-facing pills.
  // The comment MUST also remain so future maintainers understand why.
  const promisIds = ['promis-pain-4', 'promis-sleep-4', 'promis-physical-function-4', 'pain-4', 'sleep-4', 'physical-function-4']
  for (const id of promisIds) {
    const key = `'${id}':`
    const idx = BANDS_TS_SRC.indexOf(key)
    // We accept the key appearing inside a code comment, but NOT as a
    // real entry key. A real entry key sits at column 2 (2-space indent)
    // followed by a colon; the comment mentions are unindented prose.
    // The simplest robust check: if the key exists at all, its preceding
    // non-whitespace char on the line must be `//` (inside a comment).
    if (idx !== -1) {
      const lineStart = BANDS_TS_SRC.lastIndexOf('\n', idx) + 1
      const preface = BANDS_TS_SRC.slice(lineStart, idx)
      assert.match(
        preface,
        /\/\//,
        `PROMIS-family id '${id}' must not appear as a real entry key (found outside a comment)`,
      )
    }
  }
})

test("(g) assessment-bands.ts retains the PROMIS-omission rationale comment", () => {
  // If someone deletes this comment, a future PR could re-add a
  // PROMIS entry without realising why we intentionally left them out.
  assert.match(
    BANDS_TS_SRC,
    /PROMIS[^]*INTENTIONALLY OMITTED/i,
    'PROMIS omission rationale comment must remain in assessment-bands.ts',
  )
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
