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
import { useAppleHealthPreference } from '@/hooks/use-apple-health-preference'
import { shouldFetchAppleHealthTrends } from '@/lib/apple-health-gate'

const READINESS_LOOKBACK_DAYS = 15 // 14 baseline + 1 today

/**
 * Formats a Date as `YYYY-MM-DD` in the device's LOCAL timezone.
 * Kept local (not hoisted to lib/) because this is the only current
 * caller; hoist when a second caller shows up.
 */
function localDayIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Diagnostic snapshot captured on each fetch. DIAG-only field so the
 * Home Readiness tile can surface actual runtime state on long-press
 * while we finish root-causing why some devices see "no samples today"
 * even with granted HealthKit + real data in Apple Health.
 * TODO: remove once the issue is closed.
 */
export interface ReadinessDebugSnapshot {
  fetchedAt: string
  isIos: boolean
  isHealthKitAvailable: boolean
  vitals: {
    hrv: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
    sleep: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
    restingHr: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
    respRate: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
  }
  byDateSize: number
  byDateKeysFirst5: string[]
  todayIsoLocal: string
  todayIsoUtc: string
  todayFound: boolean
  todayHasAnyMetric: boolean
}

function snapshotVital(t: LongitudinalTrend | null): { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number } {
  if (!t) return { returned: 'null', nPoints: 0 }
  const first = t.dataPoints[0]
  return {
    returned: 'trend',
    nPoints: t.dataPoints.length,
    firstDate: first?.date,
    firstValue: first?.value,
  }
}

/**
 * Fetch four HealthKit trends in parallel + collapse into a per-day
 * summary array. Missing metrics silently drop out; the scoring module
 * handles undefined fields.
 */
async function fetchReadinessInputs(): Promise<{
  today: DailyReadinessMetrics | undefined
  baseline: DailyReadinessMetrics[]
  debug: ReadinessDebugSnapshot
}> {
  const isIos = Platform.OS === 'ios'
  const hkAvailable = isHealthKitAvailable()
  if (!isIos || !hkAvailable) {
    return {
      today: undefined,
      baseline: [],
      debug: {
        fetchedAt: new Date().toISOString(),
        isIos,
        isHealthKitAvailable: hkAvailable,
        vitals: {
          hrv: { returned: 'null', nPoints: 0 },
          sleep: { returned: 'null', nPoints: 0 },
          restingHr: { returned: 'null', nPoints: 0 },
          respRate: { returned: 'null', nPoints: 0 },
        },
        byDateSize: 0,
        byDateKeysFirst5: [],
        todayIsoLocal: localDayIso(new Date()),
        todayIsoUtc: new Date().toISOString().slice(0, 10),
        todayFound: false,
        todayHasAnyMetric: false,
      },
    }
  }

  const [hrv, sleep, hr, resp] = await Promise.all([
    getHealthKitVitalTrend('heart-rate-variability', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('sleep-hours', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('resting-heart-rate', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('respiratory-rate', READINESS_LOOKBACK_DAYS).catch(() => null),
  ])

  // Build a Map<YYYY-MM-DD, DailyReadinessMetrics>; last-writer-wins per
  // metric (which is fine because getHealthKitVitalTrend returns
  // one dataPoint per day).
  //
  // getHealthKitVitalTrend intentionally keeps `dp.date` as a within-day
  // sample timestamp (full ISO) so the chart x-axis anchors on a real
  // sample time. We MUST normalize to YYYY-MM-DD here — otherwise the
  // `byDate.get(todayIso)` lookup below (which slices to YYYY-MM-DD)
  // never matches, `today` is always undefined, and every user sees
  // "Waiting for today's HRV, sleep, and heart-rate readings" forever.
  const byDate = new Map<string, DailyReadinessMetrics>()
  const push = (t: LongitudinalTrend | null, key: keyof Omit<DailyReadinessMetrics, 'date'>): void => {
    if (!t) return
    for (const dp of t.dataPoints) {
      const dayKey = (dp.date ?? '').slice(0, 10)
      if (!dayKey) continue
      const existing = byDate.get(dayKey) ?? { date: dayKey }
      ;(existing as DailyReadinessMetrics)[key] = dp.value
      byDate.set(dayKey, existing)
    }
  }
  push(hrv, 'hrvMs')
  push(sleep, 'sleepHours')
  push(hr, 'restingHrBpm')
  push(resp, 'respRateBpm')

  // MUST be device-LOCAL calendar day, not UTC. HealthKit `startDate`
  // ISO strings come back with the device's local tz offset (e.g.
  // "2026-08-03T08:15:00.000-0700"), so `dp.date.slice(0, 10)` above
  // yields the LOCAL day. `new Date().toISOString()` returns UTC, which
  // in negative-UTC timezones (Americas) is a DIFFERENT calendar day
  // after ~5pm local — making `today` undefined and rendering
  // "Waiting for today's HRV, sleep, and heart-rate readings" for
  // every evening user. See SCRUM-664 / OTA 7701237b post-mortem.
  const todayIso = localDayIso(new Date())
  const sortedDates = Array.from(byDate.keys()).sort() // ISO strings sort chronologically
  const today = byDate.get(todayIso)
  const baseline = sortedDates
    .filter((d) => d !== todayIso)
    .map((d) => byDate.get(d))
    .filter((d): d is DailyReadinessMetrics => d !== undefined)

  const debug: ReadinessDebugSnapshot = {
    fetchedAt: new Date().toISOString(),
    isIos,
    isHealthKitAvailable: hkAvailable,
    vitals: {
      hrv: snapshotVital(hrv),
      sleep: snapshotVital(sleep),
      restingHr: snapshotVital(hr),
      respRate: snapshotVital(resp),
    },
    byDateSize: byDate.size,
    byDateKeysFirst5: sortedDates.slice(-5).reverse(),
    todayIsoLocal: todayIso,
    todayIsoUtc: new Date().toISOString().slice(0, 10),
    todayFound: today !== undefined,
    todayHasAnyMetric: today !== undefined && (
      today.hrvMs !== undefined || today.sleepHours !== undefined ||
      today.restingHrBpm !== undefined || today.respRateBpm !== undefined
    ),
  }

  return { today, baseline, debug }
}

/**
 * Distinct render states for the Readiness tile. Splits the old
 * catch-all `score.state === 'no-data'` bucket into three failure
 * modes so the UI can render honest copy for each — the OLD collapsed
 * label caused "Connect Apple Health" to appear even for users who
 * were already connected (loading race, or connected-but-no-samples
 * today because HRV/Sleep/RHR/RespRate hadn't synced yet).
 *
 *  - `unavailable`   → non-iOS or HealthKit pod missing; parent should
 *                      not mount the tile at all.
 *  - `disconnected`  → iOS + HealthKit linked BUT the user has not
 *                      opted in via app/Home/apple-health.tsx. Show the
 *                      "Connect Apple Health" CTA with a route to the
 *                      opt-in screen.
 *  - `loading`       → preference/query still hydrating. Show a static
 *                      dashes placeholder (no accusation of disconnect).
 *  - `no-samples`    → connected, query resolved, but zero HRV/Sleep/
 *                      RHR/RespRate readings for today (very common on
 *                      iPhone-only users, or before first Watch sync of
 *                      the morning). Show "waiting for readings" copy.
 *  - `pre-baseline`  → connected + data flowing, but <7 baseline days.
 *  - `ready`         → composite score available.
 */
export type ReadinessTileUiState =
  | 'unavailable'
  | 'disconnected'
  | 'loading'
  | 'no-samples'
  | 'pre-baseline'
  | 'ready'

export interface UseReadinessDerivationResult {
  score: ReadinessScore
  /** True while the first HealthKit fetch is in flight. */
  isLoading: boolean
  /** True if HealthKit isn't available on this platform / build. */
  isUnavailable: boolean
  /** Discriminated render state for the Readiness tile. Prefer this
   *  over inferring UI branches from `score.state` — see the type
   *  docstring for why. */
  uiState: ReadinessTileUiState
  /** DIAGNOSTIC snapshot of the last successful fetch — surfaced by the
   *  Home Readiness tile on long-press so we can capture runtime state
   *  from real devices. undefined until first fetch resolves. */
  debug: ReadinessDebugSnapshot | undefined
  /** Manual refetch. */
  refetch: () => Promise<unknown>
}

/**
 * Returns the composite readiness score for the current patient's
 * today, computed on-device from HealthKit samples against a rolling
 * 14-day personal baseline. Consumers should render distinct copy per
 * `uiState` (do NOT collapse loading / disconnected / no-samples into
 * one "Connect Apple Health" branch — see ReadinessTileUiState docs).
 */
export function useReadinessDerivation(enabled: boolean): UseReadinessDerivationResult {
  const isIos = Platform.OS === 'ios'
  const isUnavailable = !isIos || !isHealthKitAvailable()

  // Authoritative "user opted in to Apple Health" signal — mirrors the
  // pattern useHealthKitTrends uses (lib/apple-health-gate.ts, per
  // COS-397 / SCRUM-535). The tile MUST NOT run the query or show any
  // "connect" copy without consulting this — the persisted preference,
  // not iOS's own auth status, is the source of truth.
  const preference = useAppleHealthPreference()
  const preferenceEnabled = preference.data === true
  const gateOpen = shouldFetchAppleHealthTrends(isIos, preferenceEnabled)

  const query = useQuery({
    queryKey: ['readiness-score'],
    queryFn: fetchReadinessInputs,
    enabled: enabled && !isUnavailable && gateOpen,
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
      // (iOS 26.5 primitive envelope). Consumers should key off
      // `uiState === 'loading'` to render the loading skeleton
      // instead of the (wrong) "Connect Apple Health" copy.
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

  const uiState: ReadinessTileUiState = useMemo(() => {
    if (isUnavailable) return 'unavailable'
    // Preference still resolving from AsyncStorage — treat as loading
    // so we don't flash "Connect Apple Health" before we know.
    if (preference.isLoading) return 'loading'
    if (!preferenceEnabled) return 'disconnected'
    if (query.isLoading || !query.data) return 'loading'
    if (score.state === 'pre-baseline') return 'pre-baseline'
    if (typeof score.composite === 'number') return 'ready'
    // Connected + query resolved but zero samples today — do NOT tell
    // the user to "Connect Apple Health"; they already did.
    return 'no-samples'
  }, [
    isUnavailable,
    preference.isLoading,
    preferenceEnabled,
    query.isLoading,
    query.data,
    score.state,
    score.composite,
  ])

  return {
    score,
    isLoading: query.isLoading || preference.isLoading,
    isUnavailable,
    uiState,
    debug: query.data?.debug,
    refetch: query.refetch,
  }
}
