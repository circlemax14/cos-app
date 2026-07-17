import { useFeatureFlags } from './use-feature-flags';
import { isUnifiedPlanDefaultEnabled } from '@/lib/unified-plan-default-flag';

/**
 * React wrapper around the pure predicate in
 * `lib/unified-plan-default-flag.ts` (COS-469 / Phase 4).
 *
 * Reads the shared `useFeatureFlags` query — same pattern used by
 * `use-assessment-strategy-v2-flag.ts` — and defaults to `false`
 * whenever the flag is missing or the query is still loading, so
 * pre-flip users experience zero change.
 */
export function useUnifiedPlanDefaultEnabled(): boolean {
  const { data } = useFeatureFlags();
  return isUnifiedPlanDefaultEnabled(data);
}
