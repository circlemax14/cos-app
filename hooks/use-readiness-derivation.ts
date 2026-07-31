/**
 * hooks/use-readiness-derivation.ts — SCRUM-638
 *
 * Adapter between the app's HealthKit read layer (services/health.ts
 * `getHealthKitVitalTrend`) and the pure scoring module
 * (lib/readiness-score.ts). Fetches 15 days of HRV / sleep-hours /
 * resting-HR / respiratory-rate, splits into today + baseline, and
 * hands to `computeReadinessScore`.
 *
 * WHY REACT QUERY:
 *   - HealthKit reads are async + relatively expensive (permission
 *     dance + 4 native fetches). Cache with staleTime 30min so the
 *     Home surface's normal re-renders don't hammer HealthKit.
 *   - queryKey scoped to the current patient so switching accounts
 *     invalidates cleanly (via existing app-wide user-switch purge).
 *
 * iOS-only: HealthKit is iPhone/Apple Watch. Android + web fall through
 * to `state: 'no-data'` gracefully (no permission prompt, no fetch).
 *
 * NO NEW BE CALLS: this is entirely on-device. Zero API surface change.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Platform } from 'react-native'

import { isHealthKitAvailable, getHealthKitVitalTrend } from '@/services/health'
import type { LongitudinalTrend } from '@/services/api/types'
import {
  computeReadinessScore,
  type DailyReadinessMetrics,
  type ReadinessScore,
} from '@/lib/readiness-score'

const READINESS_LOOKBACK_DAYS = 15 // 14 baseline + 1 today

/**
 * Fetch four HealthKit trends in parallel + collapse into a per-day
 * summary array. Missing metrics silently drop out; the scoring module
 * handles undefined fields.
 */
async function fetchReadinessInputs(): Promise<{
  today: DailyReadinessMetrics | undefined
  baseline: DailyReadinessMetrics[]
}> {
  if (Platform.OS !== 'ios' || !isHealthKitAvailable()) {
    return { today: undefined, baseline: [] }
  }

  const [hrv, sleep, hr, resp] = await Promise.all([
    getHealthKitVitalTrend('heart-rate-variability', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('sleep-hours', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('resting-heart-rate', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('respiratory-rate', READINESS_LOOKBACK_DAYS).catch(() => null),
  ])

  // Build a Map<dateISO, DailyReadinessMetrics>; last-writer-wins per
  // metric (which is fine because getHealthKitVitalTrend returns
  // one dataPoint per day).
  const byDate = new Map<string, DailyReadinessMetrics>()
  const push = (t: LongitudinalTrend | null, key: keyof Omit<DailyReadinessMetrics, 'date'>): void => {
    if (!t) return
    for (const dp of t.dataPoints) {
      const existing = byDate.get(dp.date) ?? { date: dp.date }
      ;(existing as DailyReadinessMetrics)[key] = dp.value
      byDate.set(dp.date, existing)
    }
  }
  push(hrv, 'hrvMs')
  push(sleep, 'sleepHours')
  push(hr, 'restingHrBpm')
  push(resp, 'respRateBpm')

  const todayIso = new Date().toISOString().slice(0, 10)
  const sortedDates = Array.from(byDate.keys()).sort() // ISO strings sort chronologically
  const today = byDate.get(todayIso)
  const baseline = sortedDates
    .filter((d) => d !== todayIso)
    .map((d) => byDate.get(d))
    .filter((d): d is DailyReadinessMetrics => d !== undefined)

  return { today, baseline }
}

export interface UseReadinessDerivationResult {
  score: ReadinessScore
  /** True while the first HealthKit fetch is in flight. */
  isLoading: boolean
  /** True if HealthKit isn't available on this platform / build. */
  isUnavailable: boolean
  /** Manual refetch. */
  refetch: () => Promise<unknown>
}

/**
 * Returns the composite readiness score for the current patient's
 * today, computed on-device from HealthKit samples against a rolling
 * 14-day personal baseline. Consumers should render the empty-state
 * card whenever `score.state === 'no-data' || 'pre-baseline'`.
 */
export function useReadinessDerivation(enabled: boolean): UseReadinessDerivationResult {
  const isUnavailable = Platform.OS !== 'ios' || !isHealthKitAvailable()

  const query = useQuery({
    queryKey: ['readiness-score'],
    queryFn: fetchReadinessInputs,
    enabled: enabled && !isUnavailable,
    staleTime: 30 * 60 * 1000, // 30 min
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const score = useMemo<ReadinessScore>(() => {
    if (isUnavailable) {
      return {
        composite: undefined,
        band: undefined,
        baselineDays: 0,
        state: 'no-data',
        drivers: [],
      }
    }
    if (!query.data) {
      // First-mount / still loading — treat as no-data so consumers
      // can show a static placeholder without an ActivityIndicator
      // (iOS 26.5 primitive envelope).
      return {
        composite: undefined,
        band: undefined,
        baselineDays: 0,
        state: 'no-data',
        drivers: [],
      }
    }
    return computeReadinessScore(query.data.today, query.data.baseline)
  }, [query.data, isUnavailable])

  return {
    score,
    isLoading: query.isLoading,
    isUnavailable,
    refetch: query.refetch,
  }
}
