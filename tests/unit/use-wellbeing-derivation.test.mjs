// tests/unit/use-wellbeing-derivation.test.mjs — CHUNK 84 v2 (2026-07-23)
//
// Pins the CONTRACT that hooks/use-wellbeing-derivation.ts must uphold so
// the wellbeing card, focus banner, and section pill share ONE pass over
// the same assessment records:
//
//   (a) same records reference → same derivation reference (memo key
//       stability — no wasted deriveWellbeing() calls per render).
//   (b) different records reference → fresh derivation (recomputes on
//       real data change; the historyById map identity IS the key).
//   (c) focus is returned ONLY when the worst domain has
//       ≥ FOCUS_AREA_MIN_CONTRIBUTORS (=2) backing scores.
//   (d) empty records ⇒ sentinel undefined focus + undefined composite.
//   (e) mixed valid/missing scores across bio/mind/social behave
//       coherently: contributors reflect what actually scored, and the
//       composite still lands.
//   (f) composite denominator is ALWAYS DOMAIN_ORDER.length (=3) — the
//       chunk 62 rule Ken locked. Missing domains contribute 0 to the
//       numerator, they do NOT shrink the denominator.
//
// WHY A MIRROR TEST + SOURCE-DRIFT TRIP WIRES (v2 rewrite, 2026-07-23):
//   The repo runs `node --test tests/unit/*` with no TS transpiler and no
//   @testing-library/* deps installed. Establishing an RTL harness for a
//   single hook whose ENTIRE job is `useMemo(() => deriveWellbeing(x), [x])`
//   would drag in jsdom + testing-library + a react-native shim — 30+MB of
//   devDeps to test 15 lines of memoization. Instead we mirror React's
//   useMemo semantics (identity-compare deps) in ~10 lines and re-implement
//   deriveWellbeing()'s formula shape as a pure-JS shadow, matching the
//   established discipline in lib/wellbeing-score.test.mjs.
//
//   V1 of this file relied on the mirror ALONE, which was blind to real
//   source drift — if lib/wellbeing-score.ts silently regressed (composite
//   denominator flipping from DOMAIN_ORDER.length back to scoredCount, or
//   FOCUS_AREA_MIN_CONTRIBUTORS dropping from 2 to 1), the mirror would
//   quietly regress in lockstep and every test still passed green. V2 adds
//   a "source-drift trip wires" suite at the end of this file that reads
//   lib/wellbeing-score.ts, hooks/use-wellbeing-derivation.ts, and
//   lib/assessment-bands.ts as text and asserts source-level regexes/
//   literals for the invariants the mirror can't otherwise catch:
//     - composite formula uses DOMAIN_ORDER.length as denominator
//     - FOCUS_AREA_MIN_CONTRIBUTORS = 2
//     - DOMAIN_ORDER is exactly ['bio', 'mind', 'social']
//     - useWellbeingDerivation's memo dep is the historyById reference
//     - alcohol-3 + loneliness-3 opt in to sum-responses fallback; no
//       promis-* key appears as a real BANDS entry
//   Same pattern as lib/assessment-bands.test.mjs (chunk 68/85), which
//   established the readFileSync-and-grep discipline.
//
//   If the mirror shape ever needs to change (deriveWellbeing signature
//   change, new domain, etc.), the source-drift assertions in the
//   trailing suite are the load-bearing regression net — they catch the
//   REAL risk (a source change that quietly stops matching its intended
//   spec), independent of whether the mirror stays byte-for-byte identical.
//
// npm test picks this up via the script pattern update landing alongside
// this chunk (`node --test tests/unit/*.test.ts tests/unit/*.test.mjs`).
// Verified by running `npm test` after write — this file executes and
// the assertions pass; a spot-check regression in wellbeing-score.ts
// (denominator → scoredCount) flips the source-drift wire red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const WELLBEING_SCORE_TS_PATH = join(REPO_ROOT, 'lib', 'wellbeing-score.ts')
const USE_DERIVATION_TS_PATH = join(REPO_ROOT, 'hooks', 'use-wellbeing-derivation.ts')
const ASSESSMENT_BANDS_TS_PATH = join(REPO_ROOT, 'lib', 'assessment-bands.ts')
const WELLBEING_SCORE_TS_SRC = readFileSync(WELLBEING_SCORE_TS_PATH, 'utf8')
const USE_DERIVATION_TS_SRC = readFileSync(USE_DERIVATION_TS_PATH, 'utf8')
const ASSESSMENT_BANDS_TS_SRC = readFileSync(ASSESSMENT_BANDS_TS_PATH, 'utf8')

// =========================================================================
// Mirror of lib/assessment-bands.ts (subset — only the shape wellbeing
// derivation actually touches).
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
// Mirror of lib/wellbeing-score.ts — deriveWellbeing() and its helpers.
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
const TREND_FLAT_THRESHOLD = 3
const TREND_MIN_COHORT_SIZE = 2
const FOCUS_AREA_GAP_THRESHOLD = 15
const FOCUS_AREA_MIN_CONTRIBUTORS = 2

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

function computeCompositeTrend(curr, prior) {
  if (typeof curr !== 'number' || !Number.isFinite(curr)) return undefined
  if (typeof prior !== 'number' || !Number.isFinite(prior)) return undefined
  const delta = curr - prior
  if (Math.abs(delta) <= TREND_FLAT_THRESHOLD) return { arrow: 'flat', delta }
  return { arrow: delta > 0 ? 'up' : 'down', delta }
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

function deriveWellbeing(historyById) {
  const currentById = selectCurrentRecords(historyById)
  const priorById = selectPriorRecords(historyById, currentById)

  const currentComposite = buildComposite((id) => currentById.get(String(id)))
  const compositeInt =
    typeof currentComposite.composite === 'number'
      ? Math.round(currentComposite.composite)
      : undefined

  const trendCohort = new Set()
  currentById.forEach((curr, key) => {
    if (curr && priorById.get(key)) trendCohort.add(key)
  })
  let trend
  if (trendCohort.size >= TREND_MIN_COHORT_SIZE) {
    const tCurr = buildComposite((id) =>
      trendCohort.has(String(id)) ? currentById.get(String(id)) : undefined,
    )
    const tPrior = buildComposite((id) =>
      trendCohort.has(String(id)) ? priorById.get(String(id)) : undefined,
    )
    const currInt =
      typeof tCurr.composite === 'number' ? Math.round(tCurr.composite) : undefined
    const priorInt =
      typeof tPrior.composite === 'number' ? Math.round(tPrior.composite) : undefined
    trend = computeCompositeTrend(currInt, priorInt)
  }

  return {
    composite: compositeInt,
    domains: currentComposite.domains,
    trend,
    focus: computeFocus(currentComposite.domains),
  }
}

// =========================================================================
// Mirror of hooks/use-wellbeing-derivation.ts memoization semantics.
//
// The real hook body reduces to:
//   const derivation = React.useMemo(() => deriveWellbeing(historyById),
//                                    [historyById])
// where historyById itself is a useMemo keyed on the underlying query
// dataUpdatedAt fingerprints. The behavior consumers depend on is:
//   - stable historyById identity ⇒ stable derivation identity.
//   - fresh historyById identity ⇒ fresh derivation identity (even if the
//     values inside compare-equal — React.useMemo uses Object.is on deps).
//
// runDerivationMemoized() reproduces that contract without React.
// =========================================================================

function makeMemoRunner() {
  let lastDeps
  let lastValue
  return function run(deps, factory) {
    if (
      lastDeps &&
      deps.length === lastDeps.length &&
      deps.every((d, i) => Object.is(d, lastDeps[i]))
    ) {
      return lastValue
    }
    lastDeps = deps
    lastValue = factory()
    return lastValue
  }
}

function makeHook() {
  const memo = makeMemoRunner()
  return function run(historyById) {
    return memo([historyById], () => deriveWellbeing(historyById))
  }
}

// =========================================================================
// Test fixtures
// =========================================================================

function makeRec(instrumentId, scores, completedAt = '2026-07-22T10:00:00Z', responses = {}) {
  return { instrumentId, scores, responses, completedAt }
}

// =========================================================================
// (a) Memoization key stability
// =========================================================================

test('(a) same historyById reference across calls ⇒ same derivation reference (memo hit)', () => {
  const hook = makeHook()
  const history = new Map([
    ['phq-2', [makeRec('phq-2', { total: 1 })]],
    ['adl', [makeRec('adl', { independent: 5 })]],
  ])
  const first = hook(history)
  const second = hook(history)
  assert.strictEqual(first, second, 'stable input identity must skip re-derivation')
})

test('(a) memo hit holds across many renders — no accidental re-run when nothing changed', () => {
  const hook = makeHook()
  const history = new Map([['alcohol-3', [makeRec('alcohol-3', { total: 1 })]]])
  const anchor = hook(history)
  for (let i = 0; i < 25; i++) {
    assert.strictEqual(hook(history), anchor, `iteration ${i} broke memo stability`)
  }
})

// =========================================================================
// (b) Recomputation when records change
// =========================================================================

test('(b) new historyById identity ⇒ fresh derivation reference (memo miss on ref change)', () => {
  const hook = makeHook()
  const first = hook(new Map([['phq-2', [makeRec('phq-2', { total: 1 })]]]))
  const second = hook(new Map([['phq-2', [makeRec('phq-2', { total: 1 })]]]))
  assert.notStrictEqual(first, second, 'new map identity must invalidate memo')
})

test('(b) recompute reflects the new record values (not stale)', () => {
  const hook = makeHook()
  // First: MIND worst → phq-2 total=5 (high → 20). BIO absent, SOCIAL absent.
  const before = hook(new Map([['phq-2', [makeRec('phq-2', { total: 5 })]]]))
  assert.equal(before.composite, Math.round(20 / 3))
  // Then: swap to a low PHQ-2 total → 100.
  const after = hook(new Map([['phq-2', [makeRec('phq-2', { total: 1 })]]]))
  assert.equal(after.composite, Math.round(100 / 3))
  assert.notStrictEqual(before, after)
})

// =========================================================================
// (c) Focus-domain requires contributors ≥ FOCUS_AREA_MIN_CONTRIBUTORS
// =========================================================================

test('(c) focus is undefined when worst domain has only 1 contributor (min-contributors gate)', () => {
  const hook = makeHook()
  // MIND: single phq-2 high → 20 (1 contributor). BIO: two highs → 100+100 mean.
  // SOCIAL: two highs → 100+100 mean. MIND is worst by 80 pts, but n=1 blocks focus.
  const history = new Map([
    ['phq-2', [makeRec('phq-2', { total: 5 })]], // 1 contributor, high → 20
    ['adl', [makeRec('adl', { independent: 5 })]], // high → 100
    ['iadl', [makeRec('iadl', { independent: 7 })]], // high → 100
    ['alcohol-3', [makeRec('alcohol-3', { total: 1 })]], // low → 100
    ['loneliness-3', [makeRec('loneliness-3', { total: 3 })]], // low → 100
  ])
  const result = hook(history)
  assert.equal(result.focus, undefined, 'callout must be silenced on n=1 signal')
})

test('(c) focus fires once worst domain crosses the min-contributors threshold (n=2)', () => {
  const hook = makeHook()
  const history = new Map([
    ['phq-2', [makeRec('phq-2', { total: 5 })]], // 20
    ['phq-9', [makeRec('phq-9', { total: 20 })]], // 20 → 2 contributors in MIND now
    ['adl', [makeRec('adl', { independent: 5 })]], // 100
    ['iadl', [makeRec('iadl', { independent: 7 })]], // 100
    ['alcohol-3', [makeRec('alcohol-3', { total: 1 })]], // 100
    ['loneliness-3', [makeRec('loneliness-3', { total: 3 })]], // 100
  ])
  const result = hook(history)
  assert.equal(result.focus, 'mind')
})

test('(c) focus stays undefined when gap < 15 even with sufficient contributors', () => {
  const hook = makeHook()
  // All three domains cluster at 60 (medium). No gap ≥ 15.
  const history = new Map([
    ['phq-2', [makeRec('phq-2', { total: 3 })]], // medium → 60
    ['phq-9', [makeRec('phq-9', { total: 10 })]], // medium → 60
    ['adl', [makeRec('adl', { independent: 3 })]], // medium → 60
    ['iadl', [makeRec('iadl', { independent: 5 })]], // medium → 60
    ['alcohol-3', [makeRec('alcohol-3', { total: 3 })]], // medium → 60
    ['loneliness-3', [makeRec('loneliness-3', { total: 5 })]], // medium → 60
  ])
  const result = hook(history)
  assert.equal(result.focus, undefined)
})

// =========================================================================
// (d) Empty records ⇒ sentinel/undefined focus
// =========================================================================

test('(d) empty historyById ⇒ composite undefined AND focus undefined (empty state, not zero)', () => {
  const hook = makeHook()
  const result = hook(new Map())
  assert.equal(result.composite, undefined)
  assert.equal(result.focus, undefined)
  assert.equal(result.trend, undefined)
  // Domain aggregates still emitted in canonical order with 0 contributors —
  // the card renders "no data" pills instead of hiding domains entirely.
  assert.deepEqual(
    result.domains.map((d) => d.domain),
    ['bio', 'mind', 'social'],
  )
  for (const d of result.domains) {
    assert.equal(d.score, undefined)
    assert.equal(d.contributors, 0)
  }
})

test('(d) historyById with only empty arrays behaves the same as an empty map', () => {
  const hook = makeHook()
  const result = hook(
    new Map([
      ['phq-2', []],
      ['adl', []],
      ['alcohol-3', []],
    ]),
  )
  assert.equal(result.composite, undefined)
  assert.equal(result.focus, undefined)
})

// =========================================================================
// (e) Mixed valid/missing scores across bio/mind/social
// =========================================================================

test('(e) mixed valid/missing: BIO scored, MIND missing, SOCIAL scored — contributors reflect reality', () => {
  const hook = makeHook()
  const history = new Map([
    ['adl', [makeRec('adl', { independent: 5 })]], // BIO high → 100
    // MIND: nothing valid — phq-2 record has empty scores AND no responses.
    ['phq-2', [makeRec('phq-2', {})]],
    ['alcohol-3', [makeRec('alcohol-3', { total: 4 })]], // SOCIAL high → 20
  ])
  const result = hook(history)
  const byDomain = Object.fromEntries(result.domains.map((d) => [d.domain, d]))
  assert.equal(byDomain.bio.contributors, 1)
  assert.equal(byDomain.bio.score, 100)
  assert.equal(byDomain.mind.contributors, 0)
  assert.equal(byDomain.mind.score, undefined)
  assert.equal(byDomain.social.contributors, 1)
  assert.equal(byDomain.social.score, 20)
})

test('(e) records missing scores.total but with responses (sum-responses fallback) still contribute', () => {
  const hook = makeHook()
  // Ken 2026-07-23 scenario: alcohol-3 + loneliness-3 both round-tripped
  // with scores:{}, both must recover via computeFallback.
  const history = new Map([
    [
      'alcohol-3',
      [makeRec('alcohol-3', {}, '2026-07-22T10:00:00Z', { q1: 2, q2: 2, q3: 1 })],
    ],
    [
      'loneliness-3',
      [makeRec('loneliness-3', {}, '2026-07-22T11:00:00Z', { q1: 3, q2: 3, q3: 2 })],
    ],
  ])
  const result = hook(history)
  const social = result.domains.find((d) => d.domain === 'social')
  assert.equal(social.contributors, 2)
  assert.equal(social.score, 20) // both high → mean 20
})

// =========================================================================
// (f) Composite always divides by DOMAIN_ORDER.length = 3 (chunk 62 rule)
// =========================================================================

test('(f) only SOCIAL scored ⇒ composite = social/3 (denominator locked at 3, not 1)', () => {
  const hook = makeHook()
  const history = new Map([
    ['alcohol-3', [makeRec('alcohol-3', { total: 1 })]], // low → 100
  ])
  const result = hook(history)
  // 100 / 3 rounded = 33
  assert.equal(result.composite, Math.round(100 / 3))
})

test('(f) BIO+MIND scored, SOCIAL absent ⇒ composite = (bio + mind)/3', () => {
  const hook = makeHook()
  const history = new Map([
    ['adl', [makeRec('adl', { independent: 5 })]], // 100
    ['phq-2', [makeRec('phq-2', { total: 1 })]], // 100
  ])
  const result = hook(history)
  // (100 + 100) / 3 = 66.66 → 67
  assert.equal(result.composite, Math.round(200 / 3))
})

test('(f) all three domains scored at 100 ⇒ composite = 100 (denominator still 3, not scoredCount)', () => {
  const hook = makeHook()
  const history = new Map([
    ['adl', [makeRec('adl', { independent: 5 })]], // 100
    ['phq-2', [makeRec('phq-2', { total: 1 })]], // 100
    ['alcohol-3', [makeRec('alcohol-3', { total: 1 })]], // 100
  ])
  const result = hook(history)
  assert.equal(result.composite, 100)
})

test('(f) missing domains contribute 0 to numerator — NOT invisible (Ken 2026-07-22 dogfood)', () => {
  const hook = makeHook()
  // BIO 60, MIND 60, SOCIAL missing → composite = (60+60+0)/3 = 40. Old
  // formula (mean of scored domains) would have said 60, hiding the gap
  // Ken called out.
  const history = new Map([
    ['adl', [makeRec('adl', { independent: 3 })]], // medium → 60
    ['phq-2', [makeRec('phq-2', { total: 3 })]], // medium → 60
  ])
  const result = hook(history)
  assert.equal(result.composite, Math.round((60 + 60) / 3))
  assert.notEqual(result.composite, 60) // old-formula would have been 60
})

// =========================================================================
// SOURCE-DRIFT TRIP WIRES (CHUNK 84 v2, 2026-07-23)
//
// The behavioral suite above is a mirror — if lib/wellbeing-score.ts silently
// regresses AND the mirror is edited to match, every test still passes green
// even though the real product is broken. The tests below defend against
// that class of failure by reading the actual .ts source as text and
// grepping for the load-bearing shapes we can't reproduce behaviorally
// without a TS transpiler. Same discipline as lib/assessment-bands.test.mjs
// (chunks 68 + 85).
//
// If any of these fail, DO NOT edit the regex to make it pass. Read the
// diff on the .ts file and confirm the source change is intentional; only
// then update the trip wire to match the new (and reviewed) spec.
// =========================================================================

test('(trip wire i) lib/wellbeing-score.ts composite formula divides by DOMAIN_ORDER.length (chunk 62 rule)', () => {
  // The composite denominator MUST be DOMAIN_ORDER.length (i.e. 3). A
  // regression to `composite = sum / scoredCount` would silently inflate
  // the wellbeing score whenever a domain is missing — the exact bug Ken
  // caught on 2026-07-22 ("calculated by 200 when it should be by 300").
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /composite\s*=\s*sum\s*\/\s*DOMAIN_ORDER\.length\b/,
    'composite formula must divide by DOMAIN_ORDER.length — a regression to scoredCount silently inflates scores when a domain is missing',
  )
  // Explicit negative guard: the old formula would have been
  // `sum / scoredCount`. Assert that shape is nowhere in the file.
  assert.doesNotMatch(
    WELLBEING_SCORE_TS_SRC,
    /composite\s*=\s*sum\s*\/\s*scoredCount\b/,
    'composite formula must NOT revert to `sum / scoredCount` — that was the pre-chunk-62 inflated-score bug',
  )
})

test('(trip wire ii) lib/wellbeing-score.ts FOCUS_AREA_MIN_CONTRIBUTORS is exactly 2', () => {
  // Dropping this from 2 to 1 would resurrect the n=1 false-positive
  // callout ("your mental health needs focus" off a single PHQ-2 record)
  // that chunk 59's adversarial verify caught.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /FOCUS_AREA_MIN_CONTRIBUTORS\s*=\s*2\b/,
    'FOCUS_AREA_MIN_CONTRIBUTORS must remain 2 — dropping to 1 resurrects the single-signal false-positive callout',
  )
})

test('(trip wire iii) lib/wellbeing-score.ts DOMAIN_ORDER is exactly [\'bio\', \'mind\', \'social\'] in that order', () => {
  // Canonical BPS order (biological → psychological → social) is
  // load-bearing: SectionCard ordering, the focus banner, and the
  // pill row all iterate DOMAIN_ORDER. A silent reshuffle would flip
  // the "first tie wins the lowest slot" determinism in computeFocus
  // and mis-order the on-screen pills.
  assert.match(
    WELLBEING_SCORE_TS_SRC,
    /DOMAIN_ORDER\s*:\s*readonly\s+BpsDomain\[\]\s*=\s*\[\s*'bio'\s*,\s*'mind'\s*,\s*'social'\s*\]/,
    "DOMAIN_ORDER must remain the exact 3-tuple ['bio', 'mind', 'social'] in canonical order",
  )
})

test('(trip wire iv) hooks/use-wellbeing-derivation.ts memoizes derivation on the historyById reference', () => {
  // The whole point of chunk 60 was: compute deriveWellbeing() ONCE
  // per historyById identity. If the useMemo dep array is widened to
  // include per-render values (e.g. `[historyById, someState]`) or
  // narrowed to a stable literal, we lose either the memo hit or the
  // recompute on real data change.
  assert.match(
    USE_DERIVATION_TS_SRC,
    /React\.useMemo\(\s*\(\)\s*=>\s*deriveWellbeing\(historyById\)\s*,\s*\[\s*historyById\s*\]\s*\)/,
    'useWellbeingDerivation must memoize on [historyById] exactly — widening or narrowing the deps breaks the "compute once" guarantee',
  )
})

// (v) BANDS opt-in cross-reference — asserts against lib/assessment-bands.ts.
// This is a cross-file assertion: wellbeing-score.ts's SOCIAL contributor
// count is silently gated by which entries in ASSESSMENT_BANDS carry
// `computeFallback: 'sum-responses'`. If alcohol-3 or loneliness-3 loses
// the opt-in, Ken's dogfood scenario (scores:{} + populated responses)
// regresses to a zero-contributor SOCIAL pill even though the mirror
// tests above still pass (they don't know about the source).

test("(trip wire v) lib/assessment-bands.ts alcohol-3 entry retains computeFallback: 'sum-responses'", () => {
  const alcoholBlock = tsBlockFor(ASSESSMENT_BANDS_TS_SRC, 'alcohol-3')
  assert.ok(alcoholBlock, "alcohol-3 must exist as a real key in ASSESSMENT_BANDS")
  assert.match(
    alcoholBlock,
    /computeFallback:\s*'sum-responses'/,
    "alcohol-3 must retain sum-responses opt-in — SOCIAL contributor count depends on this per Ken 2026-07-23 dogfood",
  )
})

test("(trip wire v) lib/assessment-bands.ts loneliness-3 entry retains computeFallback: 'sum-responses'", () => {
  const lonelinessBlock = tsBlockFor(ASSESSMENT_BANDS_TS_SRC, 'loneliness-3')
  assert.ok(lonelinessBlock, "loneliness-3 must exist as a real key in ASSESSMENT_BANDS")
  assert.match(
    lonelinessBlock,
    /computeFallback:\s*'sum-responses'/,
    "loneliness-3 must retain sum-responses opt-in — SOCIAL contributor count depends on this per Ken 2026-07-23 dogfood",
  )
})

test('(trip wire v) lib/assessment-bands.ts contains NO real promis-* entry key (T-score contract unverified)', () => {
  // Chunk 58 intentionally omits promis-pain-4 / promis-sleep-4 /
  // promis-physical-function-4 (and the bare pain-4/sleep-4/physical-
  // function-4 aliases that appear in DOMAIN_MEMBERS.bio) until the BE
  // T-score-vs-raw-sum contract is verified. If any of these appear as
  // real entry keys, subscoreFromRecord() will start banding them —
  // producing confidently-wrong patient-facing pills.
  //
  // A "real entry key" sits at column 2 (2-space indent inside the
  // ASSESSMENT_BANDS object literal) followed by a colon. Doc-comment
  // mentions of the same string are allowed (they explain the omission).
  const promisIds = [
    'promis-pain-4',
    'promis-sleep-4',
    'promis-physical-function-4',
    'pain-4',
    'sleep-4',
    'physical-function-4',
  ]
  for (const id of promisIds) {
    const key = `'${id}':`
    let searchFrom = 0
    while (true) {
      const idx = ASSESSMENT_BANDS_TS_SRC.indexOf(key, searchFrom)
      if (idx === -1) break
      const lineStart = ASSESSMENT_BANDS_TS_SRC.lastIndexOf('\n', idx) + 1
      const preface = ASSESSMENT_BANDS_TS_SRC.slice(lineStart, idx)
      assert.match(
        preface,
        /\/\/|\*/,
        `PROMIS-family id '${id}' must not appear as a real ASSESSMENT_BANDS entry key (found outside a comment at index ${idx}) — chunk 58 intentionally omits these pending BE T-score contract verification`,
      )
      searchFrom = idx + key.length
    }
  }
})

// Helper — mirrors the tsBlockFor() approach in lib/assessment-bands.test.mjs
// but hoisted here so trip-wire (v) is self-contained.
function tsBlockFor(src, instrumentId) {
  const keyIdx = src.indexOf(`'${instrumentId}':`)
  if (keyIdx === -1) return undefined
  const openIdx = src.indexOf('{', keyIdx)
  if (openIdx === -1) return undefined
  let depth = 0
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return src.slice(openIdx, i + 1)
    }
  }
  return undefined
}
