/**
 * COS-1112 — Health Alerts kill-switch.
 *
 * The alert badge puts HealthStatusIcon — react-native-svg plus an Animated
 * loop — into the BODY of the Health Status screen. That component is proven
 * on iOS 26 in the tab bar, and the tab bar is explicitly outside the
 * SVG-free/Animated-free envelope ADR-0003 draws around cold-mount screens.
 * A screen body is a different mount path, which is precisely the distinction
 * that caused the 2026-08-18 production crash.
 *
 * So the same treatment as COS-1094: ship it behind a switch that can be
 * thrown from SSM without an OTA. With the flag off the screen renders exactly
 * as it does today — no badge, no icon, no hook subscriptions.
 *
 * Default-OFF while the query is in flight, matching every sibling flag: never
 * mount the risky path on a guess.
 *
 * SSM key: /cos/{stage}/backend/health_alerts_enabled (+ _beta override).
 */

import { useFeatureFlags } from './use-feature-flags'

const HEALTH_ALERTS_FLAG = 'health_alerts_enabled'

export function useHealthAlertsFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[HEALTH_ALERTS_FLAG] === true
}
