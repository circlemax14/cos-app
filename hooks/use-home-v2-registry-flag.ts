import { useFeatureFlags } from './use-feature-flags';

/**
 * SCRUM-651 — backend-driven registry gate for the Home v2 redesign.
 *
 * Reads off the shared `useFeatureFlags` query (`GET /v1/feature-flags`)
 * rather than `useIsFeatureFlagEnabled`, because that helper defaults
 * missing/loading flags to `true` (correct for sign-in-method toggles,
 * which fail open). Home v2 is a dark-launch flag that MUST default to
 * OFF while the flags query is loading or the backend hasn't shipped
 * the key yet — strict `=== true` guarantees an unset / mis-set value
 * cannot flip us on.
 *
 * FLAG_KEY matches the backend registry symbol `HOME_V2_ENABLED`.
 *
 * Temp file name (`_registry`) so it doesn't collide with the existing
 * `use-home-v2-flag.ts` during the transitional migration — the two
 * consolidate in step 2.
 */
const HOME_V2_FLAG = 'HOME_V2_ENABLED';

export function useHomeV2RegistryFlag(): boolean {
  const { data } = useFeatureFlags();
  return data?.[HOME_V2_FLAG] === true;
}
