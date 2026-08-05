/**
 * lib/readiness-score.ts — SCRUM-638 (Bevel-inspired Daily Readiness)
 *
 * Pure scoring module for the composite Readiness/Recovery score.
 *
 * 2026-08-05 (Vishal) — expanded from a fixed 4-metric weighted mean to
 * an ADAPTIVE metric-registry design: any HealthKit type the patient
 * has granted access to and has at least 7 baseline days for
 * contributes to the score. Fewer metrics → still a valid score;
 * more metrics → richer signal. Composite is the equal-weighted mean
 * of contributing subscores (each 0-100).
 *
 * Backward compatible: the DailyReadinessMetrics fields for the
 * original 4 (hrvMs / sleepHours / restingHrBpm / respRateBpm) still
 * work exactly as before. New optional fields are additive.
 *
 * WHY PURE (extracted from any UI):
 *   1. Testability — every function here is deterministic, no React,
 *      no I/O.
 *   2. Isolation from HealthKit read layer — the derivation hook is a
 *      thin adapter that populates whatever fields it can.
 *   3. Regression-safe iteration — adding a metric is one entry in
 *      METRIC_REGISTRY; the scoring loop picks it up.
 *
 * WHAT THIS IS NOT:
 *   - Not a clinical score. Behavioral cue, not diagnostic.
 *   - Not a substitute for wellbeing-score.ts (BPS composite from
 *     self-assessments).
 */

/**
 * A single day's HealthKit summary. All fields optional — missing =
 * no reading (permission not granted, no device sync, etc.). Each
 * field maps to one entry in METRIC_REGISTRY.
 */
export interface DailyReadinessMetrics {
  /** Local date this summary belongs to, YYYY-MM-DD. */
  date: string
  // ── Original 4 (retained for backward compatibility) ──────────────
  /** Heart-rate variability (SDNN), milliseconds. Higher = better. */
  hrvMs?: number
  /** Total sleep hours (in-bed → asleep). Optimal ~7-9h. */
  sleepHours?: number
  /** Resting heart rate, bpm. Lower = better within personal range. */
  restingHrBpm?: number
  /** Respiratory rate at rest, breaths per minute. Optimal ~12-16. */
  respRateBpm?: number
  // ── 2026-08-05 (Vishal) — expanded metric universe ────────────────
  /** Step count for the day. Higher = better (with soft ceiling). */
  stepsCount?: number
  /** Active energy burned, kcal. Higher = better. */
  activeEnergyKcal?: number
  /** Exercise / Move minutes for the day. Higher = better. */
  exerciseMinutes?: number
  /** Walking heart rate average, bpm. Lower = better cardio fitness. */
  walkingHrBpm?: number
  /** Blood oxygen saturation, %. Optimal >=95. */
  spo2Pct?: number
  /** Flights of stairs climbed. Higher = better. */
  flightsClimbed?: number
}

export type ReadinessBand = 'optimal' | 'developing' | 'foundational' | 'initial'

/**
 * Union of every supported metric id. Adding a new registry entry
 * requires extending this + DailyReadinessMetrics + METRIC_REGISTRY.
 */
export type ReadinessMetricId =
  | 'hrv'
  | 'sleep'
  | 'restingHr'
  | 'respRate'
  | 'steps'
  | 'activeEnergy'
  | 'exerciseMin'
  | 'walkingHr'
  | 'spo2'
  | 'flights'

export interface ReadinessDriver {
  /** Which input contributed. */
  metric: ReadinessMetricId
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
  /** Per-metric contributions in registry order — filtered to metrics
   *  that actually produced a subscore. */
  drivers: ReadinessDriver[]
}

// ---------------------------------------------------------------
// Metric registry (single source of truth for scoring)
// ---------------------------------------------------------------

type Direction = 'higher' | 'lower' | 'optimal'

interface MetricSpec {
  /** Which field on DailyReadinessMetrics carries the value. */
  field: keyof DailyReadinessMetrics
  /** Scoring direction. */
  direction: Direction
  /** For 'optimal': acceptable band + hard-fail band. */
  optimalMin?: number
  optimalMax?: number
  hardMin?: number
  hardMax?: number
}

/**
 * Adaptive scoring: every registered metric contributes equally when
 * present. Direction determines how baseline distance maps to
 * subscore:
 *   - higher  → +z is better (HRV, steps, kcal, exercise, SpO2, flights)
 *   - lower   → -z is better (RHR, walking-HR)
 *   - optimal → distance from an OPTIMAL band (sleep, resp rate)
 */
const METRIC_REGISTRY: Record<ReadinessMetricId, MetricSpec> = {
  hrv:          { field: 'hrvMs',            direction: 'higher' },
  sleep:        { field: 'sleepHours',       direction: 'optimal', optimalMin: 7, optimalMax: 9, hardMin: 3, hardMax: 12 },
  restingHr:    { field: 'restingHrBpm',     direction: 'lower' },
  respRate:     { field: 'respRateBpm',      direction: 'optimal', optimalMin: 12, optimalMax: 16, hardMin: 8, hardMax: 25 },
  steps:        { field: 'stepsCount',       direction: 'higher' },
  activeEnergy: { field: 'activeEnergyKcal', direction: 'higher' },
  exerciseMin:  { field: 'exerciseMinutes',  direction: 'higher' },
  walkingHr:    { field: 'walkingHrBpm',     direction: 'lower' },
  spo2:         { field: 'spo2Pct',          direction: 'optimal', optimalMin: 95, optimalMax: 100, hardMin: 88, hardMax: 100 },
  flights:      { field: 'flightsClimbed',   direction: 'higher' },
}

/** Registry order = display order for drivers[]. */
const METRIC_ORDER: readonly ReadinessMetricId[] = [
  'hrv', 'sleep', 'restingHr', 'respRate',
  'steps', 'activeEnergy', 'exerciseMin', 'walkingHr', 'spo2', 'flights',
]

/** Minimum days of baseline before we show a score at all. */
export const MIN_BASELINE_DAYS = 7
/** Days at which the score is considered fully confident. */
export const CONFIDENT_BASELINE_DAYS = 14
/** Minimum metrics that must contribute for a valid score today. */
export const MIN_METRICS_FOR_SCORE = 2
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
  return Math.round(50 + (directional / Z_CLAMP) * 50)
}

/**
 * U-shaped scorer (too little AND too much is bad) around an
 * OPTIMAL band — used for sleep + resp rate + SpO2.
 */
function optimalRangeSubscore(value: number, optimalMin: number, optimalMax: number, hardMin: number, hardMax: number): number {
  if (value >= optimalMin && value <= optimalMax) return 100
  if (value <= hardMin || value >= hardMax) return 0
  const range = value < optimalMin ? optimalMin - hardMin : hardMax - optimalMax
  const distance = value < optimalMin ? optimalMin - value : value - optimalMax
  return Math.round(100 - (distance / range) * 100)
}

function driverFor(
  metric: ReadinessMetricId,
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
// Band mapping
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

function readMetric(m: DailyReadinessMetrics | undefined, id: ReadinessMetricId): number | undefined {
  if (!m) return undefined
  const v = (m as unknown as Record<string, unknown>)[METRIC_REGISTRY[id].field as string]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function hasAnyMetric(m: DailyReadinessMetrics | undefined): boolean {
  if (!m) return false
  return METRIC_ORDER.some((id) => readMetric(m, id) !== undefined)
}

/**
 * Compute today's readiness score. Adaptive — any metric with today's
 * value AND enough baseline days contributes with equal weight.
 * Minimum MIN_METRICS_FOR_SCORE metrics required for a valid composite.
 */
export function computeReadinessScore(
  today: DailyReadinessMetrics | undefined,
  baseline: readonly DailyReadinessMetrics[],
): ReadinessScore {
  const baselineDays = baseline.length

  if (baselineDays < MIN_BASELINE_DAYS) {
    return {
      composite: undefined,
      band: undefined,
      baselineDays,
      state: baselineDays === 0 && !hasAnyMetric(today) ? 'no-data' : 'pre-baseline',
      drivers: [],
    }
  }

  if (!today || !hasAnyMetric(today)) {
    return {
      composite: undefined,
      band: undefined,
      baselineDays,
      state: 'no-data',
      drivers: [],
    }
  }

  const drivers: ReadinessDriver[] = []
  let subscoreSum = 0
  let subscoreCount = 0

  for (const id of METRIC_ORDER) {
    const spec = METRIC_REGISTRY[id]
    const todayVal = readMetric(today, id)
    if (todayVal === undefined) continue

    // Baseline stats for this metric (skip if no baseline readings).
    const baselineValues = baseline
      .map((d) => readMetric(d, id))
      .filter((v): v is number => v !== undefined)
    const stats = computeStats(baselineValues)

    let subscore: number
    let baselineMean: number

    if (spec.direction === 'optimal') {
      // Optimal-range scorer doesn't require any baseline history at
      // all — it grades against a hard-coded acceptable band.
      subscore = optimalRangeSubscore(
        todayVal,
        spec.optimalMin!,
        spec.optimalMax!,
        spec.hardMin!,
        spec.hardMax!,
      )
      baselineMean = stats?.mean ?? spec.optimalMin!
    } else {
      // z-score scorers need stats with non-zero stdDev, otherwise
      // the metric is dropped from this composite.
      if (!stats || stats.stdDev === 0) continue
      const z = (todayVal - stats.mean) / stats.stdDev
      subscore = zScoreToSubscore(z, spec.direction === 'higher')
      baselineMean = stats.mean
    }

    drivers.push(driverFor(id, todayVal, baselineMean, subscore))
    subscoreSum += subscore
    subscoreCount += 1
  }

  if (subscoreCount < MIN_METRICS_FOR_SCORE) {
    // Not enough metrics contributed today (or first-day ingestion
    // for every attempted metric). Show pre-baseline state.
    return {
      composite: undefined,
      band: undefined,
      baselineDays,
      state: 'pre-baseline',
      drivers: [],
    }
  }

  const composite = Math.round(subscoreSum / subscoreCount)
  return {
    composite,
    band: scoreToReadinessBand(composite),
    baselineDays,
    state: baselineDays >= CONFIDENT_BASELINE_DAYS ? 'ready' : 'warming-up',
    drivers,
  }
}

// ---------------------------------------------------------------
// Exported for tests only.
// ---------------------------------------------------------------

export const __test__ = {
  computeStats,
  zScoreToSubscore,
  optimalRangeSubscore,
  METRIC_REGISTRY,
  METRIC_ORDER,
}
