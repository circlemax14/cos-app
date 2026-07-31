/**
 * lib/readiness-score.ts — SCRUM-638 (Bevel-inspired Daily Readiness)
 *
 * Pure scoring module for the composite Readiness/Recovery score. Inputs
 * are HealthKit samples the app already ingests via react-native-health:
 * HeartRateVariability (SDNN, ms), SleepAnalysis (hours in-bed),
 * RestingHeartRate (bpm), RespiratoryRate (breaths/min). The score is
 * how today's values compare to the patient's OWN rolling 14-day
 * baseline — not to a population norm.
 *
 * WHY PURE (extracted from any UI):
 *   1. Testability — every function here is deterministic, no React,
 *      no I/O. Snapshot the formula in isolation.
 *   2. Isolation from HealthKit read layer — the derivation hook is a
 *      thin adapter that feeds these arrays; if we ever move to a BE-
 *      computed score we swap the adapter and this module doesn't move.
 *   3. Regression-safe iteration — the moment we tune weights or add a
 *      metric (sleep-efficiency, HRV recovery slope), edits happen here
 *      and every consumer picks them up.
 *
 * SCOPE (v1):
 *   - Composite ∈ [0, 100]. Higher = more recovered.
 *   - Contributions: HRV (35%, higher-better), sleep hours (30%,
 *     ~7-9h optimal), resting HR (25%, lower-better), resp rate
 *     (10%, ~12-16 bpm optimal). Weights sum to 1.0.
 *   - Baseline: last 14 completed days (excluding today). Requires
 *     ≥7 days for ANY score; ≥14 days for a "confident" score.
 *   - Each metric normalized as z-score against baseline, clamped to
 *     [-2, +2] SD, then mapped 0→100 with 50 = baseline mean. Missing
 *     metric drops its weight (composite renormalizes over the
 *     available metrics).
 *   - Band mapping: >=80 optimal / >=60 developing / >=40 foundational
 *     / <40 initial (mirrors ScoreBands tokens the app already ships).
 *
 * WHAT THIS IS NOT:
 *   - Not a clinical score. Bevel's marketing framing (kept in the
 *     ticket) is "one honest daily read" — that's the intent here.
 *   - Not a substitute for wellbeing-score.ts (BPS composite from
 *     self-assessments); they answer different questions.
 */

/**
 * A single day's HealthKit summary. All fields optional — missing =
 * we didn't get a reading (asleep with watch off charger, permission
 * revoked, empty device). Every field has its own scoring branch that
 * handles undefined gracefully.
 */
export interface DailyReadinessMetrics {
  /** Local date this summary belongs to, YYYY-MM-DD. */
  date: string
  /** Heart-rate variability (SDNN), milliseconds. Higher = better. */
  hrvMs?: number
  /** Total sleep hours (in-bed → asleep). Optimal ~7-9h. */
  sleepHours?: number
  /** Resting heart rate, bpm. Lower = better within personal range. */
  restingHrBpm?: number
  /** Respiratory rate at rest, breaths per minute. Optimal ~12-16. */
  respRateBpm?: number
}

/**
 * Band names mirror the ScoreBands token set the app already ships
 * (constants/design-system). Kept as string literals here so this file
 * has zero runtime deps on the RN token module.
 */
export type ReadinessBand = 'optimal' | 'developing' | 'foundational' | 'initial'

export interface ReadinessDriver {
  /** Which input contributed. */
  metric: 'hrv' | 'sleep' | 'restingHr' | 'respRate'
  /** Metric's individual 0-100 subscore (rounded). */
  subscore: number
  /** Directional narrative — 'above'/'below'/'at' baseline. */
  direction: 'above' | 'below' | 'at'
  /** Delta magnitude vs baseline mean, in the metric's native units.
   *  Rounded to 1 decimal for display. */
  delta: number
}

export interface ReadinessScore {
  /** Composite 0-100, rounded. Undefined if no metrics could contribute. */
  composite: number | undefined
  /** Band label for the composite. Undefined when composite is. */
  band: ReadinessBand | undefined
  /** Baseline confidence — how many days of history fed the baseline.
   *  Callers can gate "confident" affordances on `>= 14`. */
  baselineDays: number
  /** State machine for the UI: `pre-baseline` = show set-up card
   *  (< 7 days), `warming-up` = show score with caveat (7-13 days),
   *  `ready` = show score confidently (>= 14 days), `no-data` = show
   *  empty card (baseline empty + today empty). */
  state: 'pre-baseline' | 'warming-up' | 'ready' | 'no-data'
  /** Per-metric contributions in the order HRV/sleep/HR/resp — filtered
   *  to metrics that actually produced a subscore. */
  drivers: ReadinessDriver[]
}

// ---------------------------------------------------------------
// Weights + tuning constants
// ---------------------------------------------------------------

const WEIGHTS = {
  hrv: 0.35,
  sleep: 0.3,
  restingHr: 0.25,
  respRate: 0.1,
} as const

/** Minimum days of baseline before we show a score at all. */
export const MIN_BASELINE_DAYS = 7
/** Days at which the score is considered fully confident. */
export const CONFIDENT_BASELINE_DAYS = 14
/** Z-score clamp — beyond ±2 SD we cap the subscore at 0 or 100. */
const Z_CLAMP = 2

// ---------------------------------------------------------------
// Baseline statistics
// ---------------------------------------------------------------

interface Stats {
  mean: number
  stdDev: number
  count: number
}

function computeStats(values: readonly number[]): Stats | undefined {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (finite.length === 0) return undefined
  const mean = finite.reduce((acc, v) => acc + v, 0) / finite.length
  const variance = finite.reduce((acc, v) => acc + (v - mean) ** 2, 0) / finite.length
  const stdDev = Math.sqrt(variance)
  return { mean, stdDev, count: finite.length }
}

// ---------------------------------------------------------------
// Per-metric scoring
// ---------------------------------------------------------------

/**
 * Map a z-score onto 0-100 with the given directional preference.
 * `higherIsBetter=true` → +z is better (HRV). `false` → -z is better
 * (resting HR). Center of scale (50) = baseline mean.
 */
function zScoreToSubscore(z: number, higherIsBetter: boolean): number {
  const clamped = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z))
  const directional = higherIsBetter ? clamped : -clamped
  // Map [-Z_CLAMP..+Z_CLAMP] → [0..100] with 0 at -Z_CLAMP, 100 at +Z_CLAMP.
  return Math.round(50 + (directional / Z_CLAMP) * 50)
}

/**
 * Sleep + resp-rate are U-shaped (too little AND too much is bad). We
 * translate to a positive-deviation z-score using an OPTIMAL target
 * instead of the baseline mean, so oversleeping on a rest day scores
 * closer to optimal than the baseline (which could be undersleep-heavy).
 */
function optimalRangeSubscore(value: number, optimalMin: number, optimalMax: number, hardMin: number, hardMax: number): number {
  if (value >= optimalMin && value <= optimalMax) return 100
  if (value <= hardMin || value >= hardMax) return 0
  const range = value < optimalMin ? optimalMin - hardMin : hardMax - optimalMax
  const distance = value < optimalMin ? optimalMin - value : value - optimalMax
  return Math.round(100 - (distance / range) * 100)
}

const SLEEP_OPTIMAL_MIN = 7
const SLEEP_OPTIMAL_MAX = 9
const SLEEP_HARD_MIN = 3
const SLEEP_HARD_MAX = 12

const RESP_RATE_OPTIMAL_MIN = 12
const RESP_RATE_OPTIMAL_MAX = 16
const RESP_RATE_HARD_MIN = 8
const RESP_RATE_HARD_MAX = 25

function driverFor(
  metric: ReadinessDriver['metric'],
  todayValue: number,
  baselineMean: number,
  subscore: number,
): ReadinessDriver {
  const delta = Math.round((todayValue - baselineMean) * 10) / 10
  const direction: ReadinessDriver['direction'] =
    Math.abs(delta) < 0.1 ? 'at' : delta > 0 ? 'above' : 'below'
  return { metric, subscore, direction, delta }
}

// ---------------------------------------------------------------
// Band mapping (mirrors ScoreBands token thresholds)
// ---------------------------------------------------------------

export function scoreToReadinessBand(score: number | undefined): ReadinessBand | undefined {
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined
  if (score >= 80) return 'optimal'
  if (score >= 60) return 'developing'
  if (score >= 40) return 'foundational'
  return 'initial'
}

// ---------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------

/**
 * Compute today's readiness score from today's HealthKit sample + a
 * rolling baseline window.
 *
 * @param today Today's metrics (may have any/all fields missing).
 * @param baseline Array of the last N daily summaries EXCLUDING today.
 *   Ideally 14 days; less is handled per the state machine.
 */
export function computeReadinessScore(
  today: DailyReadinessMetrics | undefined,
  baseline: readonly DailyReadinessMetrics[],
): ReadinessScore {
  const baselineDays = baseline.length

  // Not enough history to compute anything meaningful.
  if (baselineDays < MIN_BASELINE_DAYS) {
    return {
      composite: undefined,
      band: undefined,
      baselineDays,
      state: baselineDays === 0 && !hasAnyMetric(today) ? 'no-data' : 'pre-baseline',
      drivers: [],
    }
  }

  // Baseline stats per metric (skip metrics with no readings across all baseline days).
  const hrvStats = computeStats(baseline.map((d) => d.hrvMs).filter((v): v is number => v !== undefined))
  const sleepStats = computeStats(baseline.map((d) => d.sleepHours).filter((v): v is number => v !== undefined))
  const hrStats = computeStats(baseline.map((d) => d.restingHrBpm).filter((v): v is number => v !== undefined))
  const respStats = computeStats(baseline.map((d) => d.respRateBpm).filter((v): v is number => v !== undefined))

  if (!today || !hasAnyMetric(today)) {
    // Baseline exists but today's device didn't ingest — return null
    // score. Callers show an empty-state card.
    return {
      composite: undefined,
      band: undefined,
      baselineDays,
      state: 'no-data',
      drivers: [],
    }
  }

  const drivers: ReadinessDriver[] = []
  let totalWeight = 0
  let weightedSum = 0

  if (typeof today.hrvMs === 'number' && hrvStats && hrvStats.stdDev > 0) {
    const z = (today.hrvMs - hrvStats.mean) / hrvStats.stdDev
    const subscore = zScoreToSubscore(z, /* higherIsBetter */ true)
    drivers.push(driverFor('hrv', today.hrvMs, hrvStats.mean, subscore))
    weightedSum += subscore * WEIGHTS.hrv
    totalWeight += WEIGHTS.hrv
  }

  if (typeof today.sleepHours === 'number') {
    // Sleep uses the optimal-range scorer, not z-score, so it works
    // even when the baseline is chronically undersleeping.
    const subscore = optimalRangeSubscore(
      today.sleepHours,
      SLEEP_OPTIMAL_MIN,
      SLEEP_OPTIMAL_MAX,
      SLEEP_HARD_MIN,
      SLEEP_HARD_MAX,
    )
    const baselineMean = sleepStats?.mean ?? SLEEP_OPTIMAL_MIN
    drivers.push(driverFor('sleep', today.sleepHours, baselineMean, subscore))
    weightedSum += subscore * WEIGHTS.sleep
    totalWeight += WEIGHTS.sleep
  }

  if (typeof today.restingHrBpm === 'number' && hrStats && hrStats.stdDev > 0) {
    const z = (today.restingHrBpm - hrStats.mean) / hrStats.stdDev
    const subscore = zScoreToSubscore(z, /* higherIsBetter */ false)
    drivers.push(driverFor('restingHr', today.restingHrBpm, hrStats.mean, subscore))
    weightedSum += subscore * WEIGHTS.restingHr
    totalWeight += WEIGHTS.restingHr
  }

  if (typeof today.respRateBpm === 'number') {
    const subscore = optimalRangeSubscore(
      today.respRateBpm,
      RESP_RATE_OPTIMAL_MIN,
      RESP_RATE_OPTIMAL_MAX,
      RESP_RATE_HARD_MIN,
      RESP_RATE_HARD_MAX,
    )
    const baselineMean = respStats?.mean ?? RESP_RATE_OPTIMAL_MIN
    drivers.push(driverFor('respRate', today.respRateBpm, baselineMean, subscore))
    weightedSum += subscore * WEIGHTS.respRate
    totalWeight += WEIGHTS.respRate
  }

  if (totalWeight === 0) {
    // Today's metrics all had no matching baseline — first-day ingestion
    // for every metric. Show pre-baseline state.
    return {
      composite: undefined,
      band: undefined,
      baselineDays,
      state: 'pre-baseline',
      drivers: [],
    }
  }

  const composite = Math.round(weightedSum / totalWeight)
  return {
    composite,
    band: scoreToReadinessBand(composite),
    baselineDays,
    state: baselineDays >= CONFIDENT_BASELINE_DAYS ? 'ready' : 'warming-up',
    drivers,
  }
}

function hasAnyMetric(m: DailyReadinessMetrics | undefined): boolean {
  if (!m) return false
  return (
    typeof m.hrvMs === 'number' ||
    typeof m.sleepHours === 'number' ||
    typeof m.restingHrBpm === 'number' ||
    typeof m.respRateBpm === 'number'
  )
}

// ---------------------------------------------------------------
// Exported for tests only.
// ---------------------------------------------------------------

export const __test__ = {
  computeStats,
  zScoreToSubscore,
  optimalRangeSubscore,
  WEIGHTS,
}
