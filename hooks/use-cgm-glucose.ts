/**
 * SCRUM-648 — CGM / Glucose data hooks.
 *
 * React Query wrapper around the glucose-trend endpoint. Fetches are
 * gated on `useCgmGlucoseFlag()` so the queries never fire while the
 * backend flag is OFF (dark-launch discipline; matches the pattern in
 * hooks/use-habit-journal.ts).
 *
 * Cache policy:
 *   - staleTime: 15 min — TIR is a rolling 14-day summary; recomputes
 *     server-side after each sample batch, so refreshing more than
 *     ~4×/hour is pointless.
 *   - refetchOnWindowFocus: false — the surface is dark-launched and
 *     doesn't need aggressive freshness on foreground.
 */

import { useQuery } from '@tanstack/react-query'

import { useCgmGlucoseFlag } from './use-cgm-glucose-flag'
import {
  getPatientGlucoseTrend,
  type GlucoseTrendResponse,
} from '@/services/api/cgm-glucose'

export const CGM_GLUCOSE_QUERY_KEYS = {
  trend: (windowDays: number) => ['cgm-glucose-trend', windowDays] as const,
}

export function useGlucoseTrend(
  windowDays: number = 14,
  enabledOverride?: boolean,
) {
  const flagEnabled = useCgmGlucoseFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<GlucoseTrendResponse>({
    queryKey: CGM_GLUCOSE_QUERY_KEYS.trend(windowDays),
    queryFn: () => getPatientGlucoseTrend({ windowDays }),
    enabled,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
