/**
 * Pure gating logic for whether Apple Health (HealthKit) trends should be
 * fetched and shown (COS-397 / SCRUM-535).
 *
 * The user-facing Apple Health preference (services/apple-health-preference.ts)
 * is the AUTHORITATIVE switch. iOS does not reliably let an app revoke its own
 * HealthKit read access, and once prompted `getAuthStatus` returns the same
 * value whether the user granted or denied — so the system permission can NOT
 * be trusted to reflect the user's intent. The app-level preference can.
 *
 * Rules:
 *  - Apple Health is iOS-only. On any non-iOS platform the gate is closed
 *    (HealthKit data never applies — the Android Health Connect path is
 *    tracked separately).
 *  - On iOS, the gate follows the persisted preference: enabled → fetch/show,
 *    disabled → treat as no-data/disabled regardless of lingering iOS grants.
 *
 * Keep this file PURE — no React, no AsyncStorage, no platform import. Easy to
 * unit-test; callers pass the already-resolved inputs.
 */
export function shouldFetchAppleHealthTrends(
  isIos: boolean,
  preferenceEnabled: boolean,
): boolean {
  return isIos && preferenceEnabled
}

/**
 * Resolves how the Health Trends UI should treat Apple Health for the current
 * platform + preference state.
 *
 *  - `enabled`  → fetch and show Apple Health trends as normal.
 *  - `disabled` → the user turned Apple Health off; hide its trends and show
 *                 the "Apple Health is turned off" prompt (iOS only).
 *  - `unavailable` → not iOS; Apple Health is not applicable, render nothing
 *                 for it (no "turned off" prompt either).
 */
export type AppleHealthTrendsState = 'enabled' | 'disabled' | 'unavailable'

export function resolveAppleHealthTrendsState(
  isIos: boolean,
  preferenceEnabled: boolean,
): AppleHealthTrendsState {
  if (!isIos) return 'unavailable'
  return preferenceEnabled ? 'enabled' : 'disabled'
}
