/**
 * COS-929 — one health source per platform, chosen here and nowhere else.
 *
 * iOS reads HealthKit (services/health.ts). Android reads Health Connect
 * (services/health-connect.ts). Callers ask this file and never both.
 *
 * ─── WHY A SINGLE ACTIVE SOURCE IS A CLINICAL REQUIREMENT ────────────
 *
 * The tempting shape is "collect from every source and merge". It is wrong,
 * and not in a cosmetic way.
 *
 * Health Connect ALREADY aggregates across every app that writes to it —
 * Samsung Health, Fitbit, Google Fit, Wear OS, Galaxy Watch. HealthKit does
 * the same on iOS for Apple Watch and anything else writing there. So any
 * merge we perform on top double-counts: a patient wearing a watch that syncs
 * to both would show roughly 2x their real step count.
 *
 * That number is not decoration. `height_in`/`weight_lb` feed BMI, steps and
 * sleep feed the readiness snapshot and the wellbeing score, and those feed
 * the health age and the care plan. A doubled step count silently improves a
 * patient's assessed health.
 *
 * So: exactly one source is active, it is determined by the platform, and
 * there is no configuration that can turn two on at once. The type system
 * helps — `activeHealthSource()` returns one id, not a list.
 *
 * ─── WHY THE PREFERENCE STILL APPLIES ────────────────────────────────
 *
 * services/apple-health-preference.ts is the patient's own on/off switch, and
 * it is authoritative on BOTH platforms — see lib/apple-health-gate.ts for why
 * the OS-level grant cannot be trusted as intent on iOS. The same preference
 * key governs Health Connect, because to the patient it is one setting called
 * "Health Sync"; splitting it would let someone disable it on their iPhone and
 * find it still on when they open the app on a tablet.
 */

import { Platform } from 'react-native';

import type { HealthMetrics } from './health';
import * as healthKit from './health';
import * as healthConnect from './health-connect';

/** The one source that can be active on this platform. Never a set. */
export type HealthSourceId = 'apple-health' | 'health-connect' | 'none';

/**
 * Which source this platform reads. Derived from the platform, not stored:
 * a persisted value could drift from the binary it is running in.
 */
export function activeHealthSource(): HealthSourceId {
  if (Platform.OS === 'ios') return 'apple-health';
  if (Platform.OS === 'android') return 'health-connect';
  return 'none';
}

/** What the patient calls it. Used in copy, so it must read naturally inline. */
export function healthSourceLabel(id: HealthSourceId = activeHealthSource()): string {
  if (id === 'apple-health') return 'Apple Health';
  if (id === 'health-connect') return 'Health Connect';
  return 'your health app';
}

/**
 * Is the source usable on this device right now?
 *
 * Async because Health Connect's answer requires an SDK round trip, where
 * HealthKit's is a synchronous module check. Callers get one contract.
 */
export async function isHealthSourceAvailable(): Promise<boolean> {
  const source = activeHealthSource();
  if (source === 'apple-health') return healthKit.isHealthKitAvailable();
  if (source === 'health-connect') return healthConnect.isHealthConnectAvailable();
  return false;
}

/**
 * Ask for permission, having initialised first.
 *
 * The two platforms differ in shape — HealthKit's init IS the permission
 * prompt, Health Connect separates them — so the difference is absorbed here
 * rather than at every call site.
 */
export async function requestHealthSourceAccess(): Promise<boolean> {
  const source = activeHealthSource();
  if (source === 'apple-health') return healthKit.initializeHealthKit();
  if (source === 'health-connect') return healthConnect.requestHealthConnectPermissions();
  return false;
}

/**
 * Today's four headline metrics, from whichever source is active.
 *
 * Both implementations return the same HealthMetrics shape and neither throws,
 * so this is a straight delegation with no adaptation.
 */
export async function getTodayHealthMetrics(): Promise<HealthMetrics> {
  const source = activeHealthSource();
  if (source === 'apple-health') return healthKit.getTodayHealthMetrics();
  if (source === 'health-connect') return healthConnect.getTodayHealthMetrics();
  return {
    steps: 0,
    heartRate: null,
    sleepHours: 0,
    caloriesBurned: 0,
    isLoading: false,
    error: 'No health source on this platform',
  };
}
