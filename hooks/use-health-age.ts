/**
 * SCRUM-642 — Health Age data hooks.
 *
 * React Query wrappers around the health-age endpoints. Fetches are
 * gated on `useHealthAgeFlag()` so the queries never fire while the
 * backend flag is OFF (dark-launch discipline; matches use-cgm-glucose.ts).
 *
 * Cache policy:
 *   - staleTime: 30 min — Health Age is a rolling daily snapshot.
 *   - retry: skips on `HealthAgeFeatureDisabledError` so a flag flip
 *     doesn't hammer the endpoint from a stale cache.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useHealthAgeFlag } from './use-health-age-flag'
import {
  getHealthAge,
  getHealthAgeHistory,
  HealthAgeFeatureDisabledError,
  recomputeHealthAge,
  type HealthAgeHistoryResponse,
  type HealthAgeResult,
} from '@/services/api/health-age'

export const HEALTH_AGE_QUERY_KEYS = {
  current: ['health-age', 'current'] as const,
  history: (days: number) => ['health-age', 'history', days] as const,
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof HealthAgeFeatureDisabledError) return false
  return failureCount < 2
}

export function useHealthAge(enabledOverride?: boolean) {
  const flagEnabled = useHealthAgeFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<HealthAgeResult>({
    queryKey: HEALTH_AGE_QUERY_KEYS.current,
    queryFn: () => getHealthAge(),
    enabled,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  })
}

export function useHealthAgeHistory(
  days: number = 30,
  enabledOverride?: boolean,
) {
  const flagEnabled = useHealthAgeFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<HealthAgeHistoryResponse>({
    queryKey: HEALTH_AGE_QUERY_KEYS.history(days),
    queryFn: () => getHealthAgeHistory({ days }),
    enabled,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  })
}

export function useRecomputeHealthAge() {
  const qc = useQueryClient()
  return useMutation<HealthAgeResult, Error>({
    mutationFn: () => recomputeHealthAge(),
    onSuccess: (fresh) => {
      qc.setQueryData(HEALTH_AGE_QUERY_KEYS.current, fresh)
      // Invalidate any history windows so the sparkline reflects the
      // new snapshot on next render.
      qc.invalidateQueries({ queryKey: ['health-age', 'history'] })
    },
  })
}
