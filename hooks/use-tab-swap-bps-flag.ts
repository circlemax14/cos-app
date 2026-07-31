/**
 * ADR-0005 P0 — flag hook for the tab-swap that temp-retires the
 * classic Plan tab and mounts the BPS view in its slot.
 *
 * SCRUM-651 migration: `isTabSwapBpsEnabled()` now reads the backend
 * feature-flag registry (`GET /v1/feature-flags`, key
 * `TAB_SWAP_BPS_ENABLED`) via `useTabSwapBpsRegistryFlag`. The
 * build-time `EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED` env var remains a
 * cold-start fallback for the ~200ms window before the flags query
 * resolves. Both surfaces default OFF (STRICT === 'true' semantics).
 *
 * Signature preserved (still a sync-shaped `() => boolean`) so no
 * call site moves — but the function now transitively calls a React
 * hook, so it MUST be invoked inside a component render path. Every
 * current caller already does this (`app/Home/health-plan.tsx`,
 * `components/plan/ClassicViewLink.tsx`).
 *
 * Rollback: flip the backend registry `TAB_SWAP_BPS_ENABLED` off, or
 * (for the cold-start window) unset `EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED`
 * and OTA. Runtime effect is the classic legacy Care Plan render,
 * byte-for-byte identical to pre-flag behavior.
 */

import { useFeatureFlags } from '@/hooks/use-feature-flags';

/**
 * Cold-start env fallback. Only consulted when the flags query has
 * not yet resolved (`data === undefined`). STRICT `=== 'true'` — a
 * stray "1" / "yes" must NOT enable the tab-swap.
 */
function envTrue(): boolean {
  return (
    String(process.env.EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED ?? '')
      .toLowerCase()
      .trim() === 'true'
  );
}

/**
 * Registry-backed predicate with env-var cold-start fallback.
 * Never throws. Default false.
 */
export function isTabSwapBpsEnabled(): boolean {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- SCRUM-651: preserving legacy sync-shaped signature; every caller renders inside a component.
  const { data } = useFeatureFlags();
  if (data === undefined) return envTrue();
  return data.TAB_SWAP_BPS_ENABLED === true;
}

/**
 * React hook wrapper. Returns the same boolean as `isTabSwapBpsEnabled()`.
 * Kept as a hook so consumers use it like every other flag hook in this
 * repo (`useBiopsychosocialPlanFlag`, `usePlanScreenV2Enabled`, etc.).
 */
export function useTabSwapBpsEnabled(): boolean {
  return isTabSwapBpsEnabled();
}
