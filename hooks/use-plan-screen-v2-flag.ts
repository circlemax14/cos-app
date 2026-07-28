import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { isPlanScreenV2Enabled } from '@/lib/plan-v2/plan-screen-v2-flag';

/**
 * React wrapper for the Phase 6.4 v2 render flag. Defaults false while
 * flags load — the legacy screen stays live until we positively know v2
 * is enabled. Never throws.
 */
export function usePlanScreenV2Enabled(): boolean {
  const { data } = useFeatureFlags();
  return isPlanScreenV2Enabled(data);
}
