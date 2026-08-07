/**
 * hooks/use-readiness-history.ts — Vishal 2026-08-06.
 *
 * React Query wrapper around `GET /v1/patients/me/readiness/history`.
 * Consumed by the Readiness detail screen's range toggle (7d / 14d / 30d)
 * and its sparkline.
 *
 * Mirrors hooks/use-wellbeing-history.ts deliberately — same staleTime,
 * same "key includes the range" discipline, same never-throws contract.
 *
 * FAILURE-TOLERANT BY CONSTRUCTION: `fetchReadinessHistory` catches every
 * error and resolves to `{ buckets: [], days }`, so a flag-off 404 or a
 * hard network outage both degrade to "no sparkline yet" rather than
 * throwing into the screen's render. There is no error state to handle
 * at the call site.
 *
 * StaleTime = 30 min. The underlying rows are written at most once per
 * local day (and throttled to one write per 5 min on top of that), so
 * refetching more often than that just burns the patient's cellular
 * data for a series that cannot have changed.
 *
 * `enabled` lets the screen skip the request entirely when the
 * `readiness_score_enabled` flag is OFF — the endpoint would 404 anyway,
 * and a request we already know will fail is wasted battery.
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchReadinessHistory,
  clampReadinessHistoryDays,
  READINESS_HISTORY_DEFAULT_DAYS,
  type ReadinessHistoryResponse,
} from '@/services/api/readiness-history'

export const READINESS_HISTORY_KEY = ['readiness-history'] as const

/**
 * Daily readiness history for the last `days` local days.
 *
 * @param days   Requested window. Clamped to [1, 30] — 30 is the DDB
 *               TTL, so a wider window would promise reaped rows.
 * @param enabled Set false to skip the fetch (e.g. feature flag OFF).
 */
export function useReadinessHistory(
  days: number = READINESS_HISTORY_DEFAULT_DAYS,
  enabled: boolean = true,
) {
  // Clamp BEFORE building the key so `useReadinessHistory(90)` and
  // `useReadinessHistory(30)` share one cache entry instead of firing
  // two identical requests under different keys.
  const clamped = clampReadinessHistoryDays(days)
  return useQuery<ReadinessHistoryResponse>({
    queryKey: [...READINESS_HISTORY_KEY, clamped] as const,
    queryFn: () => fetchReadinessHistory(clamped),
    staleTime: 30 * 60 * 1000,
    enabled,
  })
}
