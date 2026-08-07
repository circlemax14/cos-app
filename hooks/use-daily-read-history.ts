/**
 * SCRUM-644 (Aug-6 amendment) — Daily Read history hook.
 *
 * React Query wrapper around GET /v1/patients/me/daily-read/history.
 * Feeds the 7-day sparkline on DailyReadCard (and, later, a longer
 * window on a detail surface).
 *
 * FLAG GATING: fetches only when `useDailyReadFlag()` is ON, exactly
 * like use-daily-read.ts, so the query never fires while the backend
 * flag is dark. Callers may pass `enabledOverride` to reuse a flag value
 * the parent already read (avoids a second store subscription).
 *
 * NO RETRY, NO THROW: `fetchDailyReadHistory` catches everything and
 * returns an empty history, so there is nothing to retry and nothing
 * that can reach an error boundary. A missing sparkline is a
 * non-event — the card renders its normal content either way.
 *
 * staleTime 30 min: the backend files at most one row per UTC day and
 * refreshes it only on a cache miss (5-min server TTL), so polling
 * faster than half an hour cannot surface new information. Matches
 * use-wellbeing-history.ts so the two Home sparklines refresh in step.
 *
 * The query key includes `days` so a 7-day tile query and a 30-day
 * detail query cannot stomp each other's cache entry.
 */

import { useQuery } from '@tanstack/react-query'

import { useDailyReadFlag } from './use-daily-read-flag'
import {
  fetchDailyReadHistory,
  type DailyReadHistoryResponse,
} from '@/services/api/daily-read-history'

export const DAILY_READ_HISTORY_QUERY_KEY = ['daily-read', 'history'] as const

const STALE_MS = 30 * 60 * 1000

export function useDailyReadHistory(
  days: number = 7,
  enabledOverride?: boolean,
) {
  const flagEnabled = useDailyReadFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<DailyReadHistoryResponse>({
    queryKey: [...DAILY_READ_HISTORY_QUERY_KEY, days] as const,
    queryFn: () => fetchDailyReadHistory(days),
    enabled,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    // The fetcher never rejects, so a retry could only ever repeat an
    // identical empty result. Off.
    retry: false,
  })
}

/**
 * Extract a newest-last numeric series for ScoreHistorySparkline.
 *
 * Buckets whose `score` is null are DROPPED rather than coerced to 0 —
 * a day with no signal is unknown, and a 0 bar would tell the patient
 * they scored zero that day, which is false. The sparkline left-pads
 * whatever it is given, so a short series still reads honestly.
 *
 * Exported (rather than inlined in the card) so the "null is not zero"
 * rule lives in exactly one place.
 */
export function toSparklineSeries(
  buckets: readonly { score: number | null }[] | undefined,
): number[] {
  if (!buckets || buckets.length === 0) return []
  const out: number[] = []
  for (const b of buckets) {
    if (typeof b.score === 'number' && Number.isFinite(b.score)) out.push(b.score)
  }
  return out
}
