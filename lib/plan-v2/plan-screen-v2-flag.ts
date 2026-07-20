/**
 * Pure-logic predicate for the Phase 6.4 render flag
 * `plan_screen_v2_enabled` (COS-475).
 *
 * Distinct from `plan_bps_unified_default_enabled` (Phase 4 tab default,
 * currently OFF post iOS 26 rollback): a dedicated flag lets v2 ship dark
 * and be enabled for banner-CTA users only, without re-triggering the tab
 * flip that caused the 2026-07-18 rollback.
 *
 * Pure module (no RN, no react-query) so it is unit-testable under
 * `node --test`, mirroring `lib/unified-plan-default-flag.ts`.
 */

export const PLAN_SCREEN_V2_FLAG = 'plan_screen_v2_enabled' as const;

export function isPlanScreenV2Enabled(
  flags: Record<string, boolean | undefined> | undefined | null,
): boolean {
  return !!flags && flags[PLAN_SCREEN_V2_FLAG] === true;
}
