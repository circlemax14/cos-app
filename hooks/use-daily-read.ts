/**
 * SCRUM-644 — Daily Read data hook.
 *
 * React Query wrapper around GET /v1/patients/me/daily-read. Fetches
 * are gated on `useDailyReadFlag()` so the query never fires while
 * the backend flag is OFF (dark-launch discipline; matches
 * use-health-age.ts).
 *
 * Cache policy:
 *   - staleTime: 5 min — matches the server-side aggregator cache TTL
 *     keyed by (userSub, dayBucket). Pull-to-refresh within the window
 *     returns the same payload; that's the intended behavior.
 *   - retry: skips on `DailyReadFeatureDisabledError` so a flag flip
 *     doesn't hammer the endpoint from a stale cache. Otherwise retry
 *     once (matches wellbeing/health-age discipline; the aggregator
 *     never throws on partial signal failure, so an error here is
 *     almost always transport/auth).
 */

import { useQuery } from '@tanstack/react-query'

import { useDailyReadFlag } from './use-daily-read-flag'
import {
  DailyReadFeatureDisabledError,
  getDailyRead,
  type DailyReadResponse,
} from '@/services/api/daily-read'

export const DAILY_READ_QUERY_KEYS = {
  current: ['daily-read', 'current'] as const,
}

const STALE_MS = 5 * 60 * 1000

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof DailyReadFeatureDisabledError) return false
  return failureCount < 1
}

export function useDailyRead(enabledOverride?: boolean) {
  const flagEnabled = useDailyReadFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<DailyReadResponse>({
    queryKey: DAILY_READ_QUERY_KEYS.current,
    queryFn: () => getDailyRead(),
    enabled,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  })
}
