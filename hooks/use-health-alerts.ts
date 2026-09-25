/**
 * COS-1112 — the Health Alerts roll-up.
 *
 * Gathers the metrics we actually collect, runs each through the crisis rules
 * in lib/health-alert-rules, and reduces them to one light for the corner
 * indicator on Health Status.
 *
 * WHAT IT DOES NOT DO: fetch anything new. Both sources are already loaded by
 * this screen — `useHealthKitTrends` backs the Vitals section and the
 * assessments query backs the assessments list — so the indicator is a
 * derivation, not another round trip on a cold-start surface.
 *
 * ⚠️ `level: null` means NOT ENOUGH DATA and must never be rendered as
 * reassurance. See THE FOURTH STATE in lib/health-alert-rules.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useHealthKitTrends } from '@/hooks/use-healthkit-trends'
import { useMetricHistory } from '@/hooks/use-metric-history'
import { fetchAssessments } from '@/services/api/assessments'
import type { AssessmentRecord } from '@/services/api/assessments'
import type { LongitudinalTrend } from '@/services/api/types'
import {
  evaluateBloodPressure,
  evaluateGad7,
  evaluateGlucoseMgDl,
  evaluatePainScore,
  evaluatePhq9,
  evaluateRespirationRate,
  evaluateSpo2Percent,
  evaluateTemperatureCelsius,
  rollUpAlerts,
  type AlertRollup,
} from '@/lib/health-alert-rules'

/**
 * Metric codes, duplicated from VitalsRedFlagSection rather than exported from
 * it. That file is inside the iOS-26 rendering envelope (ADR-0003), where the
 * standing rule is that changes stay subtractive — adding an export is safe,
 * but importing a component module into a hook pulls its whole render tree
 * into this dependency graph. Four string literals are the cheaper coupling.
 */
const METRIC = {
  bpSystolic: 'hk-bp-systolic',
  bpDiastolic: 'hk-bp-diastolic',
  glucose: 'hk-glucose',
  bodyTemp: 'hk-body-temp',
  spo2: 'hk-spo2',
  respRate: 'hk-resp-rate',
} as const

/** Newest data point for a metric, or undefined when there is none. */
function latestValue(trend: LongitudinalTrend | undefined): number | undefined {
  const points = trend?.dataPoints ?? []
  if (points.length === 0) return undefined
  // dataPoints are ascending by date elsewhere in this codebase; take the last
  // and do not assume it is non-null.
  const last = points[points.length - 1]
  return typeof last?.value === 'number' ? last.value : undefined
}

/**
 * Most recent total for an instrument.
 *
 * `scores` is a Record and instruments name their total differently, so the
 * common keys are tried in order rather than assuming one. Returns undefined
 * rather than 0 when nothing usable is present — a zero PHQ-9 is a real and
 * very different answer from "never taken".
 */
function latestTotal(records: readonly AssessmentRecord[], instrumentId: string): number | undefined {
  const matching = records
    .filter((r) => r.instrumentId === instrumentId)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  const rec = matching[0]
  if (!rec) return undefined
  for (const key of ['total', 'score', 'sum', instrumentId]) {
    const v = rec.scores?.[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  // Single-score instruments sometimes carry exactly one entry.
  const values = Object.values(rec.scores ?? {}).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  )
  return values.length === 1 ? values[0] : undefined
}

export interface HealthAlertsState extends AlertRollup {
  isLoading: boolean
}

/**
 * @param enabled pass the kill-switch through. Hooks cannot be called
 *   conditionally, so the flag has to reach the QUERY instead — otherwise a
 *   disabled feature still fetches assessments on a cold screen, and "off"
 *   would not mean what the ADR-0003 gate promises it means.
 */
export function useHealthAlerts(enabled = true): HealthAlertsState {
  /*
   * Not gated on `enabled`: VitalsRedFlagSection already calls this with the
   * same 90-day window on this very screen, so React Query serves it from the
   * shared cache and no extra request is made either way. It has no `enabled`
   * parameter, and passing 0 would silently change the WINDOW rather than
   * disable the fetch — a worse bug than the one being avoided.
   */
  const { data: trends, isLoading: trendsLoading } = useHealthKitTrends(90)

  /*
   * COS-1119 — pain is SELF-REPORTED, so it comes from the metric store rather
   * than from HealthKit or an instrument.
   *
   * Ken's document asks for it explicitly (0–10 VAS, moderate 4–6, critical
   * 7–10) and the rule was written on day one — but nothing called it, and pain
   * was not in UNMONITORED either. So it was absent from the roll-up while
   * looking covered in the code and green in the tests, which is the worst
   * shape a gap can take.
   */
  const { history: painHistory, isLoading: painLoading } = useMetricHistory('pain_level', 30)

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<AssessmentRecord[]>({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled,
  })

  const byMetric = useMemo(() => {
    const m = new Map<string, LongitudinalTrend>()
    ;(trends ?? []).forEach((t) => m.set(t.metricCode, t))
    return m
  }, [trends])

  const rollup = useMemo(() => {
    const v = (code: string) => latestValue(byMetric.get(code))
    return rollUpAlerts([
      evaluateBloodPressure(v(METRIC.bpSystolic), v(METRIC.bpDiastolic)),
      evaluateGlucoseMgDl(v(METRIC.glucose)),
      evaluateSpo2Percent(v(METRIC.spo2)),
      evaluateRespirationRate(v(METRIC.respRate)),
      evaluateTemperatureCelsius(v(METRIC.bodyTemp)),
      evaluatePhq9(latestTotal(assessments, 'phq-9')),
      evaluateGad7(latestTotal(assessments, 'gad-7')),
      // points are OLDEST-first (the backend reads ScanIndexForward: true), so
      // the most recent reading is the last one. Do not reverse the series.
      evaluatePainScore(painHistory?.points?.[painHistory.points.length - 1]?.value),
    ])
  }, [byMetric, assessments, painHistory])

  if (!enabled) {
    return { level: null, firing: [], clear: [], measuredCount: 0, isLoading: false }
  }
  return { ...rollup, isLoading: trendsLoading || assessmentsLoading || painLoading }
}
