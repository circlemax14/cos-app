/**
 * Pure-logic helpers for the Phase 4 default-flip flag
 * `PLAN_BPS_UNIFIED_DEFAULT_ENABLED` (COS-469).
 *
 * DISTINCT from Phase 2's `PLAN_BPS_UNIFIED_ENABLED` (the endpoint gate
 * lived in `lib/unified-plan-feature-flag.ts`). Phase 4's flag ONLY
 * controls whether the Care Plan tab defaults to the unified plan
 * screen; the endpoint + peer screen can be enabled independently.
 *
 * Kept as a pure module (no RN imports, no react-query) so it is unit-
 * testable under `node --test`, mirroring Phase 2's flag-flag file.
 */
export const PLAN_BPS_UNIFIED_DEFAULT_FLAG =
  'plan_bps_unified_default_enabled' as const;

/** Route names as they appear on `<Tabs.Screen name="…">`. */
export type CarePlanRouteName = 'health-plan' | 'unified-plan';

/**
 * Given the raw flags map from `GET /v1/feature-flags`, decide which
 * route the Care Plan tab should point at.
 *
 * Defaults to the legacy `health-plan` route whenever the flag is not
 * strictly `true` — including undefined/null/loading — so pre-flip
 * users see zero change (Phase 2 baseline preserved).
 */
export function pickDefaultPlanRoute(
  flags: Record<string, boolean | undefined> | undefined | null,
): CarePlanRouteName {
  if (!flags) return 'health-plan';
  return flags[PLAN_BPS_UNIFIED_DEFAULT_FLAG] === true
    ? 'unified-plan'
    : 'health-plan';
}

/** True iff Phase 4's default-flip flag is strictly ON. */
export function isUnifiedPlanDefaultEnabled(
  flags: Record<string, boolean | undefined> | undefined | null,
): boolean {
  return !!flags && flags[PLAN_BPS_UNIFIED_DEFAULT_FLAG] === true;
}
