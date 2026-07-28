/**
 * lib/wellbeing-score.ts — CHUNK 59 (2026-07-22)
 *
 * Pure formula module for the composite "Wellbeing Score" that Ken
 * asked for on the BPS surface ("kind of like a flash that somebody
 * wakes up to every day", Oura-sleep-score analogy — see
 * memory:project_wellbeing_map_bps_platform).
 *
 * WHY A SEPARATE MODULE (extracted from BpsWellbeingScoreCard.tsx):
 *   1. Testability — every function here is pure (no React, no I/O,
 *      no time-of-day dependency beyond what the caller passes in).
 *      A future jest test can pin the formula in isolation.
 *   2. Reusability — v2 surfaces (Circle drilldown, notification
 *      banners, care-manager dashboard) will want the same composite
 *      without re-inventing the tables.
 *   3. Iteration surface — Ken's v1 formula is intentionally simple
 *      (band → subscore → domain mean → composite mean). When Ken
 *      tightens the weighting or adds wearables/EHR in v2, the
 *      edits happen HERE and every consumer gets them.
 *
 * SCOPE (deliberately v1, per chunk 59 brief):
 *   - Self-report ONLY. Cards that consume this must label the
 *     number as "self-report only" so Ken never misreads it as an
 *     EHR-derived vitality score.
 *   - Formula: each instrument with a computeBand() result → 0-100
 *     subscore (direction-normalized: low/med/high = 100/60/20 for
 *     lower-is-better, 20/60/100 for higher-is-better).
 *   - Group by BPS domain (bio/mind/social). Domain subscore = mean
 *     of member subscores that exist. Composite = mean of the
 *     domain subscores that have at least one member. Round 0-100.
 *   - Trend: current composite vs a "7d prior" composite built
 *     per-instrument from the nearest earlier record whose
 *     completedAt ≤ (currentCompletedAt − 7d). ±3 pts = steady.
 *   - Focus callout ("Your bio area needs attention this week")
 *     surfaces ONLY when the weakest domain trails the mean of the
 *     other two by ≥15 pts.
 *
 * Instruments not yet in ASSESSMENT_BANDS (pain-4 / sleep-4 /
 * physical-function-4 — omitted in chunk 58 pending backend contract
 * verification) silently drop out via getBandDef() returning
 * undefined; they'll reappear the moment lib/assessment-bands.ts
 * lands their cutoffs. No caller change needed then.
 */

import type { AssessmentRecord, InstrumentId } from '@/services/api/assessments'
import { computeBand, extractScoreFromRecord, getBandDef } from '@/lib/assessment-bands'

// ---------------------------------------------------------------
// Public types
// ---------------------------------------------------------------

export type BpsDomain = 'bio' | 'mind' | 'social'
export type TrendArrow = 'up' | 'down' | 'flat'

export interface DomainAggregate {
  domain: BpsDomain
  /** Domain subscore 0-100 (rounded on the caller for display), or
   *  undefined if no member instrument in this domain contributed. */
  score: number | undefined
  /** Count of instruments in this domain that produced a subscore. */
  contributors: number
}

export interface CompositeResult {
  /** 0-100 composite, or undefined if no domain had any contributor. */
  composite: number | undefined
  /** Per-domain aggregates in canonical order (bio, mind, social). */
  domains: DomainAggregate[]
}

export interface TrendResult {
  arrow: TrendArrow
  /** currentComposite − priorComposite (integer, both rounded first). */
  delta: number
}

/**
 * Snapshot passed by callers. `completedAt` is required for trend math
 * but optional here because callers sometimes have a raw record whose
 * completedAt they already validated at the query layer.
 *
 * CHUNK 68 (2026-07-23): widened to also carry `responses` so
 * subscoreFromRecord() can hand the full snapshot to
 * extractScoreFromRecord() and recover a total via the
 * `computeFallback: 'sum-responses'` path when the BE emits scores:{}
 * (see lib/assessment-bands.ts extractScoreFromRecord doc). All current
 * call sites already pass a full AssessmentRecord (see
 * hooks/use-wellbeing-derivation.ts), so this is a type-only widen with
 * no consumer change required.
 */
export type RecordSnapshot = Pick<
  AssessmentRecord,
  'instrumentId' | 'scores' | 'completedAt' | 'responses'
>

// ---------------------------------------------------------------
// Formula tables — kept as data so v2 tweaks are one-line edits.
// ---------------------------------------------------------------

/**
 * Which instruments feed each BPS domain in v1. Verbatim from the
 * chunk 59 spec. See notes above re: instruments that are listed
 * here but not yet in ASSESSMENT_BANDS — they auto-join later.
 */
export const DOMAIN_MEMBERS: Record<BpsDomain, readonly InstrumentId[]> = {
  bio: ['pain-4', 'sleep-4', 'physical-function-4', 'adl', 'iadl', 'falls-12', 'nutrition-5'],
  mind: ['phq-2', 'phq-9', 'gad-7', 'pss-4', 'cognition-8', 'mini-cog', 'moca', 'wellbeing-5'],
  social: ['alcohol-3', 'loneliness-3'],
}

/**
 * Patient-facing pill label per domain — matches Ken's transcript.
 * Chunk 62 (2026-07-22): SOCIAL → 'SOCIAL & FAITH' per Ken's dogfood
 * ask; the section on BPS is already titled 'Social & Faith' and the
 * compact wellbeing pill needs to match.
 */
export const DOMAIN_LABEL: Record<BpsDomain, string> = {
  bio: 'BIO',
  mind: 'MIND',
  social: 'SOCIAL & FAITH',
}

/**
 * Callout phrase noun — natural-English form used inside the sentence
 * "Your {name} could use some focus." Chunk 59 adversarial-verify fix
 * (major #3): the initial "mind area" / "bio area" copy read as
 * engineer jargon in a patient-facing sentence; renamed to the
 * clinical-friendly synonyms Ken uses on calls ("physical health",
 * "mental health", "social connection"). Kept as a separate constant
 * from DOMAIN_LABEL so the compact pill can stay short ("MIND") while
 * the full-sentence callout reads naturally.
 */
export const DOMAIN_CALLOUT_NAME: Record<BpsDomain, string> = {
  bio: 'physical health',
  mind: 'mental health',
  // Chunk 62 (2026-07-22): "social connection" → "social & faith" so the
  // callout sentence matches Ken's rename of the section title. Reads as
  // "Focus this week: your social & faith. Tap to jump there." — a hair
  // awkward grammatically but matches the section header verbatim, which
  // Ken preferred over "social & faith connection" during dogfood.
  social: 'social & faith',
}

/** Union of every domain member, in stable order. Useful for callers
 *  that need to prefetch history for the full tracked set. */
export const ALL_TRACKED_INSTRUMENTS: readonly InstrumentId[] = ([] as InstrumentId[]).concat(
  ...(['bio', 'mind', 'social'] as BpsDomain[]).map((d) => [...DOMAIN_MEMBERS[d]]),
)

/** Canonical domain iteration order (matches BiopsychosocialSectionKey). */
export const DOMAIN_ORDER: readonly BpsDomain[] = ['bio', 'mind', 'social']

/**
 * CHUNK 60 (2026-07-22) — crosswalk from the wellbeing formula's BpsDomain
 * (`bio` | `mind` | `social`) to SectionCard's BiopsychosocialSectionKey
 * (`biological` | `psychological` | `social`). Single source of truth so
 * the banner, the screen's scroll-to helper, and the SectionCard `isFocus`
 * check can't drift on a taxonomy rename.
 *
 * Kept as a plain string-literal record here (not `BiopsychosocialSectionKey`
 * from SectionCard.tsx) so lib/ stays free of a component-tree import; the
 * two string sets are asserted equal at the SectionCard call site via
 * TypeScript's structural typing when the parent does
 * `bpsToSection(focus) === key`.
 */
export const BPS_TO_SECTION: Record<BpsDomain, 'biological' | 'psychological' | 'social'> = {
  bio: 'biological',
  mind: 'psychological',
  social: 'social',
}

/**
 * Convenience helper — mirrors BPS_TO_SECTION lookups without callers
 * having to import the map. Undefined input yields undefined so the
 * banner / screen can pass `focus` through without a null-check dance.
 */
export function bpsToSection(
  domain: BpsDomain | undefined,
): 'biological' | 'psychological' | 'social' | undefined {
  if (!domain) return undefined
  return BPS_TO_SECTION[domain]
}

/**
 * band-level → 0-100 subscore. Direction is folded in at the caller so
 * this table stays symmetric.
 */
const HIGHER_BETTER_SUBSCORE = { low: 20, medium: 60, high: 100 } as const
const LOWER_BETTER_SUBSCORE = { low: 100, medium: 60, high: 20 } as const

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
/** Delta within ±3 composite points = "steady", per chunk 59 spec. */
export const TREND_FLAT_THRESHOLD = 3
/** Domain gap (lowest vs mean-of-others) that triggers the focus callout. */
export const FOCUS_AREA_GAP_THRESHOLD = 15

// ---------------------------------------------------------------
// Pure formula
// ---------------------------------------------------------------

/**
 * Map a single assessment record to a 0-100 subscore under this
 * module's direction-normalized scheme. Returns undefined for
 * unknown instruments (no ASSESSMENT_BANDS entry), missing scores,
 * or non-finite raw values. Callers should skip undefined results.
 */
export function subscoreFromRecord(record: RecordSnapshot | undefined): number | undefined {
  if (!record) return undefined
  const def = getBandDef(String(record.instrumentId))
  if (!def) return undefined
  // CHUNK 68 (2026-07-23): use extractScoreFromRecord so instruments
  // flagged with `computeFallback: 'sum-responses'` (alcohol-3,
  // loneliness-3 today) recover a total from responses when the BE
  // emits scores:{}. Byte-identical to the previous extractScore path
  // for records that already carry a valid scores.total — the fallback
  // only engages when the primary lookup returns undefined AND the def
  // opts in. See lib/assessment-bands.ts for details.
  const raw = extractScoreFromRecord(def, record)
  const band = computeBand(def, raw)
  if (!band) return undefined
  return def.direction === 'higher-is-better'
    ? HIGHER_BETTER_SUBSCORE[band.level]
    : LOWER_BETTER_SUBSCORE[band.level]
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sum = values.reduce((a, b) => a + b, 0)
  return sum / values.length
}

/**
 * Build a composite result from a per-instrument record picker.
 * Used twice by the card:
 *   1. picker = "most recent record"          → current composite
 *   2. picker = "record ≥7d older than curr"  → prior composite
 * Kept as a picker rather than a map so callers can implement
 * their own "current vs prior" semantics without this module
 * imposing them.
 */
export function buildComposite(
  pickRecord: (instrumentId: InstrumentId) => RecordSnapshot | undefined,
): CompositeResult {
  const domains: DomainAggregate[] = DOMAIN_ORDER.map((domain) => {
    const subs = DOMAIN_MEMBERS[domain]
      .map((id) => subscoreFromRecord(pickRecord(id)))
      .filter((v): v is number => typeof v === 'number')
    return {
      domain,
      score: mean(subs),
      contributors: subs.length,
    }
  })
  // Chunk 62 (Ken 2026-07-22 dogfood): composite denominator is ALWAYS
  // DOMAIN_ORDER.length (3), not just the count of scored domains.
  // Missing domains contribute 0 to the numerator. Ken saw a score
  // that felt inflated because the earlier mean-of-scored formula
  // divided by 2 when SOCIAL had no signal — "calculated by 200
  // when it should be by 300". The new formula honestly reflects
  // that missing data reduces overall wellbeing rather than being
  // invisible.
  //
  // Composite is undefined only when NO domain has any signal at all
  // (patient has zero completed assessments) — that stays a card
  // "empty" state, not a score of 0.
  const scoredCount = domains.filter((d) => typeof d.score === 'number').length
  let composite: number | undefined
  if (scoredCount > 0) {
    const sum = domains.reduce((acc, d) => acc + (typeof d.score === 'number' ? d.score : 0), 0)
    composite = sum / DOMAIN_ORDER.length
  }
  return {
    // Composite is NOT rounded here — the card rounds for display so
    // debug/test callers see the raw mean.
    composite,
    domains,
  }
}

/**
 * Compare two composite values and produce the trend arrow + delta.
 * Both inputs should be integers (round before passing) so the delta
 * matches the number the card renders.
 */
export function computeCompositeTrend(
  currComposite: number | undefined,
  priorComposite: number | undefined,
): TrendResult | undefined {
  if (typeof currComposite !== 'number' || !Number.isFinite(currComposite)) return undefined
  if (typeof priorComposite !== 'number' || !Number.isFinite(priorComposite)) return undefined
  const delta = currComposite - priorComposite
  if (Math.abs(delta) <= TREND_FLAT_THRESHOLD) return { arrow: 'flat', delta }
  return { arrow: delta > 0 ? 'up' : 'down', delta }
}

/**
 * Identify the domain that should be surfaced in the focus callout,
 * or undefined if no domain trails the others enough to justify it.
 *
 * Rule (per chunk 59 spec):
 *   - Requires ≥2 domains with a numeric score (can't compare
 *     "lowest vs the others" when only one domain exists).
 *   - Callout fires when (mean of others − lowest) ≥ 15 pts.
 *   - Ties: the FIRST domain in DOMAIN_ORDER wins the "lowest" slot
 *     (deterministic — no flicker between renders).
 */
/**
 * Chunk 59 adversarial-verify fix (major #4): min-contributors gate.
 * A single 2-item PHQ-2 in the MIND slot can otherwise make MIND the
 * "worst" domain by 80 points against a BIO with 2 low-risk screens,
 * triggering a "your mental health needs focus" callout on n=1 signal.
 * Require the worst domain to have >= FOCUS_AREA_MIN_CONTRIBUTORS
 * assessments backing it so the callout only fires when there is real
 * multi-signal weight behind the claim.
 */
export const FOCUS_AREA_MIN_CONTRIBUTORS = 2
export function computeFocus(domains: DomainAggregate[]): BpsDomain | undefined {
  const scored = domains.filter(
    (d): d is DomainAggregate & { score: number } => typeof d.score === 'number',
  )
  if (scored.length < 2) return undefined
  const worst = scored.reduce((a, b) => (a.score <= b.score ? a : b))
  if (worst.contributors < FOCUS_AREA_MIN_CONTRIBUTORS) return undefined
  const others = scored.filter((d) => d.domain !== worst.domain)
  const othersMean = mean(others.map((d) => d.score))
  if (typeof othersMean !== 'number') return undefined
  if (othersMean - worst.score < FOCUS_AREA_GAP_THRESHOLD) return undefined
  return worst.domain
}

// ---------------------------------------------------------------
// Record-selection helpers — pure, no I/O.
// ---------------------------------------------------------------

/**
 * Return the newest record for each instrument from a per-instrument
 * history map. Defensively re-sorts every array newest-first — never
 * trusts API ordering (matches chunk 58 SelfAssessmentTrends discipline
 * so the wellbeing card and the trends carousel never disagree on
 * which record is "current").
 */
export function selectCurrentRecords(
  historyById: Map<string, RecordSnapshot[]>,
): Map<string, RecordSnapshot | undefined> {
  const out = new Map<string, RecordSnapshot | undefined>()
  historyById.forEach((records, key) => {
    const sorted = [...records]
      .filter((r) => !!r?.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    out.set(key, sorted[0])
  })
  return out
}

/**
 * For each instrument that has a current record, pick the nearest
 * earlier record whose completedAt ≤ (current.completedAt − 7 days).
 * Instruments with only one record ever (or no record ≥7d older)
 * contribute no prior — but the other instruments' priors still
 * populate the composite. Returns undefined per-instrument in that
 * case; buildComposite() handles the "no prior" fall-through.
 */
export function selectPriorRecords(
  historyById: Map<string, RecordSnapshot[]>,
  currentById: Map<string, RecordSnapshot | undefined>,
): Map<string, RecordSnapshot | undefined> {
  const out = new Map<string, RecordSnapshot | undefined>()
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
    // Newest-first walk: the first record whose completedAt ≤ cutoff
    // is the closest one to the 7d boundary that still satisfies it.
    const sorted = [...hist]
      .filter((r) => !!r?.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    let picked: RecordSnapshot | undefined
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

// ---------------------------------------------------------------
// Top-level orchestrator — one call to derive everything the card
// needs. Kept pure for testability; the card handles the React
// Query wiring + summary/history merge above this.
// ---------------------------------------------------------------

export interface WellbeingDerivation {
  /** Integer composite 0-100, or undefined if no domain contributed. */
  composite: number | undefined
  /** Per-domain aggregates (unrounded — caller rounds for display). */
  domains: DomainAggregate[]
  /** Trend vs 7d prior composite (undefined if no prior available). */
  trend: TrendResult | undefined
  /** Focus-area domain, or undefined if no callout is warranted. */
  focus: BpsDomain | undefined
}

/**
 * Given per-instrument history maps, derive everything the wellbeing
 * card renders. The caller is responsible for building `historyById`
 * from whatever data sources it has (summary + per-instrument
 * history queries + defensive merge).
 *
 * Chunk 59 adversarial-verify fix (majors #2 + #5 — asymmetric mix):
 * the displayed composite (big number) still uses ALL current records
 * so the score reflects the patient's full self-report picture. But
 * the trend arrow uses ONLY the instrument INTERSECTION — instruments
 * where BOTH a current AND a >=7d prior record exist. Otherwise a
 * patient completing GAD-7 this week and PHQ-2 eight days ago would
 * see a "trend" that's really an instrument-mix delta, not a health
 * delta. Trend is intentionally undefined until >= TREND_MIN_COHORT_SIZE
 * instruments have both endpoints; the card renders no arrow in that
 * case (silent, not a placeholder string).
 */
export function deriveWellbeing(
  historyById: Map<string, RecordSnapshot[]>,
): WellbeingDerivation {
  const currentById = selectCurrentRecords(historyById)
  const priorById = selectPriorRecords(historyById, currentById)

  const currentComposite = buildComposite((id) => currentById.get(String(id)))
  const compositeInt =
    typeof currentComposite.composite === 'number' ? Math.round(currentComposite.composite) : undefined

  // Instrument intersection: only instruments with BOTH a current AND
  // a >=7d prior record contribute to the trend comparison. Same-set
  // guarantee = trend measures actual health change, not mix change.
  // Min cohort size = 2 so a single instrument's band jump can't
  // unilaterally label the whole wellbeing score "Improving" or
  // "Worsening" (chunk 59 v2 verify nit — the arrow needs more than
  // one signal to be a meaningful summary trend).
  const trendCohort = new Set<string>()
  currentById.forEach((curr, key) => {
    if (curr && priorById.get(key)) trendCohort.add(key)
  })
  const TREND_MIN_COHORT_SIZE = 2
  let trend: TrendResult | undefined
  if (trendCohort.size >= TREND_MIN_COHORT_SIZE) {
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
    trend = computeCompositeTrend(trendCurrInt, trendPriorInt)
  }

  return {
    composite: compositeInt,
    domains: currentComposite.domains,
    trend,
    focus: computeFocus(currentComposite.domains),
  }
}
