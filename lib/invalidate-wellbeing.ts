/**
 * lib/invalidate-wellbeing.ts — Ken 2026-08-06 iter 3.
 *
 * Shared helper to invalidate all wellbeing-score React Query caches
 * whenever the patient does something that changes a wellbeing
 * component's sub-score. Called from the write-path callsites the BE
 * cache-invalidation PR (companion PR) also touches:
 *   - Task complete (adherence sub-score)
 *   - Task skip     (adherence — skips count as expected-not-done)
 *   - Task omit     (adherence — omits drop the denominator)
 *   - Assessment submit (assessments sub-score, 40% of composite)
 *   - Readiness snapshot POST (sleep sub-score)
 *
 * The BE already drops its own cache row on those write paths (see
 * cos-backend/src/services/wellbeing-score-cache.service.ts::
 * deleteCachedScore). This helper aligns the FE so the Home tile
 * arrow/sparkline + the detail screen's component breakdown all
 * refetch within a tick instead of waiting for React Query's
 * staleTime (30 min) to elapse.
 *
 * Keys invalidated (match hooks/use-wellbeing-history.ts and
 * hooks/use-wellbeing-score-warmer.ts):
 *   - ['wellbeing-score', 'current']
 *   - ['wellbeing-history']       (prefix — covers all [.., days] variants)
 *   - ['wellbeing-score', 'warmer']
 */

import type { QueryClient } from '@tanstack/react-query'

export function invalidateWellbeingCaches(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['wellbeing-score', 'current'] })
  queryClient.invalidateQueries({ queryKey: ['wellbeing-history'] })
  queryClient.invalidateQueries({ queryKey: ['wellbeing-score', 'warmer'] })
}
