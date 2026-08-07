/**
 * hooks/use-health-age-history.ts — Health Age trend (graphable).
 *
 * React Query wrapper around `fetchHealthAgeHistory`, feeding the Health
 * Age detail screen's range toggle + delta sparkline.
 *
 * NAMING — why not `useHealthAgeHistory`
 *   `hooks/use-health-age.ts` already exports a `useHealthAgeHistory`
 *   bound to the LEGACY `points` projection. Two hooks with the same
 *   name in different modules is a trap for the next reader, so this one
 *   is `useHealthAgeHistoryBuckets` — it says which projection you get.
 *
 * Gated on `useHealthAgeFlag()` so the query never fires while the
 * backend flag is OFF (dark-launch discipline, same as use-health-age.ts).
 *
 * staleTime = 30 min: the backend snapshot is keyed per UTC day, so
 * refetching more often than that only burns bandwidth. The query key
 * includes `days` so the 7-day and 90-day windows cache independently
 * and toggling the range is instant on the second visit.
 *
 * No retry configuration is needed: `fetchHealthAgeHistory` never
 * rejects (it returns an empty series on failure), so React Query sees
 * every call as a success and there is nothing to back off from.
 */

import { useQuery } from '@tanstack/react-query'

import { useHealthAgeFlag } from './use-health-age-flag'
import {
  fetchHealthAgeHistory,
  type HealthAgeHistoryBucketsResponse,
} from '@/services/api/health-age-history'

export const HEALTH_AGE_HISTORY_BUCKETS_KEY = ['health-age', 'history-buckets'] as const

export function healthAgeHistoryBucketsKey(days: number): readonly unknown[] {
  return [...HEALTH_AGE_HISTORY_BUCKETS_KEY, days]
}

/**
 * @param days trailing window, inclusive of today. Backend caps at 90.
 * @param enabledOverride bypass the feature-flag gate (tests / previews).
 */
export function useHealthAgeHistoryBuckets(
  days: number = 30,
  enabledOverride?: boolean,
) {
  const flagEnabled = useHealthAgeFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<HealthAgeHistoryBucketsResponse>({
    queryKey: healthAgeHistoryBucketsKey(days),
    queryFn: () => fetchHealthAgeHistory(days),
    enabled,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
