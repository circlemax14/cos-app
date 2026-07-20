import { useFeatureFlags } from './use-feature-flags';
import { isPlanScreenV2Enabled } from '@/lib/plan-v2/plan-screen-v2-flag';

/**
 * React wrapper for the Phase 6.4 render flag `plan_screen_v2_enabled`
 * (COS-475). Defaults to `false` while the feature-flags query is
 * loading — pre-flip users experience zero change.
 *
 * DISTINCT from `useUnifiedPlanDefaultEnabled` (Phase 4 tab default,
 * currently OFF post iOS 26 rollback). See `lib/plan-v2/plan-screen-v2-flag.ts`.
 */
export function usePlanScreenV2Enabled(): boolean {
  const { data } = useFeatureFlags();
  return isPlanScreenV2Enabled(data);
}
