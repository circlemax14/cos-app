/**
 * Apple Health connection preference, persisted to AsyncStorage (COS-389 /
 * SCRUM-530).
 *
 * iOS does NOT reliably expose prior read-permission status — once the user
 * has been prompted, HealthKit returns the same `getAuthStatus` value whether
 * they granted or denied read access (Apple intentionally hides read grants
 * for privacy). So we cannot derive "is Apple Health connected?" from the
 * system. Instead we persist a lightweight local flag recording the user's
 * own choice: they tapped "Enable Apple Health" and the init call resolved.
 *
 * This is intentionally a hint for the toggle UI only — it is NOT a source of
 * truth for whether data will actually flow. The data path
 * (useHealthKitTrends / getTodayHealthMetrics) is unchanged and still requests
 * permission itself, so a stale "enabled" flag never fabricates data.
 *
 * Keep this file PURE — no React, no UI. Easy to unit-test, easy to call from
 * any hook or screen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cos_apple_health_enabled_v1';

/**
 * Returns the user's last recorded Apple Health choice. Defaults to false
 * (not connected) when nothing has been stored yet or the read fails.
 */
export async function getAppleHealthEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

/**
 * Records the user's Apple Health choice. Write failures are non-fatal — the
 * toggle still reflects the in-memory state for the current session.
 */
export async function setAppleHealthEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore — next mount will just fall back to the default.
  }
}
