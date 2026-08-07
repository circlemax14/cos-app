/**
 * hooks/use-metric-history.ts
 *
 * Everything the Progress screen needs to turn "tasks that ask the patient
 * to MEASURE something" into per-metric charts:
 *
 *   1. `deriveChartableMetricTypes` — which metrics does this patient's
 *      plan actually ask for? (source of truth: the same
 *      `detectMetricForTask` classifier the RECORD modal uses, so the
 *      chart list can never drift from the capture list)
 *   2. `useMetricHistories` — one windowed history fetch per metric type
 *   3. `METRIC_DISPLAY` + `normaliseForSparkline` — how to squeeze a real
 *      clinical value onto the 0-100 axis that ScoreHistorySparkline wants
 *      WITHOUT ever showing the patient a normalised number
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NORMALISATION EXISTS AT ALL (and why it is dangerous)
 * ─────────────────────────────────────────────────────────────────────
 * `components/home/ScoreHistorySparkline.tsx` is the only chart primitive
 * permitted under the iOS 26.5 envelope (plain Views, no SVG). It maps its
 * input onto bar heights as `value / 100`, i.e. it assumes a 0-100 score.
 * A blood-glucose reading of 118 mg/dL would therefore peg the bar at the
 * ceiling and a weight of 165 lb would too — every series would render as
 * a flat maxed-out block.
 *
 * So we scale each metric onto 0-100 purely for BAR GEOMETRY. That number
 * is a rendering artefact and MUST NEVER be shown to the patient, spoken
 * by VoiceOver, or stored. All patient-facing text renders the REAL value
 * and the REAL unit. The screen additionally prints the chart's range
 * ("Chart range 40–300 mg/dL") so a tall bar is never mistaken for a
 * percentage or a grade.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RANGES, AND WHY EACH ONE
 * ─────────────────────────────────────────────────────────────────────
 * Two strategies, chosen per metric:
 *
 * FIXED — the metric has a clinically meaningful absolute scale that is
 * the same for every patient. A fixed axis means "higher bar = higher
 * reading" is comparable across days AND across patients, and a reading
 * drifting toward the top of the card is genuinely drifting toward the
 * top of the clinical range.
 *
 *   blood_glucose            40–300 mg/dL  severe hypo (<54) through marked
 *                                          hyper; the ADA 70–180 target band
 *                                          lands in the lower-middle third
 *   blood_pressure_systolic  80–200 mmHg   AHA: normal <120, stage-2 ≥140,
 *                                          crisis ≥180 — all on-axis
 *   blood_pressure_diastolic 40–120 mmHg   AHA: normal <80, crisis ≥120
 *   heart_rate               40–140 bpm    trained resting HR through light
 *                                          exertion
 *   oxygen_saturation        85–100 %      EVERY clinically meaningful SpO2
 *                                          change lives in the top 15 points;
 *                                          a 0–100 axis would render 88% and
 *                                          99% as visually identical, which
 *                                          is the exact difference that
 *                                          matters
 *   temperature              95–105 °F     hypothermia threshold through
 *                                          high fever
 *   water_intake             0–100 oz      0 to ~3 L; the common 64 oz/day
 *                                          target sits at ~two-thirds height
 *   sleep_hours              0–12 h        0 through well past the 7–9 h
 *                                          recommendation
 *   pain_level               0–10          the instrument's own scale
 *   mood                     1–10          the instrument's own scale
 *
 * ADAPTIVE — the metric has no universal range; only the patient's own
 * movement is meaningful. A fixed axis would flatten every series.
 *
 *   weight   min span 10 lb    a fixed 20–800 lb axis renders every patient
 *                              as an identical flat line. Adaptive windows
 *                              to the patient's own series, but with a
 *                              10 lb floor on the span so a 0.4 lb daily
 *                              fluctuation is NOT amplified into a dramatic
 *                              staircase. Overstating noise as signal is
 *                              the specific failure mode adaptive scaling
 *                              invites, and the floor is the mitigation.
 *   steps    min span 2000     daily counts differ by an order of magnitude
 *                              between a housebound patient and an active
 *                              one; same floor reasoning
 *
 * Values outside a fixed range are CLAMPED for geometry only — the real
 * number is still printed verbatim, and the screen labels the clamp so a
 * pegged bar is not read as an exact ceiling value.
 */

import * as React from 'react'
import { useQueries } from '@tanstack/react-query'

import {
  fetchMetricHistory,
  type MetricHistory,
  type MetricHistoryPoint,
  type SelfReportedMetricType,
} from '@/services/api/self-reported-metrics'
import { detectMetricForTask } from '@/services/smart-task-detection'
import type { TaskOccurrence } from '@/services/api/types'

/** Default lookback for every chart on the Progress screen. */
export const METRIC_HISTORY_DAYS = 30

/** How a metric's real values map onto the sparkline's 0-100 axis. */
export type MetricScale =
  | { mode: 'fixed'; lo: number; hi: number }
  | { mode: 'adaptive'; minSpan: number }

export interface MetricDisplaySpec {
  /** Patient-facing name. Sentence case — these appear as card titles. */
  label: string
  /** Patient-facing unit, printed next to every real value. */
  unit: string
  /** Decimal places when printing a real value. */
  precision: number
  /** Bar-geometry scaling only. Never rendered as a number. */
  scale: MetricScale
}

/**
 * Display + scaling config per canonical metric type.
 * See the file header for the reasoning behind every range.
 */
export const METRIC_DISPLAY: Record<SelfReportedMetricType, MetricDisplaySpec> = {
  blood_glucose: {
    label: 'Blood glucose',
    unit: 'mg/dL',
    precision: 0,
    scale: { mode: 'fixed', lo: 40, hi: 300 },
  },
  blood_pressure_systolic: {
    label: 'Systolic',
    unit: 'mmHg',
    precision: 0,
    scale: { mode: 'fixed', lo: 80, hi: 200 },
  },
  blood_pressure_diastolic: {
    label: 'Diastolic',
    unit: 'mmHg',
    precision: 0,
    scale: { mode: 'fixed', lo: 40, hi: 120 },
  },
  weight: {
    label: 'Weight',
    unit: 'lb',
    precision: 1,
    scale: { mode: 'adaptive', minSpan: 10 },
  },
  water_intake: {
    label: 'Water intake',
    unit: 'oz',
    precision: 0,
    scale: { mode: 'fixed', lo: 0, hi: 100 },
  },
  temperature: {
    label: 'Temperature',
    unit: '°F',
    precision: 1,
    scale: { mode: 'fixed', lo: 95, hi: 105 },
  },
  heart_rate: {
    label: 'Heart rate',
    unit: 'bpm',
    precision: 0,
    scale: { mode: 'fixed', lo: 40, hi: 140 },
  },
  oxygen_saturation: {
    label: 'Oxygen saturation',
    unit: '%',
    precision: 0,
    scale: { mode: 'fixed', lo: 85, hi: 100 },
  },
  pain_level: {
    label: 'Pain level',
    unit: '/10',
    precision: 0,
    scale: { mode: 'fixed', lo: 0, hi: 10 },
  },
  mood: {
    label: 'Mood',
    unit: '/10',
    precision: 0,
    scale: { mode: 'fixed', lo: 1, hi: 10 },
  },
  sleep_hours: {
    label: 'Sleep',
    unit: 'hours',
    precision: 1,
    scale: { mode: 'adaptive', minSpan: 3 },
  },
  steps: {
    label: 'Steps',
    unit: 'steps',
    precision: 0,
    scale: { mode: 'adaptive', minSpan: 2000 },
  },
}

/**
 * Stable card order. Without this the cards would reshuffle whenever a
 * fetch resolves in a different order — disorienting, and especially bad
 * for a patient re-finding "their" card by position.
 */
const DISPLAY_ORDER: SelfReportedMetricType[] = [
  'blood_pressure_systolic', // BP pair renders as ONE card, keyed on systolic
  'blood_glucose',
  'weight',
  'heart_rate',
  'oxygen_saturation',
  'temperature',
  'sleep_hours',
  'water_intake',
  'steps',
  'pain_level',
  'mood',
]

/** Format a real reading for display. NEVER used for a normalised value. */
export function formatMetricValue(type: SelfReportedMetricType, value: number): string {
  const precision = METRIC_DISPLAY[type]?.precision ?? 0
  if (!Number.isFinite(value)) return '—'
  return precision === 0 ? String(Math.round(value)) : value.toFixed(precision)
}

/**
 * Resolve the concrete lo/hi bounds used for bar geometry.
 * Exported so the screen can print the range as plain text — a patient
 * should be able to see what the bars are measured against.
 */
export function resolveScaleBounds(
  spec: MetricDisplaySpec,
  values: number[],
): { lo: number; hi: number } {
  if (spec.scale.mode === 'fixed') return { lo: spec.scale.lo, hi: spec.scale.hi }

  const clean = values.filter((v) => Number.isFinite(v))
  if (clean.length === 0) return { lo: 0, hi: spec.scale.minSpan }

  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const observed = max - min
  // Span floor: see "ADAPTIVE" in the file header — this is what stops a
  // 0.4 lb fluctuation rendering as a dramatic climb.
  const span = Math.max(observed, spec.scale.minSpan)
  const mid = (min + max) / 2
  return { lo: mid - span / 2, hi: mid + span / 2 }
}

/**
 * Map real readings onto the 0-100 axis ScoreHistorySparkline expects.
 *
 * PURELY GEOMETRY. The output is bar heights, not a score, not a
 * percentage, not a grade. It is never rendered as text and never spoken
 * — the screen hides the sparkline from the accessibility tree and reads
 * out the real values instead.
 *
 * @returns one 0-100 number per input value, in the same order.
 */
export function normaliseForSparkline(
  type: SelfReportedMetricType,
  values: number[],
): number[] {
  const spec = METRIC_DISPLAY[type]
  if (!spec) return []
  const { lo, hi } = resolveScaleBounds(spec, values)
  const span = hi - lo || 1
  return values
    .filter((v) => Number.isFinite(v))
    .map((v) => {
      const pct = ((v - lo) / span) * 100
      // Clamp: an out-of-range reading pegs the bar rather than
      // overflowing into the neighbouring card. The REAL value is still
      // printed verbatim, and the card labels the clamp.
      if (pct < 0) return 0
      if (pct > 100) return 100
      return pct
    })
}

/** True when any value in the series falls outside a FIXED chart range. */
export function hasOutOfRangeValue(
  type: SelfReportedMetricType,
  values: number[],
): boolean {
  const spec = METRIC_DISPLAY[type]
  if (!spec) return false
  // Destructured into a local so the discriminated-union narrowing
  // survives into the closure below (TS drops narrowing on a property
  // access captured inside a callback).
  const scale = spec.scale
  if (scale.mode !== 'fixed') return false
  return values.some((v) => Number.isFinite(v) && (v < scale.lo || v > scale.hi))
}

/**
 * Which metrics deserve a chart for this patient?
 *
 * PRIMARY signal — the plan tasks themselves, classified by the SAME
 * `detectMetricForTask` the RECORD modal uses. If the classifier decides a
 * task asks for a reading, that reading gets a chart. One classifier, so
 * "what we ask for" and "what we chart" cannot drift apart.
 *
 * SECONDARY signal — metric types the patient has ALREADY recorded. A plan
 * that asks for blood pressure on Mondays would otherwise make the BP card
 * vanish on Tuesday, which reads as "my data was deleted". Passing in the
 * already-recorded types keeps the card present on off-days.
 *
 * BP pairing: the capture modal writes systolic AND diastolic as two rows.
 * Whenever systolic is chartable we force diastolic in too, so the pair
 * card always has both halves even if only one side was seen.
 *
 * @param tasks          Plan tasks for the day in view (may be empty).
 * @param recordedTypes  Metric types with at least one stored reading.
 * @returns canonical types in stable display order, deduped.
 */
export function deriveChartableMetricTypes(
  tasks: Pick<TaskOccurrence, 'title' | 'description' | 'type'>[],
  recordedTypes: SelfReportedMetricType[] = [],
): SelfReportedMetricType[] {
  const wanted = new Set<SelfReportedMetricType>()

  for (const task of tasks) {
    const spec = detectMetricForTask(task)
    if (spec) wanted.add(spec.type)
  }
  for (const t of recordedTypes) wanted.add(t)

  // BP is a pair — never chart one half alone.
  if (wanted.has('blood_pressure_systolic') || wanted.has('blood_pressure_diastolic')) {
    wanted.add('blood_pressure_systolic')
    wanted.add('blood_pressure_diastolic')
  }

  return DISPLAY_ORDER.filter((t) => wanted.has(t))
}

/**
 * A single card's worth of chartable metric.
 *
 * Blood pressure is ONE card with two series, not two cards: systolic and
 * diastolic are a single measurement taken at a single moment, and showing
 * them as unrelated charts invites reading "120" and "80" as two separate
 * trends when they are one reading.
 */
export interface MetricCardSpec {
  /** Stable React key + card identity. */
  key: string
  /** Card title shown to the patient. */
  title: string
  /** Metric types charted inside this card, in render order. */
  types: SelfReportedMetricType[]
  /** True for the systolic/diastolic pair card. */
  isPair: boolean
}

/**
 * Group chartable types into cards, collapsing the BP pair.
 * Input is expected to already be in DISPLAY_ORDER.
 */
export function buildMetricCards(types: SelfReportedMetricType[]): MetricCardSpec[] {
  const cards: MetricCardSpec[] = []
  const seen = new Set<SelfReportedMetricType>()

  for (const type of types) {
    if (seen.has(type)) continue

    if (type === 'blood_pressure_systolic' || type === 'blood_pressure_diastolic') {
      seen.add('blood_pressure_systolic')
      seen.add('blood_pressure_diastolic')
      cards.push({
        key: 'blood_pressure',
        title: 'Blood pressure',
        types: ['blood_pressure_systolic', 'blood_pressure_diastolic'],
        isPair: true,
      })
      continue
    }

    seen.add(type)
    cards.push({
      key: type,
      title: METRIC_DISPLAY[type]?.label ?? type,
      types: [type],
      isPair: false,
    })
  }

  return cards
}

export interface UseMetricHistoriesResult {
  /** type → history. Absent while the first fetch for that type is in flight. */
  byType: Partial<Record<SelfReportedMetricType, MetricHistory>>
  /** True until every requested type has resolved at least once. */
  isLoading: boolean
}

/**
 * Fetch a windowed history per metric type, in parallel.
 *
 * One request per type rather than one bulk request: the history endpoint
 * is deliberately single-type (a real SK range read per type is cheaper
 * server-side than one prefix scan across all of them), and a per-type
 * cache key means a newly-added metric doesn't invalidate the others.
 *
 * `fetchMetricHistory` never rejects, so these queries never enter an
 * error state — a failure arrives as `degraded: true` inside the data,
 * which the card renders as "couldn't load" rather than "no readings".
 *
 * @param types Canonical types to chart. Empty array issues no requests.
 * @param days  Lookback window. Default METRIC_HISTORY_DAYS.
 */
export function useMetricHistories(
  types: SelfReportedMetricType[],
  days: number = METRIC_HISTORY_DAYS,
): UseMetricHistoriesResult {
  const queries = useQueries({
    queries: types.map((type) => ({
      queryKey: ['self-reported-metric-history', type, days] as const,
      queryFn: () => fetchMetricHistory(type, days),
      // Readings are recorded at most a few times a day; a 5 minute stale
      // window keeps tab-switching instant without serving stale charts
      // after a fresh RECORD.
      staleTime: 5 * 60 * 1000,
    })),
  })

  const byType = React.useMemo(() => {
    const map: Partial<Record<SelfReportedMetricType, MetricHistory>> = {}
    types.forEach((type, i) => {
      const data = queries[i]?.data
      if (data) map[type] = data
    })
    return map
    // `queries` is a new array identity every render, so depend on the
    // per-query update stamps instead — same pattern as
    // hooks/use-wellbeing-derivation.ts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.join('|'), queries.map((q) => q.dataUpdatedAt).join('|')])

  const isLoading = queries.some((q) => q.isLoading)

  return { byType, isLoading }
}

/**
 * Single-metric convenience wrapper around {@link useMetricHistories}.
 *
 * @param type Canonical metric type.
 * @param days Lookback window. Default METRIC_HISTORY_DAYS.
 */
export function useMetricHistory(
  type: SelfReportedMetricType,
  days: number = METRIC_HISTORY_DAYS,
): { history: MetricHistory | undefined; isLoading: boolean } {
  const types = React.useMemo(() => [type], [type])
  const { byType, isLoading } = useMetricHistories(types, days)
  return { history: byType[type], isLoading }
}

export type { MetricHistory, MetricHistoryPoint }
