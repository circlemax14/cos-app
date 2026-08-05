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

import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { isHealthKitAvailable, getHealthKitVitalTrend, initializeHealthKit } from '@/services/health'
import { NativeModules } from 'react-native'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AppleHealthKitRaw = require('react-native-health').default ?? require('react-native-health')
import type { LongitudinalTrend } from '@/services/api/types'
import {
  computeReadinessScore,
  type DailyReadinessMetrics,
  type ReadinessBand,
  type ReadinessDriver,
  type ReadinessScore,
} from '@/lib/readiness-score'
import { useAppleHealthPreference } from '@/hooks/use-apple-health-preference'
import { shouldFetchAppleHealthTrends } from '@/lib/apple-health-gate'
import {
  postReadinessSnapshot,
  type ReadinessDriverBreakdown,
  type ReadinessDriverState,
  type ReadinessSnapshotBand,
} from '@/services/api/readiness-snapshot'

const READINESS_LOOKBACK_DAYS = 15 // 14 baseline + 1 today

// ─── SCRUM-654 snapshot ingest constants ─────────────────────────────
// Client-side belt-and-suspenders throttle mirroring the BE 5-min
// conditional-put gate. Keyed by userSub so multi-account devices are
// tracked independently.
const READINESS_POST_MIN_INTERVAL_MS = 5 * 60 * 1000
const READINESS_LAST_POST_STORAGE_PREFIX = 'readiness:lastPostAt:'

/**
 * Local ReadinessBand ('optimal'|'developing'|'foundational'|'initial')
 * → BE zod enum ('optimal'|'balanced'|'strained'|'depleted'). Intent
 * preserved: optimal is optimal; the two middle buckets soften; the
 * lowest maps to depleted. Kept as a pure map so the mapping is trivial
 * to eyeball in review.
 */
function bandToSnapshotBand(band: ReadinessBand): ReadinessSnapshotBand {
  switch (band) {
    case 'optimal': return 'optimal'
    case 'developing': return 'balanced'
    case 'foundational': return 'strained'
    case 'initial': return 'depleted'
  }
}

/**
 * ReadinessDriver.direction ('above'|'below'|'at') → BE categorical
 * enum ('above_baseline'|'below_baseline'|'at_baseline'). Categorical
 * position ONLY — the loader interprets meaning per-metric.
 */
function directionToDriverState(direction: ReadinessDriver['direction']): ReadinessDriverState {
  if (direction === 'above') return 'above_baseline'
  if (direction === 'below') return 'below_baseline'
  return 'at_baseline'
}

function driversToBreakdown(drivers: readonly ReadinessDriver[]): ReadinessDriverBreakdown {
  const breakdown: ReadinessDriverBreakdown = {}
  for (const d of drivers) {
    // The pure module (lib/readiness-score.ts) uses these exact keys.
    breakdown[d.metric] = directionToDriverState(d.direction)
  }
  return breakdown
}

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
  init: {
    ran: boolean
    returned: boolean | null // initializeHealthKit's resolved value; null if threw
    error: string | null
    durationMs: number
  }
  vitals: {
    hrv: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
    sleep: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
    restingHr: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
    respRate: { returned: 'null' | 'trend'; nPoints: number; firstDate?: string; firstValue?: number }
  }
  // Direct probe of the native fetcher — bypasses getHealthKitVitalTrend
  // so we can see the raw callback err + sample count without any wrapping.
  hrvRawProbe: {
    fetcherFound: boolean
    fetcherName: string
    windowDays: number
    callbackFired: boolean
    errString: string | null
    rawSampleCount: number
    firstRawStartDate: string | null
    firstRawValue: number | null
  }
  hrvRawProbe90d: {
    fetcherFound: boolean
    windowDays: number
    callbackFired: boolean
    errString: string | null
    rawSampleCount: number
    firstRawStartDate: string | null
  }
  byDateSize: number
  byDateKeysFirst5: string[]
  todayIsoLocal: string
  todayIsoUtc: string
  todayFound: boolean
  todayHasAnyMetric: boolean
  // Vishal 2026-08-05 — 48h "recent" fallback fields. When today's
  // exact bucket is empty (Watch hasn't synced yet this morning), we
  // fall back to the most-recent bucket within 48h so a score renders.
  // `todayIsoUsed` is the ISO date actually scored as "today"; equal
  // to `todayIsoLocal` when no fallback used. `usedRecentFallback` is
  // the boolean that FE surfaces as a caveat on the Readiness hero.
  todayIsoUsed?: string
  usedRecentFallback?: boolean
}

/**
 * DIAG — direct probe of a HealthKit fetcher, bypassing getHealthKitVitalTrend.
 * Reports the raw callback err + sample count so we can distinguish "fetcher
 * missing" from "callback errored" from "empty raw" without any wrapping.
 */
function probeHrvRaw(daysBack: number): Promise<{
  fetcherFound: boolean; fetcherName: string; windowDays: number
  callbackFired: boolean; errString: string | null
  rawSampleCount: number; firstRawStartDate: string | null; firstRawValue: number | null
}> {
  return new Promise((resolve) => {
    const nativeMod = (NativeModules as Record<string, unknown>).AppleHealthKit as Record<string, unknown> | undefined
      || (NativeModules as Record<string, unknown>).RNAppleHealthKit as Record<string, unknown> | undefined
    const wrap = AppleHealthKitRaw as Record<string, unknown>
    const fName = 'getHeartRateVariabilitySamples'
    const fetcher =
      (typeof wrap[fName] === 'function' && wrap[fName]) ||
      (nativeMod && typeof nativeMod[fName] === 'function' && nativeMod[fName]) ||
      null
    if (!fetcher) {
      resolve({
        fetcherFound: false, fetcherName: fName, windowDays: daysBack,
        callbackFired: false, errString: null,
        rawSampleCount: 0, firstRawStartDate: null, firstRawValue: null,
      })
      return
    }
    const end = new Date()
    const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000)
    const opts = { startDate: start.toISOString(), endDate: end.toISOString(), ascending: true, includeManuallyAdded: true }
    let done = false
    const to = setTimeout(() => {
      if (!done) {
        resolve({
          fetcherFound: true, fetcherName: fName, windowDays: daysBack,
          callbackFired: false, errString: 'timeout-5s',
          rawSampleCount: 0, firstRawStartDate: null, firstRawValue: null,
        })
      }
    }, 5000)
    ;(fetcher as (o: unknown, cb: (err: unknown, results: unknown) => void) => void)(opts, (err, results) => {
      if (done) return
      done = true
      clearTimeout(to)
      const arr = Array.isArray(results) ? (results as Record<string, unknown>[]) : []
      const first = arr[0]
      resolve({
        fetcherFound: true, fetcherName: fName, windowDays: daysBack,
        callbackFired: true,
        errString: err ? String((err as { message?: string })?.message ?? err) : null,
        rawSampleCount: arr.length,
        firstRawStartDate: first ? ((first.startDate as string | undefined) ?? null) : null,
        firstRawValue: first ? ((first.value as number | undefined) ?? null) : null,
      })
    })
  })
}

function probeHrvRaw90d(daysBack: number): Promise<{
  fetcherFound: boolean; windowDays: number
  callbackFired: boolean; errString: string | null
  rawSampleCount: number; firstRawStartDate: string | null
}> {
  return probeHrvRaw(daysBack).then((r) => ({
    fetcherFound: r.fetcherFound, windowDays: r.windowDays,
    callbackFired: r.callbackFired, errString: r.errString,
    rawSampleCount: r.rawSampleCount, firstRawStartDate: r.firstRawStartDate,
  }))
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
        init: { ran: false, returned: null, error: null, durationMs: 0 },
        vitals: {
          hrv: { returned: 'null', nPoints: 0 },
          sleep: { returned: 'null', nPoints: 0 },
          restingHr: { returned: 'null', nPoints: 0 },
          respRate: { returned: 'null', nPoints: 0 },
        },
        hrvRawProbe: { fetcherFound: false, fetcherName: 'getHeartRateVariabilitySamples', windowDays: 15, callbackFired: false, errString: null, rawSampleCount: 0, firstRawStartDate: null, firstRawValue: null },
        hrvRawProbe90d: { fetcherFound: false, windowDays: 90, callbackFired: false, errString: null, rawSampleCount: 0, firstRawStartDate: null },
        byDateSize: 0,
        byDateKeysFirst5: [],
        todayIsoLocal: localDayIso(new Date()),
        todayIsoUtc: new Date().toISOString().slice(0, 10),
        todayFound: false,
        todayHasAnyMetric: false,
      },
    }
  }

  // Capture initializeHealthKit's actual result + timing.
  const initStart = new Date().getTime()
  let initReturned: boolean | null = null
  let initError: string | null = null
  try {
    initReturned = await initializeHealthKit()
  } catch (e) {
    initReturned = null
    initError = String((e as { message?: string })?.message ?? e)
  }
  const initDurationMs = new Date().getTime() - initStart
  // Mirror getTodayHealthMetrics's 100ms settle wait — iOS may need a
  // beat after initHealthKit before reads see the new auth state.
  await new Promise((r) => setTimeout(r, 100))

  // 2026-08-05 (Vishal) — expanded metric universe. Any HealthKit type
  // the user has granted access to and has data for contributes to
  // the adaptive score in lib/readiness-score.ts. .catch(()=>null)
  // per-metric so a missing permission on one doesn't fail the batch.
  const [hrv, sleep, hr, resp, steps, kcal, exerciseMin, walkingHr, spo2, flights, hrvProbe15, hrvProbe90] = await Promise.all([
    getHealthKitVitalTrend('heart-rate-variability', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('sleep-hours', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('resting-heart-rate', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('respiratory-rate', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('steps', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('active-energy', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('exercise-time', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('walking-heart-rate', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('oxygen-saturation', READINESS_LOOKBACK_DAYS).catch(() => null),
    getHealthKitVitalTrend('flights-climbed', READINESS_LOOKBACK_DAYS).catch(() => null),
    probeHrvRaw(READINESS_LOOKBACK_DAYS),
    probeHrvRaw90d(90),
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
  // 2026-08-05 (Vishal) — expanded metric universe fields.
  push(steps, 'stepsCount')
  push(kcal, 'activeEnergyKcal')
  push(exerciseMin, 'exerciseMinutes')
  push(walkingHr, 'walkingHrBpm')
  push(spo2, 'spo2Pct')
  push(flights, 'flightsClimbed')

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

  // Vishal 2026-08-05 — 48h "recent" fallback for today. If today's
  // exact bucket is empty (Watch hasn't synced this morning yet), use
  // the most-recent bucket within the last 48h instead. Keeps the
  // score renderable through the common "woke up, Watch charging"
  // gap. Falls through gracefully when even that's stale (>48h → no
  // score, existing empty-state path). The staleness gets surfaced in
  // debug.todayIsoFallback so the FE can annotate "score based on your
  // most recent sync (yesterday)" without recomputing.
  const RECENT_FALLBACK_HOURS = 48
  const todayExact = byDate.get(todayIso)
  let today = todayExact
  let todayIsoUsed = todayIso
  let usedFallback = false
  if (!todayExact) {
    // Walk backwards through sortedDates until we find one within 48h of now.
    const nowMs = new Date().getTime()
    for (let i = sortedDates.length - 1; i >= 0; i--) {
      const candidate = sortedDates[i]
      if (candidate >= todayIso) continue // skip today (already checked) + any future date
      const candidateMs = new Date(`${candidate}T12:00:00`).getTime() // local noon of that day
      const ageHours = (nowMs - candidateMs) / (1000 * 60 * 60)
      if (ageHours > 0 && ageHours <= RECENT_FALLBACK_HOURS) {
        today = byDate.get(candidate)
        todayIsoUsed = candidate
        usedFallback = true
        break
      }
    }
  }
  const baseline = sortedDates
    .filter((d) => d !== todayIsoUsed)
    .map((d) => byDate.get(d))
    .filter((d): d is DailyReadinessMetrics => d !== undefined)

  const debug: ReadinessDebugSnapshot = {
    fetchedAt: new Date().toISOString(),
    isIos,
    isHealthKitAvailable: hkAvailable,
    init: {
      ran: true,
      returned: initReturned,
      error: initError,
      durationMs: initDurationMs,
    },
    vitals: {
      hrv: snapshotVital(hrv),
      sleep: snapshotVital(sleep),
      restingHr: snapshotVital(hr),
      respRate: snapshotVital(resp),
    },
    hrvRawProbe: hrvProbe15,
    hrvRawProbe90d: hrvProbe90,
    byDateSize: byDate.size,
    byDateKeysFirst5: sortedDates.slice(-5).reverse(),
    todayIsoLocal: todayIso,
    todayIsoUtc: new Date().toISOString().slice(0, 10),
    todayFound: today !== undefined,
    // Vishal 2026-08-05 — 48h recent fallback in use? If yes, screens
    // can annotate the hero with "Score based on your most recent
    // sync (<date>)" instead of the strict "today" message.
    todayIsoUsed,
    usedRecentFallback: usedFallback,
    // 2026-08-05 (Vishal) — expanded to the full adaptive metric universe.
    todayHasAnyMetric: today !== undefined && (
      today.hrvMs !== undefined || today.sleepHours !== undefined ||
      today.restingHrBpm !== undefined || today.respRateBpm !== undefined ||
      today.stepsCount !== undefined || today.activeEnergyKcal !== undefined ||
      today.exerciseMinutes !== undefined || today.walkingHrBpm !== undefined ||
      today.spo2Pct !== undefined || today.flightsClimbed !== undefined
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

  // ─── SCRUM-654 fire-and-forget ingest ───────────────────────────
  //
  // On every successful compute where the tile reaches `ready`, POST
  // a categorical snapshot to /v1/patients/me/readiness/snapshot so
  // the BE evaluator can consume the timeseries (loadReadinessSignals,
  // and downstream rules readiness_trending_down / no_readiness_data_2_days
  // / recovery_flat_7_days).
  //
  // Contract (design.fe_post_trigger):
  //   - Only fires when uiState === 'ready' AND score.composite is a
  //     number AND score.band is a string AND enabled AND query.isSuccess.
  //     SKIPs for {unavailable, disconnected, loading, no-samples,
  //     pre-baseline} — matches the BE endpoint's "computed snapshot"
  //     semantic; avoids polluting the server timeseries.
  //   - Dedupe key: `${todayIsoLocal}:${composite}:${band}` — StrictMode
  //     double-mount + unrelated re-renders no-op. Fresh compute (band
  //     flip, score change, new day) advances the key and allows one POST.
  //   - Client throttle: AsyncStorage `readiness:lastPostAt:*` with a
  //     5-min window — belt-and-suspenders with the BE's 300s
  //     conditional-put gate. On 429 from server, honors retryAfterSeconds.
  //   - Fire-and-forget: NO surfacing of errors to the user. Retries
  //     happen naturally when the query refetches (staleTime 30m) and
  //     the dedupe key advances.
  //   - Route is always mounted server-side; when the SSM flag is OFF
  //     the server responds 200 { accepted: 0, reason: 'flag_off' } —
  //     the client honors that silently.
  //   - Body is CATEGORICAL ONLY: score + band + baselineDays +
  //     asOfLocalDay + computedAt + driverBreakdown (enum-valued map).
  //     NEVER raw HRV ms / sleep hours / RHR bpm / resp rate. The BE
  //     zod schema is .strict() and rejects unknown keys with 400.
  //   - Uses query.data.debug.todayIsoLocal as asOfLocalDay so the
  //     server sees the same local calendar day the client scored
  //     against (SCRUM-664 local/UTC trap avoidance).
  const lastPostedKeyRef = useRef<string | null>(null)
  const composite = score.composite
  const bandForPost = score.band
  const baselineDaysForPost = score.baselineDays
  const todayIsoLocal = query.data?.debug.todayIsoLocal
  const driversForPost = score.drivers

  useEffect(() => {
    // Gate: full success + ready state + valid categorical values.
    if (!enabled) return
    if (isUnavailable) return
    if (!query.isSuccess) return
    if (uiState !== 'ready') return
    if (typeof composite !== 'number') return
    if (typeof bandForPost !== 'string') return
    if (!todayIsoLocal) return

    // Dedupe per (day, composite, band) — StrictMode + re-renders no-op.
    const dedupeKey = `${todayIsoLocal}:${composite}:${bandForPost}`
    if (lastPostedKeyRef.current === dedupeKey) return

    let cancelled = false

    const fire = async (): Promise<void> => {
      // Client-side 5-min throttle. Keyed generically because AsyncStorage
      // is per-device — a single user per install is the overwhelming
      // norm on cos-app. The BE remains the authoritative gate; this
      // just avoids the round-trip cost when we already know it's
      // pointless.
      const throttleKey = `${READINESS_LAST_POST_STORAGE_PREFIX}me`
      try {
        const lastRaw = await AsyncStorage.getItem(throttleKey)
        if (lastRaw) {
          const last = Number(lastRaw)
          if (Number.isFinite(last) && Date.now() - last < READINESS_POST_MIN_INTERVAL_MS) {
            // Still inside throttle window — set dedupe ref anyway so
            // we don't re-check on every render.
            lastPostedKeyRef.current = dedupeKey
            return
          }
        }
      } catch {
        // AsyncStorage read failure — proceed. BE will still gate.
      }

      // Mark ref BEFORE the fetch to prevent re-entry from a fast
      // re-render before the promise resolves.
      lastPostedKeyRef.current = dedupeKey

      try {
        const body = {
          score: Math.round(composite),
          band: bandToSnapshotBand(bandForPost),
          baselineDays: baselineDaysForPost,
          asOfLocalDay: todayIsoLocal,
          computedAt: new Date().toISOString(),
          driverBreakdown: driversToBreakdown(driversForPost),
          source: 'healthkit' as const,
        }
        const res = await postReadinessSnapshot(body)
        if (cancelled) return

        // On a real write, record the wall time for the client throttle.
        // On flag_off / throttled we still don't want to hammer the BE:
        // record the timestamp anyway so we back off for 5 min.
        const now = Date.now()
        try {
          if (res.accepted === 1) {
            await AsyncStorage.setItem(throttleKey, String(now))
          } else if (res.reason === 'flag_off' || res.throttled) {
            // Honor server retryAfterSeconds if provided; otherwise use
            // the standard 5-min window.
            const wait = typeof res.retryAfterSeconds === 'number' && res.retryAfterSeconds > 0
              ? res.retryAfterSeconds * 1000
              : READINESS_POST_MIN_INTERVAL_MS
            // Store a "last post" that pushes the next attempt out by
            // `wait` — encode as (now - fullWindow + wait) so the
            // 5-min gate below reads it as `Date.now() - last < wait`.
            const encoded = now - READINESS_POST_MIN_INTERVAL_MS + wait
            await AsyncStorage.setItem(throttleKey, String(encoded))
          }
        } catch {
          // AsyncStorage write failure — non-fatal, next tick will retry.
        }
      } catch {
        // Fire-and-forget: swallow. The dedupe key already advanced, so
        // we won't spin; on the next fresh compute (new score / band /
        // day) the key changes and we retry. Zero UI surface.
      }
    }

    void fire()

    return () => {
      cancelled = true
    }
  }, [
    enabled,
    isUnavailable,
    query.isSuccess,
    uiState,
    composite,
    bandForPost,
    baselineDaysForPost,
    todayIsoLocal,
    driversForPost,
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
