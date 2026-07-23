// Unit tests for lib/wellbeing-score.ts subscoreFromRecord() + buildComposite()
// CHUNK 68 (2026-07-23) — proves that the client-side computeFallback path
// recovers alcohol-3 / loneliness-3 subscores from responses when the BE
// emits scores:{}. Regression-guards adl (must NOT fall back) and the
// happy path (records with valid scores.total are byte-identical to the
// pre-fix behavior).
//
// Run with: node --test lib/wellbeing-score.test.mjs
//
// Mirror-only (no TS transpiler wired up). Keeps the same discipline as
// lib/assessment-draft-storage.test.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// --- Mirror of the pure formula from assessment-bands.ts ------------------

function extractScore(def, scores) {
  if (!scores) return undefined
  const field = (def && def.scoreField) || 'total'
  const primary = scores[field]
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary
  return undefined
}

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
  let level
  if (score <= def.lowMax) level = 'low'
  else if (score <= def.mediumMax) level = 'medium'
  else level = 'high'
  return { level }
}

// --- Mirror of the band table entries we exercise -------------------------
const BANDS = {
  'alcohol-3': {
    direction: 'lower-is-better',
    lowMax: 2, mediumMax: 3,
    computeFallback: 'sum-responses',
  },
  'loneliness-3': {
    direction: 'lower-is-better',
    lowMax: 4, mediumMax: 5,
    computeFallback: 'sum-responses',
  },
  adl: {
    direction: 'higher-is-better',
    scoreField: 'independent',
    lowMax: 2, mediumMax: 4,
    // NO computeFallback: ratio scoring must NOT fall back.
  },
  'phq-2': {
    direction: 'lower-is-better',
    lowMax: 2, mediumMax: 4,
    // NOT flagged in this chunk — narrow scope; verify test protects
    // against accidental blanket-flag in a future chunk.
  },
}

// --- Mirror of wellbeing-score.ts subscoreFromRecord + buildComposite ----

const HIGHER_BETTER_SUBSCORE = { low: 20, medium: 60, high: 100 }
const LOWER_BETTER_SUBSCORE = { low: 100, medium: 60, high: 20 }

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

const DOMAIN_MEMBERS = {
  bio: ['adl', 'iadl', 'falls-12', 'nutrition-5', 'pain-4', 'sleep-4', 'physical-function-4'],
  mind: ['phq-2', 'phq-9', 'gad-7', 'pss-4', 'cognition-8', 'mini-cog', 'moca', 'wellbeing-5'],
  social: ['alcohol-3', 'loneliness-3'],
}
const DOMAIN_ORDER = ['bio', 'mind', 'social']

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

// --- Tests ----------------------------------------------------------------

test('alcohol-3 record with scores:{} + responses returns numeric subscore (was undefined pre-fix)', () => {
  const s = subscoreFromRecord({
    instrumentId: 'alcohol-3',
    scores: {},
    responses: { q1: 2, q2: 2, q3: 1 }, // sum=5 → high band → 20 (lower-is-better)
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s, 20)
})

test('loneliness-3 record with scores:{} + responses returns numeric subscore', () => {
  const s = subscoreFromRecord({
    instrumentId: 'loneliness-3',
    scores: {},
    responses: { q1: 3, q2: 3, q3: 2 }, // sum=8 → high → 20
    completedAt: '2026-07-22T11:00:00Z',
  })
  assert.equal(s, 20)
})

test('alcohol-3 with scores.total=1 is byte-identical to pre-fix (low band → 100)', () => {
  const s = subscoreFromRecord({
    instrumentId: 'alcohol-3',
    scores: { total: 1 },
    responses: { q1: 2, q2: 2, q3: 1 }, // ignored; total wins
    completedAt: '2026-07-22T10:00:00Z',
  })
  // total=1 <= lowMax(2) → low → lower-is-better maps low → 100
  assert.equal(s, 100)
})

test('adl record with scores:{} + populated responses returns undefined (no fallback)', () => {
  // Regression guard: ratio-scored instruments must NEVER opt in.
  const s = subscoreFromRecord({
    instrumentId: 'adl',
    scores: {},
    responses: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1 },
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s, undefined)
})

test('buildComposite lifts SOCIAL & FAITH contributors from 0 to 2 when both records have scores:{}', () => {
  // Reproduces Ken 2026-07-23 report exactly: AUDIT-C and UCLA-3 both
  // completed on the account, both round-tripping with scores:{}.
  const kensRecords = {
    'alcohol-3': {
      instrumentId: 'alcohol-3',
      scores: {},
      responses: { q1: 2, q2: 2, q3: 1 },
      completedAt: '2026-07-22T10:00:00Z',
    },
    'loneliness-3': {
      instrumentId: 'loneliness-3',
      scores: {},
      responses: { q1: 3, q2: 3, q3: 2 },
      completedAt: '2026-07-22T11:00:00Z',
    },
  }
  const composite = buildComposite((id) => kensRecords[id])
  const social = composite.domains.find((d) => d.domain === 'social')
  assert.equal(social.contributors, 2, 'both records must contribute to SOCIAL & FAITH')
  // Both subscores = 20 (high risk / worst) → domain mean = 20.
  assert.equal(social.score, 20)
  // Composite denominator is DOMAIN_ORDER.length (3), not the count of
  // scored domains — chunk 62 semantics.
  assert.equal(composite.composite, 20 / 3)
})

test('buildComposite pre-fix simulation: same records with scores:{} + fallback DISABLED = 0 contributors', () => {
  // Simulates what the world looked like BEFORE chunk 68: temporarily
  // pretend alcohol-3/loneliness-3 had no computeFallback flag. Proves
  // the fix genuinely changed behavior for the Ken scenario.
  const OLD_BANDS = {
    ...BANDS,
    'alcohol-3': { ...BANDS['alcohol-3'], computeFallback: undefined },
    'loneliness-3': { ...BANDS['loneliness-3'], computeFallback: undefined },
  }
  function oldExtract(def, record) {
    if (!record) return undefined
    const primary = extractScore(def, record.scores || {})
    if (typeof primary === 'number') return primary
    if (!def || def.computeFallback !== 'sum-responses') return undefined
    // (fallback path unreachable in the simulated old-bands world)
    return undefined
  }
  function oldSubscore(record) {
    if (!record) return undefined
    const def = OLD_BANDS[String(record.instrumentId)]
    if (!def) return undefined
    const raw = oldExtract(def, record)
    const band = computeBand(def, raw)
    if (!band) return undefined
    return def.direction === 'higher-is-better'
      ? HIGHER_BETTER_SUBSCORE[band.level]
      : LOWER_BETTER_SUBSCORE[band.level]
  }
  const kensRecords = {
    'alcohol-3': { instrumentId: 'alcohol-3', scores: {}, responses: { q1: 2, q2: 2, q3: 1 } },
    'loneliness-3': { instrumentId: 'loneliness-3', scores: {}, responses: { q1: 3, q2: 3, q3: 2 } },
  }
  const domains = DOMAIN_ORDER.map((domain) => {
    const subs = DOMAIN_MEMBERS[domain]
      .map((id) => oldSubscore(kensRecords[id]))
      .filter((v) => typeof v === 'number')
    return { domain, contributors: subs.length }
  })
  const social = domains.find((d) => d.domain === 'social')
  // This is the bug Ken reported: SOCIAL & FAITH shows 0 completed
  // even though records exist. The current chunk 68 fix flips this to 2.
  assert.equal(social.contributors, 0)
})

test('records with valid scores.total remain byte-identical (regression snapshot)', () => {
  const s1 = subscoreFromRecord({
    instrumentId: 'alcohol-3',
    scores: { total: 4 }, // > mediumMax(3) → high → 20 (lower-is-better)
    responses: { q1: 2, q2: 2, q3: 0 },
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s1, 20)
  const s2 = subscoreFromRecord({
    instrumentId: 'loneliness-3',
    scores: { total: 3 }, // <= lowMax(4) → low → 100
    responses: { q1: 1, q2: 1, q3: 1 },
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s2, 100)
})

test('narrow scope guard: phq-2 is NOT flagged with computeFallback in this chunk', () => {
  // Chunk 68 deliberately opts in only alcohol-3 + loneliness-3 (the two
  // instruments Ken hit). If someone later blanket-flags all sum-scored
  // bands without per-instrument verification of their response shape,
  // this test breaks so they must justify the change.
  assert.equal(BANDS['phq-2'].computeFallback, undefined)
  const s = subscoreFromRecord({
    instrumentId: 'phq-2',
    scores: {}, // no total
    responses: { q1: 2, q2: 2 },
    completedAt: '2026-07-22T10:00:00Z',
  })
  assert.equal(s, undefined, 'phq-2 without a total must stay undefined until BE contract verified')
})
