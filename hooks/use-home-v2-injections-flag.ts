import { useFeatureFlags } from './use-feature-flags';

/**
 * SCRUM-652 — backend-driven gate for the legacy Home v2 injections.
 *
 * Sibling to `useHomeV2RegistryFlag` (SCRUM-651). That flag decides whether
 * the *whole* Home surface gets swapped out for the new `HomeV2Layout`.
 * THIS flag decides whether the *legacy* Home renders three surgical v2
 * blocks in-place (GreetingHeader, ScoreCardGrid, WellbeingMapPreview)
 * so we can dark-launch each redesigned component alongside the existing
 * layout without touching the full-swap kill-switch.
 *
 * Reads off the shared `useFeatureFlags` query (`GET /v1/feature-flags`)
 * rather than `useIsFeatureFlagEnabled`, because that helper defaults
 * missing/loading flags to `true` (correct for sign-in-method toggles,
 * which fail open). Injections are dark-launch and MUST default OFF while
 * the flags query is loading or the backend hasn't shipped the key yet —
 * strict `=== true` guarantees an unset / mis-set value cannot flip us on.
 *
 * FLAG_KEY matches the backend registry symbol `HOME_V2_INJECTIONS_ENABLED`.
 */
const HOME_V2_INJECTIONS_FLAG = 'HOME_V2_INJECTIONS_ENABLED';

export function useHomeV2InjectionsEnabled(): boolean {
  const { data } = useFeatureFlags();
  return data?.[HOME_V2_INJECTIONS_FLAG] === true;
}
