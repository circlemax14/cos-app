/**
 * Chunk 58 (2026-07-22, Ken dogfood ask):
 * Patient-facing translation of raw assessment scores into meaningful
 * High / Medium / Low bands with a direction-of-goodness so colors and
 * trend arrows read the same way regardless of whether the underlying
 * instrument is scored higher-is-better (function, wellbeing) or
 * lower-is-better (pain, mood, risk).
 *
 * Ken transcript quotes that shaped this file:
 *  - "the names should be meaningful" (patient-friendly humanLabel)
 *  - "I would just have high, medium, low" (three-band collapse)
 *  - "we can put nutrition risk there" (unitSuffix like 'risk', 'function')
 *  - "high-functioning or low-functioning" (direction-of-goodness)
 *
 * Cutoffs are collapsed from published clinical scoring where possible;
 * each entry documents its source. Where the scale metadata is ambiguous
 * (e.g. PROMIS T-score vs raw sum, custom agency instruments) the entry
 * is intentionally omitted so the UI falls back to a neutral "—" pill.
 * We would rather show no band than a wrong one.
 *
 * Consumed by components/health-plan/SelfAssessmentTrends.tsx behind the
 * SELF_ASSESSMENTS_HUMAN_LABELS_ENABLED kill-switch (this OTA can be
 * reverted by flipping that flag false without a binary cut).
 */

export type Direction = 'higher-is-better' | 'lower-is-better'
export type BandLevel = 'low' | 'medium' | 'high'
export type BandTone = 'good' | 'warn' | 'bad' | 'neutral'
export type TrendDirection = 'up' | 'down' | 'flat'

export interface AssessmentBandDef {
  /** Patient-friendly title shown as the small-caps card header. */
  humanLabel: string
  /** Whether a higher raw score means better or worse patient state. */
  direction: Direction
  /**
   * Suffix appended to the band level to form the pill label, e.g.
   * unitSuffix='pain' -> "Low pain" / "High pain".
   * Ken specifically wanted "risk" for nutrition/falls and
   * "function" for ADLs / physical function.
   * Omit to render just "Low" / "Moderate" / "High".
   */
  unitSuffix?: string
  /**
   * Where to read the numeric score from AssessmentRecord.scores.
   * Defaults to 'total'. ADL/IADL use 'independent' historically.
   */
  scoreField?: 'total' | 'independent'
  /**
   * CHUNK 68 (2026-07-23) — defensive client-side recompute fallback.
   *
   * Some records land with `scores: {}` even though completedAt is set
   * and responses are populated — the backend legacy `computeScores`
   * switch (cos-backend/src/services/assessments.service.ts:236-250)
   * has no case for alcohol-3 or loneliness-3, so when
   * `getActive(instrumentId)` returns null it falls through to
   * `scoreFreeform()` and writes `{}`. Ken's gvtechsolutions21@gmail.com
   * account exhibited this on 2026-07-23: both AUDIT-C and UCLA-3
   * records had completedAt set but no total, so subscoreFromRecord()
   * silently dropped them and the SOCIAL & FAITH pill reported 0
   * contributors.
   *
   * `computeFallback: 'sum-responses'` opts the instrument into a
   * client-side recompute: extractScoreFromRecord() first tries
   * scores.total (byte-identical happy path), and only if undefined
   * sums the finite numeric response values. Flip this ONLY for
   * instruments whose `kind: 'sum'` contract is verified in the BE
   * instrument definition AND whose responses are raw numeric option
   * values (assessment-stepper.tsx writes opt.value into
   * answers[item.id]). Do NOT blanket-apply — a future instrument
   * that stores structured response objects would silently under-count.
   *
   * The BE-side fix (missing switch cases + one-shot backfill for
   * historical scores:{} rows) is filed as a parallel follow-up; this
   * flag is defensive scaffolding that should be revisited for removal
   * once the BE backfill lands in prod.
   */
  computeFallback?: 'sum-responses'
  /** score <= lowMax  => level 'low'  (Ken cutoff line #1) */
  lowMax: number
  /** score <= mediumMax => level 'medium'; else 'high' */
  mediumMax: number
  /** Human-readable clinical citation for the cutoffs above. */
  source: string
}

/**
 * Central table. Key = instrumentId used in AssessmentRecord.instrumentId.
 * Every instrument SelfAssessmentTrends currently renders (see
 * FRIENDLY_NAME in that file) has an entry here, plus a handful of
 * near-future ones so chunk 57 (BPS plan) benefits automatically.
 *
 * Instruments NOT in this table (legacy 'lifestyle', 'goals', bare
 * 'wellbeing' | 'sleep' | 'pain' aliases, free-form agency instruments,
 * 'full-intake', 'moca-xpresso') intentionally fall through to the
 * neutral "—" band — safer than guessing on an unknown scale.
 */
export const ASSESSMENT_BANDS: Record<string, AssessmentBandDef> = {
  // Mood / mental health — lower raw = better. Every entry carries a
  // unitSuffix so the pill NEVER reads a bare "Low"/"High" that could
  // invert against the human label (e.g. green "Low" pill under "Mood"
  // reads as "low mood" = depressed — wrong). Chunk 58 adversarial
  // verify caught that on Mood/Sleep; extended to every entry for
  // uniform patient-readable copy.
  'phq-2': {
    humanLabel: 'Mood',
    direction: 'lower-is-better',
    unitSuffix: 'concern',
    // PHQ-2 is a 2-item screen (0-6). >=3 = positive screen for
    // depression. Collapsed to three tiers keeping >=3 as red.
    lowMax: 2,
    mediumMax: 4,
    source: 'PHQ-2: 0-6, >=3 positive screen (Kroenke 2003)',
  },
  'phq-9': {
    humanLabel: 'Depression',
    direction: 'lower-is-better',
    unitSuffix: 'severity',
    // Standard PHQ-9 severity bands: 0-4 none, 5-9 mild, 10-14 mod,
    // 15-19 mod-sev, 20-27 severe. Collapsed: low<=4, med<=14, high>=15.
    lowMax: 4,
    mediumMax: 14,
    source: 'PHQ-9: 0-4/5-9/10-14/15-19/20-27 (Kroenke 2001)',
  },
  'gad-7': {
    humanLabel: 'Anxiety',
    direction: 'lower-is-better',
    unitSuffix: 'severity',
    // GAD-7: 0-4 min, 5-9 mild, 10-14 mod, 15-21 severe.
    lowMax: 4,
    mediumMax: 9,
    source: 'GAD-7: 0-4/5-9/10-14/15-21 (Spitzer 2006)',
  },
  'pss-4': {
    humanLabel: 'Stress',
    direction: 'lower-is-better',
    unitSuffix: 'stress',
    // PSS-4: 0-16 range; no universal cutoff. Common lay tertile
    // split at ~5 and ~10.
    lowMax: 5,
    mediumMax: 10,
    source: 'PSS-4: 0-16, tertile split (Cohen 1988, informal)',
  },
  //
  // PROMIS pain-4 / sleep-4 / physical-function-4 INTENTIONALLY OMITTED
  // from ASSESSMENT_BANDS pending a verified backend score contract.
  // The T-score conversion (mean 50, SD 10) and raw-sum (4-20) are two
  // DIFFERENT scales; picking the wrong one produces confidently-wrong
  // patient-facing pills. Until we verify which one the backend emits
  // per instrument, these fall through to the neutral "—" pill.
  // Verify + reland the entries once the contract is confirmed (chunk 58
  // adversarial-verify blocker fix).
  //

  // Wellbeing / positive-worded — HIGHER raw = better
  'wellbeing-5': {
    humanLabel: 'Wellbeing',
    direction: 'higher-is-better',
    unitSuffix: 'wellbeing',
    // WHO-5: raw 0-25. Multiply by 4 for 0-100 percentage. <50/100
    // (i.e. raw <=12) suggests poor wellbeing; 13-18 moderate; 19-25 good.
    lowMax: 12,
    mediumMax: 18,
    source: 'WHO-5 raw 0-25 (Topp 2015), <50%=poor',
  },

  // Risk-scale — lower raw = better; explicit "risk" suffix per Ken
  'alcohol-3': {
    humanLabel: 'Alcohol use',
    direction: 'lower-is-better',
    unitSuffix: 'risk',
    // AUDIT-C: 0-12. Positive screen >=3 (women) or >=4 (men).
    // Pick a single conservative >=4 for high band.
    lowMax: 2,
    mediumMax: 3,
    source: 'AUDIT-C: 0-12, >=4 positive (Bush 1998)',
    // CHUNK 68: BE kind:'sum' contract confirmed in system-instruments.ts
    // (q1..q3 numeric options 0-4). Responses are raw numeric values from
    // assessment-stepper.tsx (opt.value → answers[item.id]). Ken's
    // 2026-07-23 report exhibited scores:{} with populated responses.
    computeFallback: 'sum-responses',
  },
  'loneliness-3': {
    humanLabel: 'Loneliness',
    direction: 'lower-is-better',
    unitSuffix: 'risk',
    // UCLA 3-item loneliness scale: 3-9. >=6 typically = lonely.
    lowMax: 4,
    mediumMax: 5,
    source: 'UCLA-3: 3-9, >=6 lonely (Hughes 2004)',
    // CHUNK 68: BE kind:'sum' contract confirmed in system-instruments.ts
    // (q1..q3 numeric options 1-3). Responses are raw numeric values from
    // assessment-stepper.tsx. Ken's 2026-07-23 report exhibited scores:{}
    // with populated responses.
    computeFallback: 'sum-responses',
  },
  'falls-12': {
    humanLabel: 'Falls risk',
    direction: 'lower-is-better',
    unitSuffix: 'risk',
    // CDC STEADI 12-item Stay Independent screen. >=4 = at risk.
    // Collapse: low 0-3, medium 4-7, high 8-12.
    lowMax: 3,
    mediumMax: 7,
    source: 'STEADI Stay Independent: 0-12, >=4 at risk (CDC)',
  },
  'nutrition-5': {
    humanLabel: 'Nutrition',
    // 2026-07-29 direction fix: the BE seed for nutrition-5 is MNA-SF
    // style — each of the 5 items scores 0-2 with the WORST answer
    // scoring 0 ("much less" intake, ">3kg unintentional loss", "bed-
    // bound", significant stress, significant memory/mood concerns).
    // Total range 0-10, and the BE riskBands mark 0-3 as high-severity
    // "malnutrition-risk" / 8-10 as low-severity "normal". Higher raw =
    // less malnutrition risk = better patient state. The previous entry
    // flipped this and used lowMax=2/mediumMax=5 with `risk` suffix +
    // lower-is-better direction, which meant a patient scoring 10/10
    // ("normal" per BE) landed in the FE's 'high' band and, under
    // wellbeing-score.ts LOWER_BETTER_SUBSCORE, contributed 20/100 to
    // BIO — silently inverting the composite for well-nourished
    // patients. Corrected here to match the BE contract exactly.
    direction: 'higher-is-better',
    unitSuffix: 'nutrition',
    // Bands per MNA-SF norms mirrored 1:1 from the BE seed
    // (cos-backend/src/data/system-instruments.ts riskBands for
    // instrumentId 'nutrition-5'):
    //   0-3   malnutrition-risk (high severity — 'low' band here)
    //   4-7   at-risk           (moderate      — 'medium' band here)
    //   8-10  normal            (low severity  — 'high' band here)
    lowMax: 3,
    mediumMax: 7,
    source: 'MNA-SF-style 5-item: 0-10, 0-3 malnutrition-risk, 4-7 at-risk, 8-10 normal (BE seed system-instruments.ts)',
  },
  'cognition-8': {
    humanLabel: 'Cognitive change',
    direction: 'lower-is-better',
    unitSuffix: 'concern',
    // AD8: 0-8. >=2 = cognitive impairment concern.
    lowMax: 1,
    mediumMax: 3,
    source: 'AD8: 0-8, >=2 concern (Galvin 2005)',
  },

  // Function — HIGHER raw = better; "function" suffix per Ken
  'adl': {
    humanLabel: 'Daily living',
    direction: 'higher-is-better',
    unitSuffix: 'function',
    scoreField: 'independent',
    // Katz ADL: 0-6 independent activities. 5-6 = independent, 3-4 =
    // moderate impairment, 0-2 = severe.
    lowMax: 2,
    mediumMax: 4,
    source: 'Katz ADL: 0-6 (Katz 1963)',
  },
  'iadl': {
    humanLabel: 'Instrumental daily living',
    direction: 'higher-is-better',
    unitSuffix: 'function',
    scoreField: 'independent',
    // Lawton IADL: 0-8. 7-8 = independent, 4-6 moderate, 0-3 severe.
    lowMax: 3,
    mediumMax: 6,
    source: 'Lawton IADL: 0-8 (Lawton 1969)',
  },

  // Cognition screens — HIGHER = better. Using unitSuffix 'cognition'
  // instead of 'score' so a colorblind patient reading "Low cognition"
  // still knows what direction is bad without relying on pill color.
  'mini-cog': {
    humanLabel: 'Mini-Cog',
    direction: 'higher-is-better',
    unitSuffix: 'cognition',
    // Mini-Cog: 0-5. <3 = positive screen for cognitive impairment.
    lowMax: 2,
    mediumMax: 3,
    source: 'Mini-Cog: 0-5, <3 positive (Borson 2000)',
  },
  'moca': {
    humanLabel: 'MoCA',
    direction: 'higher-is-better',
    unitSuffix: 'cognition',
    // MoCA: 0-30. >=26 normal, 18-25 mild, 10-17 moderate, <10 severe.
    lowMax: 17,
    mediumMax: 25,
    source: 'MoCA: 0-30, >=26 normal (Nasreddine 2005)',
  },
}

export interface AssessmentBandResult {
  level: BandLevel
  tone: BandTone
  /** Composed pill label, e.g. "Low pain" or "High function". */
  label: string
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Level label for the pill (title-case, "Moderate" for 'medium'). */
function levelWord(level: BandLevel): string {
  if (level === 'medium') return 'Moderate'
  return capitalize(level)
}

/**
 * Return the band definition for an instrumentId, or undefined if we do
 * not have a validated cutoff for it (caller should render a neutral
 * fallback pill rather than a wrong band).
 */
export function getBandDef(instrumentId: string): AssessmentBandDef | undefined {
  return ASSESSMENT_BANDS[instrumentId]
}

/**
 * Compute the High/Medium/Low band for a raw score under a given
 * instrument definition. Returns undefined if the score isn't a finite
 * number; caller should render the neutral fallback in that case.
 */
export function computeBand(
  def: AssessmentBandDef,
  score: number | undefined,
): AssessmentBandResult | undefined {
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined
  let level: BandLevel
  if (score <= def.lowMax) level = 'low'
  else if (score <= def.mediumMax) level = 'medium'
  else level = 'high'

  // Direction-of-goodness -> tone (green/amber/red).
  let tone: BandTone
  if (def.direction === 'higher-is-better') {
    tone = level === 'high' ? 'good' : level === 'medium' ? 'warn' : 'bad'
  } else {
    tone = level === 'low' ? 'good' : level === 'medium' ? 'warn' : 'bad'
  }

  const label = def.unitSuffix ? `${levelWord(level)} ${def.unitSuffix}` : levelWord(level)
  return { level, tone, label }
}

export interface TrendResult {
  direction: TrendDirection
  /** Tone applied to arrow color: goodness improving = 'good', worsening = 'bad'. */
  tone: BandTone
}

/**
 * Compare two scores under one instrument definition and return the
 * trend arrow direction + tone. `curr` is the newest sample, `prev` is
 * the one before it. Flat threshold = 5% of the theoretical high-band
 * ceiling, minimum 1 raw point — small enough that Ken sees movement on
 * short scales like PHQ-2 (0-6), large enough that MoCA (0-30) doesn't
 * declare every 1-point wobble a trend.
 *
 * Returns undefined if either score isn't a finite number.
 */
export function computeTrend(
  def: AssessmentBandDef,
  curr: number | undefined,
  prev: number | undefined,
): TrendResult | undefined {
  if (typeof curr !== 'number' || !Number.isFinite(curr)) return undefined
  if (typeof prev !== 'number' || !Number.isFinite(prev)) return undefined
  const delta = curr - prev
  const range = Math.max(def.mediumMax, 1)
  const flatThreshold = Math.max(1, range * 0.05)
  if (Math.abs(delta) < flatThreshold) return { direction: 'flat', tone: 'neutral' }

  const improving =
    def.direction === 'higher-is-better' ? delta > 0 : delta < 0
  return {
    direction: delta > 0 ? 'up' : 'down',
    tone: improving ? 'good' : 'bad',
  }
}

/**
 * Extract the numeric score from an AssessmentRecord.scores object
 * respecting the def's `scoreField` (ADL/IADL store the meaningful
 * value under 'independent' rather than 'total'). Returns undefined if
 * the requested field isn't a finite number.
 *
 * Chunk 58 adversarial-verify fix: NO silent fallback from
 * `independent` to `total` when scoreField='independent' is specified.
 * The two fields are semantically different metrics on different
 * scales; falling back would mis-band a patient (e.g. showing a green
 * "High function" pill for what is actually a Katz total, not the
 * independent count). Missing data returns undefined so the caller
 * renders a neutral "—" pill.
 */
export function extractScore(
  def: AssessmentBandDef | undefined,
  scores: Record<string, number> | undefined,
): number | undefined {
  if (!scores) return undefined
  const field = def?.scoreField ?? 'total'
  const primary = scores[field]
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary
  return undefined
}

/**
 * CHUNK 68 (2026-07-23) — defensive score extraction from a full
 * AssessmentRecord (or lightweight snapshot). Prefers the canonical
 * `scores[scoreField]` value; only when that is missing AND the def
 * opts in via `computeFallback: 'sum-responses'` does this helper
 * recompute the total by summing finite numeric response values.
 *
 * WHY THIS EXISTS: cos-backend's legacy `computeScores` switch does
 * not carry cases for every sum-scored instrument (alcohol-3 and
 * loneliness-3 fell through to scoreFreeform → {} on Ken's account
 * 2026-07-23). Rather than silently drop those completed records
 * from the wellbeing composite, we recompute client-side from
 * responses — which the stepper stores as raw numeric option values.
 *
 * GUARANTEES:
 *  - Byte-identical to extractScore() on the happy path (scores.total
 *    present) — no double-count, no accidental band shift.
 *  - Returns undefined for instruments without `computeFallback` when
 *    scores are missing (ADL/IADL ratio scoring MUST NOT fall back).
 *  - Returns undefined for empty responses (nothing to sum) so the
 *    caller renders a neutral "—" pill.
 *  - Ignores non-finite / non-numeric response values (string, null,
 *    nested objects) so a future response-shape change surfaces as
 *    "no data" rather than a wrong number.
 *  - Dev-only warn (__DEV__ guard) fires when the fallback engages so
 *    ongoing BE score-shape drift is visible in DEV builds.
 */
export function extractScoreFromRecord(
  def: AssessmentBandDef | undefined,
  record:
    | {
        instrumentId?: unknown
        scores?: Record<string, number>
        responses?: Record<string, unknown>
      }
    | undefined,
): number | undefined {
  if (!record) return undefined
  const primary = extractScore(def, record.scores ?? {})
  if (typeof primary === 'number') return primary
  if (!def || def.computeFallback !== 'sum-responses') return undefined
  const responses = record.responses
  if (!responses || typeof responses !== 'object') return undefined
  let sum = 0
  let count = 0
  for (const key of Object.keys(responses)) {
    const v = (responses as Record<string, unknown>)[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v
      count += 1
    }
  }
  if (count === 0) return undefined
  if (__DEV__) {
    // Signal-to-noise: one warn per fallback fire is fine in DEV but
    // must never reach production RN logs (iOS 26.5 app-debugging
    // playbook: chatty console.warn is a known regression vector).
    // eslint-disable-next-line no-console
    console.warn(
      `[assessment-bands] extractScoreFromRecord: scores.${def.scoreField ?? 'total'} missing for instrumentId=${String(record.instrumentId ?? 'unknown')}; recomputed sum=${sum} from responses`,
    )
  }
  return sum
}
