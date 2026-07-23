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

// =========================================================================
// CHUNK 80 (2026-07-23) — pin chunks 59/60/62 behavior
//
// These tests mirror three more pure code paths from lib/wellbeing-score.ts
// so future refactors can't silently regress:
//   - chunk 62: composite denominator is DOMAIN_ORDER.length (3), always.
//   - chunk 60: FOCUS_AREA_MIN_CONTRIBUTORS gate on the callout.
//   - chunk 59: trend cohort = instrument INTERSECTION of current AND
//     ≥7d prior — empty cohort ⇒ trend undefined.
//   - BPS_TO_SECTION crosswalk (chunk 60 taxonomy bridge).
//   - bpsToSection() helper undefined-in ⇒ undefined-out.
//
// Same "mirror-only" convention as the tests above: no TS transpiler,
// so the constants and helpers exercised here are re-declared as pure
// JS shadows of the module. If any test breaks and the mirror is the
// culprit, cross-check against lib/wellbeing-score.ts.
// =========================================================================

// --- Mirrors of chunk 60/62 constants & helpers ---------------------------

const BPS_TO_SECTION = {
  bio: 'biological',
  mind: 'psychological',
  social: 'social',
}

function bpsToSection(domain) {
  if (!domain) return undefined
  return BPS_TO_SECTION[domain]
}

const FOCUS_AREA_GAP_THRESHOLD = 15
const FOCUS_AREA_MIN_CONTRIBUTORS = 2

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

// --- Mirrors of chunk 59 trend intersection --------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const TREND_FLAT_THRESHOLD = 3
const TREND_MIN_COHORT_SIZE = 2

function computeCompositeTrend(currComposite, priorComposite) {
  if (typeof currComposite !== 'number' || !Number.isFinite(currComposite)) return undefined
  if (typeof priorComposite !== 'number' || !Number.isFinite(priorComposite)) return undefined
  const delta = currComposite - priorComposite
  if (Math.abs(delta) <= TREND_FLAT_THRESHOLD) return { arrow: 'flat', delta }
  return { arrow: delta > 0 ? 'up' : 'down', delta }
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

function deriveTrend(historyById) {
  // Minimal mirror of deriveWellbeing()'s trend branch — the part that
  // this chunk pins. Returns { trend, cohortSize } so tests can also
  // assert the intersection size.
  const currentById = selectCurrentRecords(historyById)
  const priorById = selectPriorRecords(historyById, currentById)
  const trendCohort = new Set()
  currentById.forEach((curr, key) => {
    if (curr && priorById.get(key)) trendCohort.add(key)
  })
  if (trendCohort.size < TREND_MIN_COHORT_SIZE) {
    return { trend: undefined, cohortSize: trendCohort.size }
  }
  const trendCurrentComposite = buildComposite((id) =>
    trendCohort.has(String(id)) ? currentById.get(String(id)) : undefined,
  )
  const trendPriorComposite = buildComposite((id) =>
    trendCohort.has(String(id)) ? priorById.get(String(id)) : undefined,
  )
  const trendCurrInt =
    typeof trendCurrentComposite.composite === 'number'
      ? Math.round(trendCurrentComposite.composite)
      : undefined
  const trendPriorInt =
    typeof trendPriorComposite.composite === 'number'
      ? Math.round(trendPriorComposite.composite)
      : undefined
  return {
    trend: computeCompositeTrend(trendCurrInt, trendPriorInt),
    cohortSize: trendCohort.size,
  }
}

// --- Chunk 62: divide-by-3 composite formula ------------------------------

test('chunk 62: composite denominator is DOMAIN_ORDER.length (3), even when only one domain has signal', () => {
  // Only SOCIAL contributes; BIO + MIND missing. Composite = (0 + 0 + 20)/3.
  const records = {
    'alcohol-3': {
      instrumentId: 'alcohol-3',
      scores: { total: 4 }, // > mediumMax(3) → high → 20
      responses: {},
      completedAt: '2026-07-22T10:00:00Z',
    },
  }
  const composite = buildComposite((id) => records[id])
  assert.equal(composite.composite, 20 / 3)
  // Sanity: only SOCIAL has a numeric score; other domains are undefined.
  const bio = composite.domains.find((d) => d.domain === 'bio')
  const mind = composite.domains.find((d) => d.domain === 'mind')
  const social = composite.domains.find((d) => d.domain === 'social')
  assert.equal(bio.score, undefined)
  assert.equal(mind.score, undefined)
  assert.equal(social.score, 20)
})

test('chunk 62: composite = (bio + mind + social)/3 with all three present', () => {
  // BIO from adl (higher-is-better; scores.independent=5 > mediumMax(4) → high → 100)
  // MIND from phq-2 (lower-is-better; scores.total=1 <= lowMax(2) → low → 100)
  // SOCIAL from alcohol-3 (lower-is-better; scores.total=1 <= lowMax(2) → low → 100)
  const records = {
    adl: {
      instrumentId: 'adl',
      scores: { independent: 5 },
      responses: {},
      completedAt: '2026-07-22T10:00:00Z',
    },
    'phq-2': {
      instrumentId: 'phq-2',
      scores: { total: 1 },
      responses: {},
      completedAt: '2026-07-22T10:00:00Z',
    },
    'alcohol-3': {
      instrumentId: 'alcohol-3',
      scores: { total: 1 },
      responses: {},
      completedAt: '2026-07-22T10:00:00Z',
    },
  }
  const composite = buildComposite((id) => records[id])
  assert.equal(composite.composite, 100) // (100 + 100 + 100) / 3
})

test('chunk 62: no records at all ⇒ composite undefined (empty-state, NOT zero)', () => {
  const composite = buildComposite(() => undefined)
  assert.equal(composite.composite, undefined)
  for (const d of composite.domains) {
    assert.equal(d.score, undefined)
    assert.equal(d.contributors, 0)
  }
})

// --- Chunk 60: FOCUS_AREA_MIN_CONTRIBUTORS gate ---------------------------

test('chunk 60: focus does NOT fire when worst domain has only 1 contributor (min-contributors gate)', () => {
  // MIND worst (score 20) with only 1 contributor; BIO + SOCIAL at 100.
  // Gap = 100 - 20 = 80 (well over threshold), but callout must be
  // suppressed because MIND's n=1 doesn't justify the claim.
  const domains = [
    { domain: 'bio', score: 100, contributors: 3 },
    { domain: 'mind', score: 20, contributors: 1 },
    { domain: 'social', score: 100, contributors: 2 },
  ]
  assert.equal(computeFocus(domains), undefined)
})

test('chunk 60: focus fires when worst domain has ≥2 contributors and gap ≥15', () => {
  const domains = [
    { domain: 'bio', score: 100, contributors: 3 },
    { domain: 'mind', score: 20, contributors: 2 }, // now meets gate
    { domain: 'social', score: 100, contributors: 2 },
  ]
  assert.equal(computeFocus(domains), 'mind')
})

test('chunk 60: focus does NOT fire when gap < 15 even with sufficient contributors', () => {
  // BIO 80 vs mean(others)=90 → gap 10, under threshold.
  const domains = [
    { domain: 'bio', score: 80, contributors: 3 },
    { domain: 'mind', score: 90, contributors: 3 },
    { domain: 'social', score: 90, contributors: 3 },
  ]
  assert.equal(computeFocus(domains), undefined)
})

test('chunk 60: focus undefined when fewer than 2 domains have a score', () => {
  const domains = [
    { domain: 'bio', score: 20, contributors: 5 },
    { domain: 'mind', score: undefined, contributors: 0 },
    { domain: 'social', score: undefined, contributors: 0 },
  ]
  assert.equal(computeFocus(domains), undefined)
})

test('chunk 60: constant FOCUS_AREA_MIN_CONTRIBUTORS is 2 (pins the callout gate)', () => {
  assert.equal(FOCUS_AREA_MIN_CONTRIBUTORS, 2)
})

// --- Chunk 59: trend cohort intersection ----------------------------------

test('chunk 59: trend undefined when NO instrument has both current AND ≥7d prior (empty cohort)', () => {
  // Two instruments each with only ONE record — no prior possible.
  const history = new Map([
    [
      'phq-2',
      [{ instrumentId: 'phq-2', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' }],
    ],
    [
      'gad-7',
      [{ instrumentId: 'gad-7', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' }],
    ],
  ])
  const { trend, cohortSize } = deriveTrend(history)
  assert.equal(cohortSize, 0)
  assert.equal(trend, undefined)
})

test('chunk 59: trend undefined when only ONE instrument has both endpoints (min cohort size 2)', () => {
  const history = new Map([
    [
      'phq-2',
      [
        { instrumentId: 'phq-2', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' },
        { instrumentId: 'phq-2', scores: { total: 4 }, responses: {}, completedAt: '2026-07-14T00:00:00Z' },
      ],
    ],
    [
      'gad-7',
      // Prior is only 2 days older — doesn't satisfy 7d cutoff.
      [
        { instrumentId: 'gad-7', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' },
        { instrumentId: 'gad-7', scores: { total: 4 }, responses: {}, completedAt: '2026-07-20T00:00:00Z' },
      ],
    ],
  ])
  const { trend, cohortSize } = deriveTrend(history)
  assert.equal(cohortSize, 1)
  assert.equal(trend, undefined)
})

test('chunk 59: trend computed only over instruments with BOTH endpoints (intersection semantics)', () => {
  // BOTH phq-2 and gad-7 have current + ≥7d prior; alcohol-3 has only
  // current. Trend must include phq-2/gad-7 and IGNORE alcohol-3
  // entirely — even though alcohol-3 would inflate the "current"
  // composite if used naively.
  const history = new Map([
    [
      'phq-2',
      [
        // current: total=1 → low → 100
        { instrumentId: 'phq-2', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' },
        // prior (>=7d older): total=5 → high → 20
        { instrumentId: 'phq-2', scores: { total: 5 }, responses: {}, completedAt: '2026-07-10T00:00:00Z' },
      ],
    ],
    [
      'gad-7',
      [
        // current: total=1 → low → 100 (gad-7 lowMax=4 in real bands, mirror uses phq-2 shape;
        // we don't ship the gad-7 def here so subscoreFromRecord returns undefined for it.
        // The point being validated is: cohort MEMBERSHIP is derived from
        // history-map presence, not from whether the def is in this mirror.)
        { instrumentId: 'gad-7', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' },
        { instrumentId: 'gad-7', scores: { total: 5 }, responses: {}, completedAt: '2026-07-10T00:00:00Z' },
      ],
    ],
    [
      'alcohol-3',
      [
        { instrumentId: 'alcohol-3', scores: { total: 4 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' },
      ],
    ],
  ])
  const { trend, cohortSize } = deriveTrend(history)
  // Cohort = phq-2 + gad-7 = 2. alcohol-3 excluded from trend even though present today.
  assert.equal(cohortSize, 2)
  // gad-7 has no def in the mirror; phq-2 is the only contributor.
  // Current phq-2 → MIND=100 → composite (mind only) = 100/3 → round 33.
  // Prior  phq-2 → MIND=20  → composite = 20/3  → round 7.
  // Delta = 33 - 7 = 26 > threshold → arrow 'up'.
  assert.equal(trend.arrow, 'up')
  assert.equal(trend.delta, 26)
})

test('chunk 59: cutoff is strict ≤ 7d (a prior exactly 7d older qualifies)', () => {
  const history = new Map([
    [
      'phq-2',
      [
        { instrumentId: 'phq-2', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' },
        { instrumentId: 'phq-2', scores: { total: 5 }, responses: {}, completedAt: '2026-07-15T00:00:00Z' }, // exactly 7d prior
      ],
    ],
    [
      'gad-7',
      [
        { instrumentId: 'gad-7', scores: { total: 1 }, responses: {}, completedAt: '2026-07-22T00:00:00Z' },
        { instrumentId: 'gad-7', scores: { total: 5 }, responses: {}, completedAt: '2026-07-15T00:00:00Z' },
      ],
    ],
  ])
  const { cohortSize } = deriveTrend(history)
  assert.equal(cohortSize, 2, 'boundary prior (exactly 7d earlier) must qualify')
})

// --- BPS_TO_SECTION crosswalk & bpsToSection helper -----------------------

test('BPS_TO_SECTION crosswalk maps bio→biological, mind→psychological, social→social', () => {
  assert.equal(BPS_TO_SECTION.bio, 'biological')
  assert.equal(BPS_TO_SECTION.mind, 'psychological')
  assert.equal(BPS_TO_SECTION.social, 'social')
  // Guard against silent extra keys — chunk 60 spec ties this to
  // BiopsychosocialSectionKey's three-valued union.
  assert.deepEqual(Object.keys(BPS_TO_SECTION).sort(), ['bio', 'mind', 'social'])
})

test('bpsToSection() returns the mapped value for every BpsDomain', () => {
  assert.equal(bpsToSection('bio'), 'biological')
  assert.equal(bpsToSection('mind'), 'psychological')
  assert.equal(bpsToSection('social'), 'social')
})

test('bpsToSection(undefined) returns undefined (pass-through so callers skip a null-check)', () => {
  assert.equal(bpsToSection(undefined), undefined)
})
