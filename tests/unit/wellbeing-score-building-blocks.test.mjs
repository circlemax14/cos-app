// tests/unit/wellbeing-score-building-blocks.test.mjs — CHUNK 100 (2026-07-23)
//
// WHAT THIS FILE PINS
// -------------------
// lib/wellbeing-score.ts exposes a handful of small pure building blocks that
// deriveWellbeing() composes:
//
//   - buildComposite(pickRecord)           (chunk 62)
//   - computeFocus(domains)                (chunk 60 min-contributors gate)
//   - selectCurrentRecords(historyById)    (chunk 59 newest-first defense)
//   - selectPriorRecords(historyById, ...) (chunk 59 ≤7d cutoff walk)
//   - subscoreFromRecord(record)           (chunk 68 extractScoreFromRecord path)
//
// Chunks 84 v2 and 89 already pinned deriveWellbeing() end-to-end and the
// BPS_TO_SECTION crosswalk. Regressions inside a building block still surface
// there, but as a cascade — the failing test is at the outermost layer and
// the diagnostic points at deriveWellbeing() rather than the specific brick
// that moved. This file fills the middle layer: unit-test each building
// block in isolation so a future refactor lands a red bar on the exact
// function that regressed. When it does, the fix is one function; without
// this file, the fix is a bisect through deriveWellbeing()'s call graph.
//
// WHY MIRROR + SOURCE-DRIFT (dual-layer, per chunk 84 v2)
// -------------------------------------------------------
// Same discipline as chunks 84 v2 / 89 / 68 / 85: the repo runs `node --test`
// with no TS transpiler, so we re-declare each building block as a pure-JS
// shadow of lib/wellbeing-score.ts. The mirror alone would pass green if
// someone edited BOTH the .ts source AND this file's mirror in lockstep
// (silently regressing the product while the tests still pass). A trailing
// suite reads lib/wellbeing-score.ts as text and greps for the load-bearing
// literals: any drift on the .ts side lights up here even if the mirror
// tests still pass.
//
// Explicit chunk 84 v2 discipline: no mirror-only tests without a source-
// drift companion. Every invariant this file cares about is asserted twice
// — once behaviorally against the mirror, once structurally against the
// source. If those two ever disagree, the source is the source of truth
// and the mirror needs to catch up (do NOT edit the trip-wire regex to
// "make it green").
//
// Picked up by `npm test` via the existing glob:
//   `node --test tests/unit/*.test.ts tests/unit/*.test.mjs lib/*.test.mjs`
// (see package.json scripts.test — added in chunk 84 v2).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const WELLBEING_SCORE_TS_PATH = join(REPO_ROOT, 'lib', 'wellbeing-score.ts')
const WELLBEING_SCORE_TS_SRC = readFileSync(WELLBEING_SCORE_TS_PATH, 'utf8')

// =========================================================================
// Mirror of lib/assessment-bands.ts (subset — only the band defs the
// building blocks below actually touch).
// =========================================================================

const BANDS = {
  // BIO
  adl: {
    direction: 'higher-is-better',
    scoreField: 'independent',
    lowMax: 2,
    mediumMax: 4,
  },
  iadl: {
    direction: 'higher-is-better',
    scoreField: 'independent',
    lowMax: 3,
    mediumMax: 6,
  },
  'falls-12': {
    direction: 'lower-is-better',
    lowMax: 1,
    mediumMax: 2,
  },
  'nutrition-5': {
    // 2026-07-29: mirrors lib/assessment-bands.ts direction fix
    // (MNA-SF: higher raw score = less malnutrition risk = better).
    direction: 'higher-is-better',
    lowMax: 3,
    mediumMax: 7,
  },
  // MIND
  'phq-2': {
    direction: 'lower-is-better',
    lowMax: 2,
    mediumMax: 4,
  },
  'phq-9': {
    direction: 'lower-is-better',
    lowMax: 4,
    mediumMax: 14,
  },
  'gad-7': {
    direction: 'lower-is-better',
    lowMax: 4,
    mediumMax: 14,
  },
  // SOCIAL
  'alcohol-3': {
    direction: 'lower-is-better',
    lowMax: 2,
    mediumMax: 3,
    computeFallback: 'sum-responses',
  },
  'loneliness-3': {
    direction: 'lower-is-better',
    lowMax: 4,
    mediumMax: 5,
    computeFallback: 'sum-responses',
  },
}

function extractScore(def, scores) {
  if (!scores) return undefined
  const field = (def && def.scoreField) || 'total'
  const primary = scores[field]
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary
  return undefined
}

// Mirror of lib/assessment-bands.ts extractScoreFromRecord — the chunk 68
// entry point that subscoreFromRecord passes through. Kept faithful so the
// pass-through test at the bottom of the mirror suite is meaningful.
function extractScoreFromRecord(def, record) {
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
  return sum
}

function computeBand(def, score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined
  if (score <= def.lowMax) return { level: 'low' }
  if (score <= def.mediumMax) return { level: 'medium' }
  return { level: 'high' }
}

// =========================================================================
// Mirror of lib/wellbeing-score.ts building blocks.
// =========================================================================

const HIGHER_BETTER_SUBSCORE = { low: 20, medium: 60, high: 100 }
const LOWER_BETTER_SUBSCORE = { low: 100, medium: 60, high: 20 }

const DOMAIN_MEMBERS = {
  bio: ['pain-4', 'sleep-4', 'physical-function-4', 'adl', 'iadl', 'falls-12', 'nutrition-5'],
  mind: ['phq-2', 'phq-9', 'gad-7', 'pss-4', 'cognition-8', 'mini-cog', 'moca', 'wellbeing-5'],
  social: ['alcohol-3', 'loneliness-3'],
}
const DOMAIN_ORDER = ['bio', 'mind', 'social']

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const FOCUS_AREA_MIN_CONTRIBUTORS = 2
const FOCUS_AREA_GAP_THRESHOLD = 15

function subscoreFromRecord(record) {
  if (!record) return undefined
  const def = BANDS[String(record.instrumentId)]
  if (!def) return undefined
  const raw = extractScoreFromRecord(def, record)
  const band = computeBand(def, raw)
  if (!band) return undefined
  return def.direction === 'higher-is-better'
    ? HIGHER_BETTER_SUBSCORE[band.level]
    : LOWER_BETTER_SUBSCORE[band.level]
}

function mean(values) {
  if (values.length === 0) return undefined
  return values.reduce((a, b) => a + b, 0) / values.length
}

function buildComposite(pickRecord) {
  const domains = DOMAIN_ORDER.map((domain) => {
    const subs = DOMAIN_MEMBERS[domain]
      .map((id) => subscoreFromRecord(pickRecord(id)))
      .filter((v) => typeof v === 'number')
    return { domain, score: mean(subs), contributors: subs.length }
  })
  const scoredCount = domains.filter((d) => typeof d.score === 'number').length
  let composite
  if (scoredCount > 0) {
    const sum = domains.reduce((acc, d) => acc + (typeof d.score === 'number' ? d.score : 0), 0)
    composite = sum / DOMAIN_ORDER.length
  }
  return { composite, domains }
}

function computeFocus(domains) {
  const scored = domains.filter((d) => typeof d.score === 'number')
  if (scored.length < 2) return undefined
  const worst = scored.reduce((a, b) => (a.score <= b.score ? a : b))
  if (worst.contributors < FOCUS_AREA_MIN_CONTRIBUTORS) return undefined
  const others = scored.filter((d) => d.domain !== worst.domain)
  const othersMean = mean(others.map((d) => d.score))
  if (typeof othersMean !== 'number') return undefined
  if (othersMean - worst.score < FOCUS_AREA_GAP_THRESHOLD) return undefined
  return worst.domain
}

function selectCurrentRecords(historyById) {
  const out = new Map()
  historyById.forEach((records, key) => {
    const sorted = [...records]
      .filter((r) => !!r?.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    out.set(key, sorted[0])
  })
  return out
}

function selectPriorRecords(historyById, currentById) {
  const out = new Map()
  currentById.forEach((curr, key) => {
    if (!curr?.completedAt) {
      out.set(key, undefined)
      return
    }
    const cutoff = new Date(curr.completedAt).getTime() - SEVEN_DAYS_MS
    if (!Number.isFinite(cutoff)) {
      out.set(key, undefined)
      return
    }
    const hist = historyById.get(key) ?? []
    const sorted = [...hist]
      .filter((r) => !!r?.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    let picked
    for (const rec of sorted) {
      const t = new Date(rec.completedAt ?? '').getTime()
      if (!Number.isFinite(t)) continue
      if (t <= cutoff) {
        picked = rec
        break
      }
    }
    out.set(key, picked)
  })
  return out
}

// =========================================================================
// Fixture helpers
// =========================================================================

function makeRec(instrumentId, scores, completedAt = '2026-07-22T10:00:00Z', responses = {}) {
  return { instrumentId, scores, responses, completedAt }
}

function pickerFor(records) {
  return (id) => records[id]
}

// =========================================================================
// BEHAVIORAL MIRROR SUITE
// =========================================================================

// --- buildComposite: all-3-scored / 2-of-3 / 1-of-3 / 0-of-3 -------------

test('buildComposite: all 3 domains scored ⇒ composite = mean of 3 domain scores', () => {
  // BIO 100 (adl high), MIND 100 (phq-2 low → 100), SOCIAL 100 (alcohol-3 low → 100)
  const records = {
    adl: makeRec('adl', { independent: 5 }),
    'phq-2': makeRec('phq-2', { total: 1 }),
    'alcohol-3': makeRec('alcohol-3', { total: 1 }),
  }
  const result = buildComposite(pickerFor(records))
  assert.equal(result.composite, 100) // (100+100+100)/3
  const byDomain = Object.fromEntries(result.domains.map((d) => [d.domain, d]))
  assert.equal(byDomain.bio.score, 100)
  assert.equal(byDomain.bio.contributors, 1)
  assert.equal(byDomain.mind.score, 100)
  assert.equal(byDomain.mind.contributors, 1)
  assert.equal(byDomain.social.score, 100)
  assert.equal(byDomain.social.contributors, 1)
})

test('buildComposite: 2-of-3 domains scored (SOCIAL missing) ⇒ composite = (bio+mind+0)/3', () => {
  // BIO high (100), MIND medium (60), SOCIAL absent → composite = (100+60)/3 = 53.33...
  const records = {
    adl: makeRec('adl', { independent: 5 }),
    'phq-2': makeRec('phq-2', { total: 3 }),
  }
  const result = buildComposite(pickerFor(records))
  assert.equal(result.composite, (100 + 60) / 3)
  const social = result.domains.find((d) => d.domain === 'social')
  // Missing SOCIAL: score undefined, contributors 0. NOT invisible — it
  // still contributes 0 to the numerator per chunk 62.
  assert.equal(social.score, undefined)
  assert.equal(social.contributors, 0)
})

test('buildComposite: 1-of-3 domains scored ⇒ composite = domainScore / 3 (denominator locked at 3)', () => {
  // Only SOCIAL scores; BIO + MIND absent. Composite = 20/3.
  const records = {
    'alcohol-3': makeRec('alcohol-3', { total: 4 }), // > mediumMax(3) → high → 20
  }
  const result = buildComposite(pickerFor(records))
  assert.equal(result.composite, 20 / 3)
  // Sanity: BIO/MIND undefined, not zero — the CARD renders them as
  // "no data" pills, distinct from a genuine low score.
  const bio = result.domains.find((d) => d.domain === 'bio')
  const mind = result.domains.find((d) => d.domain === 'mind')
  assert.equal(bio.score, undefined)
  assert.equal(mind.score, undefined)
})

test('buildComposite: 0-of-3 domains scored ⇒ composite undefined (empty state, NOT zero)', () => {
  const result = buildComposite(() => undefined)
  assert.equal(result.composite, undefined)
  for (const d of result.domains) {
    assert.equal(d.score, undefined)
    assert.equal(d.contributors, 0)
  }
  // Domain aggregates still emitted in canonical order so the UI can render
  // three "no data" pills without special-casing the empty state.
  assert.deepEqual(
    result.domains.map((d) => d.domain),
    ['bio', 'mind', 'social'],
  )
})

// --- computeFocus: below-gate returns undefined --------------------------

test('computeFocus: returns undefined when fewer than 2 domains have a score', () => {
  const domains = [
    { domain: 'bio', score: 20, contributors: 5 },
    { domain: 'mind', score: undefined, contributors: 0 },
    { domain: 'social', score: undefined, contributors: 0 },
  ]
  assert.equal(computeFocus(domains), undefined)
})

test('computeFocus: returns undefined when worst domain has < FOCUS_AREA_MIN_CONTRIBUTORS backing scores', () => {
  // MIND worst by 80 pts but only n=1 backing signal — chunk 60 gate blocks
  // the callout so a lone PHQ-2 can't unilaterally trigger "your mental
  // health needs focus" copy.
  const domains = [
    { domain: 'bio', score: 100, contributors: 3 },
    { domain: 'mind', score: 20, contributors: 1 },
    { domain: 'social', score: 100, contributors: 2 },
  ]
  assert.equal(computeFocus(domains), undefined)
})

test('computeFocus: returns undefined when gap between worst and others < FOCUS_AREA_GAP_THRESHOLD (15)', () => {
  // BIO 80 vs mean(others) 90 → gap 10 < 15. Even with sufficient
  // contributors, callout stays quiet.
  const domains = [
    { domain: 'bio', score: 80, contributors: 3 },
    { domain: 'mind', score: 90, contributors: 3 },
    { domain: 'social', score: 90, contributors: 3 },
  ]
  assert.equal(computeFocus(domains), undefined)
})

test('computeFocus: fires when gate + gap both satisfied (positive control for the "below-gate" tests above)', () => {
  const domains = [
    { domain: 'bio', score: 100, contributors: 3 },
    { domain: 'mind', score: 20, contributors: 2 }, // meets min-contributors, big gap
    { domain: 'social', score: 100, contributors: 2 },
  ]
  assert.equal(computeFocus(domains), 'mind')
})

// --- selectCurrentRecords + selectPriorRecords: cohort intersection edges

test('selectCurrent/Prior: identical current+prior across two instruments ⇒ full cohort intersection', () => {
  const history = new Map([
    [
      'phq-2',
      [
        makeRec('phq-2', { total: 1 }, '2026-07-22T00:00:00Z'),
        makeRec('phq-2', { total: 5 }, '2026-07-10T00:00:00Z'),
      ],
    ],
    [
      'gad-7',
      [
        makeRec('gad-7', { total: 1 }, '2026-07-22T00:00:00Z'),
        makeRec('gad-7', { total: 5 }, '2026-07-10T00:00:00Z'),
      ],
    ],
  ])
  const currentById = selectCurrentRecords(history)
  const priorById = selectPriorRecords(history, currentById)
  const cohort = new Set()
  currentById.forEach((curr, key) => {
    if (curr && priorById.get(key)) cohort.add(key)
  })
  assert.deepEqual([...cohort].sort(), ['gad-7', 'phq-2'])
  // Both currents are the newest record.
  assert.equal(currentById.get('phq-2').completedAt, '2026-07-22T00:00:00Z')
  assert.equal(currentById.get('gad-7').completedAt, '2026-07-22T00:00:00Z')
  // Priors are exactly the ≥7d-older record.
  assert.equal(priorById.get('phq-2').completedAt, '2026-07-10T00:00:00Z')
  assert.equal(priorById.get('gad-7').completedAt, '2026-07-10T00:00:00Z')
})

test('selectCurrent/Prior: disjoint history (one instrument current-only, other prior-only) ⇒ empty intersection', () => {
  // phq-2: only a "current" record (no prior). gad-7: has a current + prior.
  // But the "disjoint" case for INTERSECTION means no key has BOTH a
  // current AND a ≥7d-older prior. Here phq-2 lacks a prior; gad-7 has
  // both — so cohort = { gad-7 }. Reproducing the truly disjoint case:
  // phq-2 has only a current, gad-7 has only a stale prior (no current
  // newer than 7d after that prior). Simplest: give phq-2 one record, and
  // gad-7 has records but the "newest" record has no ≥7d predecessor.
  const history = new Map([
    ['phq-2', [makeRec('phq-2', { total: 1 }, '2026-07-22T00:00:00Z')]],
    [
      'gad-7',
      [
        makeRec('gad-7', { total: 1 }, '2026-07-22T00:00:00Z'),
        makeRec('gad-7', { total: 5 }, '2026-07-20T00:00:00Z'), // only 2d prior
      ],
    ],
  ])
  const currentById = selectCurrentRecords(history)
  const priorById = selectPriorRecords(history, currentById)
  const cohort = new Set()
  currentById.forEach((curr, key) => {
    if (curr && priorById.get(key)) cohort.add(key)
  })
  // Neither instrument has BOTH a current AND a qualifying prior.
  assert.equal(cohort.size, 0)
})

test('selectCurrent/Prior: partial overlap (one instrument qualifies, another does not) ⇒ cohort = {qualifier}', () => {
  const history = new Map([
    [
      'phq-2',
      [
        makeRec('phq-2', { total: 1 }, '2026-07-22T00:00:00Z'),
        makeRec('phq-2', { total: 5 }, '2026-07-10T00:00:00Z'), // 12d prior — qualifies
      ],
    ],
    [
      'gad-7',
      [makeRec('gad-7', { total: 1 }, '2026-07-22T00:00:00Z')], // no prior at all
    ],
  ])
  const currentById = selectCurrentRecords(history)
  const priorById = selectPriorRecords(history, currentById)
  const cohort = new Set()
  currentById.forEach((curr, key) => {
    if (curr && priorById.get(key)) cohort.add(key)
  })
  assert.deepEqual([...cohort], ['phq-2'])
})

test('selectCurrent/Prior: single-record instrument ⇒ current present, prior undefined (empty cohort)', () => {
  const history = new Map([
    ['phq-2', [makeRec('phq-2', { total: 1 }, '2026-07-22T00:00:00Z')]],
  ])
  const currentById = selectCurrentRecords(history)
  const priorById = selectPriorRecords(history, currentById)
  assert.equal(currentById.get('phq-2').completedAt, '2026-07-22T00:00:00Z')
  assert.equal(priorById.get('phq-2'), undefined)
  const cohort = new Set()
  currentById.forEach((curr, key) => {
    if (curr && priorById.get(key)) cohort.add(key)
  })
  assert.equal(cohort.size, 0)
})

test('selectCurrentRecords: does not trust API ordering — always re-sorts newest-first', () => {
  // Records supplied in ASCENDING (oldest-first) order — mirror must
  // re-sort defensively so `current` is the newest one regardless of
  // API layer's discipline (matches chunk 58 SelfAssessmentTrends).
  const history = new Map([
    [
      'phq-2',
      [
        makeRec('phq-2', { total: 5 }, '2026-07-10T00:00:00Z'), // oldest
        makeRec('phq-2', { total: 3 }, '2026-07-15T00:00:00Z'),
        makeRec('phq-2', { total: 1 }, '2026-07-22T00:00:00Z'), // newest
      ],
    ],
  ])
  const currentById = selectCurrentRecords(history)
  assert.equal(currentById.get('phq-2').completedAt, '2026-07-22T00:00:00Z')
})

// --- subscoreFromRecord passes through extractScoreFromRecord -----------

test('subscoreFromRecord: happy path — scores.total present, def known ⇒ direction-normalized subscore', () => {
  // phq-2 lower-is-better; total=1 <= lowMax(2) → low band → 100.
  const s = subscoreFromRecord(makeRec('phq-2', { total: 1 }))
  assert.equal(s, 100)
})

test('subscoreFromRecord: passes through extractScoreFromRecord — sum-responses fallback recovers alcohol-3 subscore', () => {
  // Chunk 68 behavior: scores:{} but responses populated on a def that
  // opts in ⇒ subscoreFromRecord must still return a numeric subscore.
  // This is the load-bearing behavior for Ken's 2026-07-23 dogfood
  // (SOCIAL contributors going from 0 → 2 without any BE change).
  const s = subscoreFromRecord({
    instrumentId: 'alcohol-3',
    scores: {},
    responses: { q1: 2, q2: 2, q3: 1 }, // sum=5 → high band → 20 (lower-is-better)
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s, 20)
})

test('subscoreFromRecord: passes through extractScoreFromRecord — fallback NOT engaged when def opts out', () => {
  // adl uses ratio scoring (scoreField='independent'); it must NEVER
  // fall back to sum-responses. Populated responses on scores:{} = undefined.
  const s = subscoreFromRecord({
    instrumentId: 'adl',
    scores: {},
    responses: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1 },
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s, undefined)
})

test('subscoreFromRecord: unknown instrumentId ⇒ undefined (no def, no band, no score)', () => {
  const s = subscoreFromRecord({
    instrumentId: 'not-a-real-instrument',
    scores: { total: 42 },
    responses: {},
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s, undefined)
})

test('subscoreFromRecord: undefined record ⇒ undefined (defensive null-safe path)', () => {
  assert.equal(subscoreFromRecord(undefined), undefined)
})

// =========================================================================
// SOURCE-DRIFT TRIP WIRES (dual-layer, chunk 84 v2 pattern)
//
// Every mirror invariant above needs a companion structural assertion
// against lib/wellbeing-score.ts. If the mirror ever "silently agrees"
// with a source regression (someone edits both in lockstep, or someone
// edits the source without touching the mirror), one of these fires.
// =========================================================================

test('(trip wire) FOCUS_AREA_MIN_CONTRIBUTORS is exported and equals literal 2 (chunk 60 min-contributors gate)', () => {
  // Two guards on the same fact:
  //   1. The constant is EXPORTED (consumers upstream import it).
  //   2. Its literal value is 2. Dropping to 1 resurrects the single-signal
  //      false-positive callout that chunk 59's adversarial verify caught.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /export\s+const\s+FOCUS_AREA_MIN_CONTRIBUTORS\s*=\s*2\b/,
    'FOCUS_AREA_MIN_CONTRIBUTORS must remain an exported const literal 2 — chunk 60 gate',
  )
})

test('(trip wire) TREND_MIN_COHORT_SIZE literal is exactly 2 (chunk 59 fix — no single-instrument trend)', () => {
  // Currently declared inside deriveWellbeing() as a local const rather
  // than an exported symbol; grep for the literal declaration form so a
  // change to `const TREND_MIN_COHORT_SIZE = 1` (or a bump to 3) trips
  // this wire immediately. Chunk 59's adversarial verify locked this at
  // 2 so a single instrument's band jump can't unilaterally label the
  // whole wellbeing score "Improving" or "Worsening".
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /\bTREND_MIN_COHORT_SIZE\s*=\s*2\b/,
    'TREND_MIN_COHORT_SIZE must remain literal 2 — chunk 59 fix against single-instrument trend inflation',
  )
})

test('(trip wire) FOCUS_AREA_GAP_THRESHOLD is exported (constant exists; literal value pinned separately)', () => {
  // Deliberate: assert the constant EXISTS as an exported symbol without
  // hardcoding its value here. Chunk 100 brief says "must be documented,
  // don't hardcode — assert it exists as an exported constant". A future
  // clinical tweak of the gap threshold (say, from 15 to 12 after Ken's
  // dogfood) shouldn't require touching this test file — only the .ts
  // literal.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /export\s+const\s+FOCUS_AREA_GAP_THRESHOLD\s*=/,
    'FOCUS_AREA_GAP_THRESHOLD must remain an exported constant so consumers and tests can reference it symbolically',
  )
  // Belt-and-braces: also assert the literal is a positive integer, so a
  // regression to `= undefined`, `= 0`, or `= -15` is caught even though
  // we don't pin the exact value.
  const m = WELLBEING_SCORE_TS_SRC.match(
    /export\s+const\s+FOCUS_AREA_GAP_THRESHOLD\s*=\s*([0-9]+)\b/,
  )
  assert.ok(m, 'FOCUS_AREA_GAP_THRESHOLD literal must be a bare positive integer')
  const value = Number(m[1])
  assert.ok(Number.isInteger(value) && value > 0, `FOCUS_AREA_GAP_THRESHOLD must be a positive integer, got ${value}`)
})

test('(trip wire) composite formula continues to be sum ÷ DOMAIN_ORDER.length (chunk 62 rule, restated)', () => {
  // Chunk 84 v2 already asserted this shape once. Re-asserting here with
  // different phrasing (matching the actual token sequence in the .ts) for
  // defense in depth — if a rewrite touches the composite math and leaves
  // both formulas colocated in the file, we want each specific test file
  // that cares about this invariant to fail independently so the diagnostic
  // points at the right chunk.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /composite\s*=\s*sum\s*\/\s*DOMAIN_ORDER\.length\b/,
    'composite must remain `sum / DOMAIN_ORDER.length` — regressing to `sum / scoredCount` silently inflates the score when a domain is missing (chunk 62 semantics)',
  )
  // Negative guard: the pre-chunk-62 formula shape must not reappear.
  assert.doesNotMatch(
    WELLBEING_SCORE_TS_SRC,
    /composite\s*=\s*sum\s*\/\s*scoredCount\b/,
    'composite must NOT revert to `sum / scoredCount` — chunk 62 flip that Ken locked ("calculated by 200 when it should be by 300")',
  )
})

test('(trip wire) subscoreFromRecord passes the record through extractScoreFromRecord (chunk 68 wiring)', () => {
  // The whole point of chunk 68 was: the wellbeing subscore path uses
  // extractScoreFromRecord (which knows about `computeFallback: sum-responses`)
  // instead of the older extractScore(def, record.scores) path (which does
  // NOT know about the fallback). If a future refactor "simplifies" this
  // back to extractScore, alcohol-3 + loneliness-3 regress to 0 contributors
  // when the BE emits scores:{} — the exact bug Ken reported.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /extractScoreFromRecord\(def\s*,\s*record\)/,
    'subscoreFromRecord must delegate to extractScoreFromRecord(def, record) — chunk 68 wiring for sum-responses fallback',
  )
  // Also assert the module imports the function it delegates to — without
  // this the .ts wouldn't even type-check, but a mechanical codemod could
  // conceivably leave the reference in place while dropping the import
  // and swapping to a shadowed local.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /import\s*\{[^}]*\bextractScoreFromRecord\b[^}]*\}\s*from\s*'@\/lib\/assessment-bands'/,
    'wellbeing-score.ts must import extractScoreFromRecord from @/lib/assessment-bands (chunk 68 dep)',
  )
})

test('(trip wire) selectCurrentRecords re-sorts by completedAt DESC (defensive against API ordering drift)', () => {
  // Mirror the actual sort comparator: `(a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")`.
  // If someone drops the defensive sort ("the API returns newest-first
  // already, right?"), a backend contract change can silently invert the
  // ordering and this file's building blocks pick the OLDEST record as
  // "current" — the exact discipline chunk 58 locked in.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /\.sort\(\s*\(a\s*,\s*b\)\s*=>\s*\(b\.completedAt\s*\?\?\s*''\)\.localeCompare\(a\.completedAt\s*\?\?\s*''\)\s*\)/,
    'selectCurrentRecords / selectPriorRecords must re-sort newest-first via localeCompare — defensive against API-order drift',
  )
})
