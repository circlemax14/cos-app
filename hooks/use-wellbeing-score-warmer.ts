/**
 * hooks/use-wellbeing-score-warmer.ts — 2026-08-05
 *
 * Fire-and-forget prefetch of `GET /v1/patients/me/wellbeing-score` on
 * Home mount. The endpoint's response is not consumed by the UI (the
 * Wellbeing tile uses a separate client-side aggregation via
 * `useScoreCatalog`); the whole point of this hook is to warm the
 * server-side wellbeing-score DDB cache that the Daily Read wellbeing
 * pillar reads from.
 *
 * WHY this exists (2026-08-05):
 *   The Daily Read aggregator reads the wellbeing pillar off
 *   `cos-wellbeing-scores-<stage>` (server-cached snapshot). If nothing
 *   has ever hit the wellbeing-score endpoint for this user the cache
 *   row doesn't exist → pillar returns insufficient_data → Daily Read
 *   detail hides Wellbeing under "ADD MORE DATA". This hook fires the
 *   endpoint once per Home mount (staleTime 1h) so the cache gets warm
 *   in the background and the pillar renders on the next Daily Read.
 *
 * SAFETY:
 *   - retry: false — a failing wellbeing endpoint MUST NOT block the
 *     Home surface. Failures log inside apiClient and are swallowed.
 *   - staleTime: 1h — avoids hammering the endpoint on tab switches;
 *     React Query dedupes concurrent mounts.
 *   - The endpoint's compute path is idempotent; a second call within
 *     the same day returns the cached row without recomputing.
 *
 * When SCRUM-659 (Habits-in-Plan) or a future wellbeing endpoint
 * consumer lands, delete this warmer — the pillar reads directly from
 * whatever call is already firing.
 */

import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/api-client'

const STALE_MS = 60 * 60 * 1000 // 1h

export function useWellbeingScoreWarmer(enabled: boolean): void {
  useQuery({
    queryKey: ['wellbeing-score', 'warmer'],
    queryFn: async () => {
      // Return type intentionally opaque — we don't consume the payload.
      await apiClient.get('/v1/patients/me/wellbeing-score')
      return true
    },
    enabled,
    staleTime: STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })
}
