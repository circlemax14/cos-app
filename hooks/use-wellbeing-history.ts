/**
 * hooks/use-wellbeing-history.ts — Ken 2026-08-06 (Wellbeing V2 Phase 2b).
 *
 * React Query wrapper around `GET /v1/patients/me/wellbeing-score/history`.
 * Consumed by the Home tile sparkline (default 7 days) + the wellbeing-map
 * detail screen range toggle (3 / 7 / 30 / 90).
 *
 * Failure-tolerant by construction — the underlying `fetchWellbeingHistory`
 * catches every error and returns `{buckets: [], days}`, so a hard network
 * outage or a flag-off 404 both degrade to "no sparkline" rather than
 * throwing into the tile's render.
 *
 * StaleTime = 30 min. The endpoint is idempotent per UTC day (BE cache
 * key = (userSub, bucketDate)), so re-querying more often than that just
 * burns bandwidth. Query key includes `days` so the tile's 7-day cache
 * and the detail screen's 30-day cache don't stomp each other.
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchWellbeingHistory,
  fetchWellbeingScore,
  type WellbeingHistoryResponse,
  type WellbeingScoreResponse,
} from '@/services/api/wellbeing-score'

export const WELLBEING_HISTORY_KEY = ['wellbeing-history'] as const

export function useWellbeingHistory(days: number = 7) {
  return useQuery<WellbeingHistoryResponse>({
    queryKey: [...WELLBEING_HISTORY_KEY, days] as const,
    queryFn: () => fetchWellbeingHistory(days),
    staleTime: 30 * 60 * 1000,
  })
}

/**
 * `GET /v1/patients/me/wellbeing-score` — today's composite with the
 * `components[]` breakdown (self-assessments / sleep / adherence).
 * Used by the wellbeing-score detail screen's "what's driving this"
 * section. Returns null on flag-off / network failure so the caller
 * degrades to the client-side derivation.
 */
export const WELLBEING_SCORE_QUERY_KEY = ['wellbeing-score', 'current'] as const

export function useWellbeingScoreEndpoint() {
  return useQuery<WellbeingScoreResponse | null>({
    queryKey: WELLBEING_SCORE_QUERY_KEY,
    queryFn: fetchWellbeingScore,
    // BE caches per UTC day → refetch cadence past 30 min just burns
    // network. Longer staleTime is safe here too since the FE always
    // renders a fallback from client-side derivation.
    staleTime: 30 * 60 * 1000,
  })
}
