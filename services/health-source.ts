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
import type { LongitudinalTrend } from './api/types';
import type { HealthKitVitalMetric } from './health';
import {
  resolveHealthSourceIdentity,
  type HealthSourceIdentity,
} from '@/lib/health-source-identity';
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

/**
 * What the patient calls it, on THEIR device.
 *
 * COS-930 — this used to return "Health Connect" on Android, which is the API
 * name and not a thing anyone has an icon for. The brand is what someone
 * recognises: "Samsung Health" on a Samsung, "Apple Health" on an iPhone.
 * lib/health-source-identity.ts owns that mapping and explains why only
 * Samsung is named.
 *
 * Platform.constants.Manufacturer is Android-only and absent on iOS, where it
 * is not read anyway.
 */
export function healthSourceIdentity(): HealthSourceIdentity {
  const manufacturer =
    Platform.OS === 'android'
      ? ((Platform.constants as { Manufacturer?: string } | undefined)?.Manufacturer ?? null)
      : null;
  return resolveHealthSourceIdentity(Platform.OS, manufacturer);
}

/** Just the brand, for inline use in a sentence. */
export function healthSourceLabel(): string {
  return healthSourceIdentity().label;
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
export interface HealthAccessResult {
  granted: boolean;
  /** Safe to show. Null means "declined", with nothing more to explain. */
  reason: string | null;
}

export async function requestHealthSourceAccess(): Promise<HealthAccessResult> {
  const source = activeHealthSource();
  if (source === 'apple-health') {
    // HealthKit's init IS the prompt, and iOS gives no reason back.
    return { granted: await healthKit.initializeHealthKit(), reason: null };
  }
  if (source === 'health-connect') return healthConnect.requestHealthConnectAccess();
  return { granted: false, reason: null };
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

/**
 * COS-932 — trends from whichever source is active.
 *
 * These are what the vitals section, the readiness snapshot and the wellbeing
 * score read. Before this they called HealthKit directly, so on Android they
 * returned nothing while the Health Sync screen said "connected" — the exact
 * split Vishal saw.
 */
export async function getAllHealthSourceVitalTrends(
  daysBack = 90,
): Promise<LongitudinalTrend[]> {
  const source = activeHealthSource();
  if (source === 'apple-health') return healthKit.getAllHealthKitVitalTrends(daysBack);
  if (source === 'health-connect') return healthConnect.getAllHealthConnectVitalTrends(daysBack);
  return [];
}

/** One metric. Null when this source cannot answer it. */
export async function getHealthSourceVitalTrend(
  metric: HealthKitVitalMetric,
  daysBack = 90,
): Promise<LongitudinalTrend | null> {
  const source = activeHealthSource();
  if (source === 'apple-health') return healthKit.getHealthKitVitalTrend(metric, daysBack);
  if (source === 'health-connect') return healthConnect.getHealthConnectVitalTrend(metric, daysBack);
  return null;
}
