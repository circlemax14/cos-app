/**
 * Pure predicate for the Phase 6.4 render flag `plan_screen_v2_enabled`.
 * No RN imports so it stays unit-testable and doesn't drag native code
 * into the mount path.
 */

export const PLAN_SCREEN_V2_FLAG = 'plan_screen_v2_enabled' as const;

export function isPlanScreenV2Enabled(
  flags: Record<string, boolean | undefined> | undefined | null,
): boolean {
  return !!flags && flags[PLAN_SCREEN_V2_FLAG] === true;
}
