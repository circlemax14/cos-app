/**
 * ADR-0005 P0 — build-time flag hook for the tab-swap that temp-retires
 * the classic Plan tab and mounts the BPS view in its slot.
 *
 * Design:
 *   - Sourced from `process.env.EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED`, a build-
 *     time env inlined by Expo/Metro. STRICT truthiness — only the exact
 *     string `"true"` returns true. Anything else (undefined, empty string,
 *     "1", "TRUE", "false", any typo) returns false. Matches the discipline
 *     from `feedback_env_flag_deploy_drift.md`: dark-launch flags MUST
 *     default OFF and MUST NOT coerce ambiguous values.
 *
 *   - Pure function first (`isTabSwapBpsEnabled`) so callers can gate
 *     JSX branches without pulling a React hook into non-component code
 *     (routing helpers, notification handlers, tests). The React hook
 *     wrapper below just returns the same value — kept as a hook so any
 *     future dynamic source (SSM-backed remote flag, etc.) can be swapped
 *     in at ONE call site without touching component consumers.
 *
 *   - No RN imports, no other hooks — keeps this cheap and unit-testable.
 *
 * Rollback: unset `EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED` (or set to anything
 * other than `"true"`) and OTA. Runtime effect is the classic legacy Care
 * Plan render, byte-for-byte identical to pre-flag behavior.
 */

/**
 * Pure predicate — reads the raw env at call time so tests can override
 * `process.env.EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED` before importing consumers.
 * Never throws. Default false.
 */
export function isTabSwapBpsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED === 'true';
}

/**
 * React hook wrapper. Returns the same boolean as `isTabSwapBpsEnabled()`.
 * Kept as a hook so consumers use it like every other flag hook in this
 * repo (`useBiopsychosocialPlanFlag`, `usePlanScreenV2Enabled`, etc.) —
 * lets us swap the source to a remote/query-backed flag later without
 * touching call sites.
 */
export function useTabSwapBpsEnabled(): boolean {
  return isTabSwapBpsEnabled();
}
