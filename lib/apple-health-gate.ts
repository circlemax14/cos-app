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
 *  - COS-932: the gate is about whether THIS PLATFORM HAS A HEALTH SOURCE,
 *    not about whether it is iOS. It used to take `isIos`, which meant every
 *    consumer of these helpers went dark on Android the moment Health Connect
 *    shipped — the trends, the readiness snapshot and the wellbeing score's
 *    sleep pillar all silently returned "no data" while the Health Sync screen
 *    said "connected". Vishal hit exactly that.
 *  - On iOS, the gate follows the persisted preference: enabled → fetch/show,
 *    disabled → treat as no-data/disabled regardless of lingering iOS grants.
 *
 * Keep this file PURE — no React, no AsyncStorage, no platform import. Easy to
 * unit-test; callers pass the already-resolved inputs.
 */
export function shouldFetchHealthTrends(
  hasHealthSource: boolean,
  preferenceEnabled: boolean,
): boolean {
  return hasHealthSource && preferenceEnabled
}

/**
 * @deprecated COS-932 — the parameter is "does this platform have a health
 * source", not "is this iOS". Kept so an unconverted caller still compiles,
 * but passing Platform.OS === 'ios' here is now a BUG on Android: it closes
 * the gate for a device that has Health Connect. Use shouldFetchHealthTrends.
 */
export const shouldFetchAppleHealthTrends = shouldFetchHealthTrends

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

export function resolveHealthTrendsState(
  hasHealthSource: boolean,
  preferenceEnabled: boolean,
): AppleHealthTrendsState {
  if (!hasHealthSource) return 'unavailable'
  return preferenceEnabled ? 'enabled' : 'disabled'
}

/** @deprecated COS-932 — see shouldFetchAppleHealthTrends. */
export const resolveAppleHealthTrendsState = resolveHealthTrendsState
