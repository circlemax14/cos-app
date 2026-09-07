/**
 * COS-929 — Health Connect, the Android counterpart to services/health.ts.
 *
 * Vishal, on the S26: "in the left panel, I don't have any health sync screen.
 * Why health sync screen is not there? We already built that one."
 *
 * The screen existed; it had nothing to read. HealthKit is iOS-only, so the
 * drawer row was gated to iOS with a comment saying to drop the gate once an
 * Android build existed. This is what goes behind it.
 *
 * ─── WHY HEALTH CONNECT SPECIFICALLY ─────────────────────────────────
 *
 * Samsung Health, Fitbit, Google Fit, Wear OS and Galaxy Watch all WRITE INTO
 * Health Connect. Reading one API therefore picks all of them up, exactly as
 * reading HealthKit picks up Apple Watch on iOS. Integrating Samsung Health
 * directly would be one vendor's SDK for one vendor's watch; this is the same
 * shape of decision Apple already made for us on the other platform.
 *
 * ─── THE RULE THAT MATTERS CLINICALLY ────────────────────────────────
 *
 * ONE ACTIVE SOURCE, NEVER A MERGED SET. Health Connect already aggregates
 * across the apps that write to it, so summing our reading of Health Connect
 * with anything else double-counts. A step count that is 1.9x reality is not a
 * cosmetic bug on a platform that feeds BMI, the health age and the care plan.
 * services/health-source.ts enforces the single-source choice; this file only
 * ever answers for Health Connect.
 *
 * ─── SHAPE MIRRORS services/health.ts DELIBERATELY ───────────────────
 *
 * Same function names minus the HealthKit prefix, same return types, same
 * "never throw, return a safe zero" contract. The facade can then be a
 * straight delegation with no adaptation layer, and a reader comparing the two
 * files can see they answer the same questions.
 *
 * ─── EVERY PATH IS NON-FATAL ─────────────────────────────────────────
 *
 * Health Connect is absent on Android < 14 unless the user installed it, can
 * be present but need an update, and can be present with every permission
 * denied. None of those is exceptional and none may take a screen down — they
 * are all "no data", which is what a patient with no wearable also looks like.
 */

import { Platform } from 'react-native';

import type { HealthMetrics } from './health';

/** Mirrors services/health.ts's own guard style: resolve the SDK lazily. */
type HealthConnectModule = typeof import('react-native-health-connect');

/**
 * The permissions we ask for, and nothing more.
 *
 * Deliberately read-only and deliberately short: Health Connect shows this
 * list verbatim to the patient, and every extra row is a thing they have to
 * decide about. These are exactly the four metrics getTodayHealthMetrics
 * returns plus the vitals the trends screen charts.
 */
export const HEALTH_CONNECT_READ_PERMISSIONS = [
  'Steps',
  'HeartRate',
  'SleepSession',
  'TotalCaloriesBurned',
  'ActiveCaloriesBurned',
  'Weight',
  'BloodPressure',
  'OxygenSaturation',
] as const;

export type HealthConnectRecordType = (typeof HEALTH_CONNECT_READ_PERMISSIONS)[number];

/**
 * Load the SDK.
 *
 * Required lazily for the same reason services/native-store-billing.ts does
 * it: importing a native module at module scope makes any screen that
 * transitively imports this file crash on a platform where the module is
 * absent. Returns null instead of throwing.
 */
function loadSdk(): HealthConnectModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
    return require('react-native-health-connect') as HealthConnectModule;
  } catch {
    return null;
  }
}

/**
 * Is Health Connect usable on this device RIGHT NOW?
 *
 * Three distinct answers collapse to false here, and the screen distinguishes
 * them via `getHealthConnectStatus` — this is the boolean the data paths want.
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  return (await getHealthConnectStatus()) === 'available';
}

export type HealthConnectStatus =
  /** Installed, up to date, ready to be asked for permissions. */
  | 'available'
  /** Not installed. On Android 13 and below it is a Play Store download. */
  | 'not-installed'
  /** Installed but too old for this client — the patient must update it. */
  | 'update-required'
  /** Not Android at all. */
  | 'not-applicable';

/**
 * Which of the three "no" answers applies.
 *
 * Kept separate from the boolean because they need different copy and
 * different buttons: "install it" and "update it" are actions the patient can
 * take, and telling them "unavailable" for either is a dead end.
 */
export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  const sdk = loadSdk();
  if (!sdk) return 'not-applicable';
  try {
    const status = await sdk.getSdkStatus();
    // The library exposes these as an enum; compare numerically via its own
    // constants rather than hard-coding, so an SDK bump cannot silently
    // re-map them.
    const { SdkAvailabilityStatus } = sdk as unknown as {
      SdkAvailabilityStatus: Record<string, number>;
    };
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return 'update-required';
    }
    return 'not-installed';
  } catch {
    return 'not-installed';
  }
}

/** Initialise the client. Safe to call repeatedly. */
export async function initializeHealthConnect(): Promise<boolean> {
  const sdk = loadSdk();
  if (!sdk) return false;
  try {
    return await sdk.initialize();
  } catch {
    return false;
  }
}

/**
 * Ask for read access.
 *
 * Returns whether we ended up with ANY of the permissions, because Health
 * Connect lets the patient grant them individually — an all-or-nothing return
 * would report failure for someone who happily shared their steps but not
 * their heart rate.
 */
export async function requestHealthConnectPermissions(): Promise<boolean> {
  const sdk = loadSdk();
  if (!sdk) return false;
  try {
    if (!(await sdk.initialize())) return false;
    const granted = await sdk.requestPermission(
      HEALTH_CONNECT_READ_PERMISSIONS.map((recordType) => ({
        accessType: 'read' as const,
        recordType,
      })),
    );
    return Array.isArray(granted) && granted.length > 0;
  } catch {
    return false;
  }
}

/** Which permissions the patient has actually granted. */
export async function getGrantedHealthConnectPermissions(): Promise<string[]> {
  const sdk = loadSdk();
  if (!sdk) return [];
  try {
    if (!(await sdk.initialize())) return [];
    const granted = await sdk.getGrantedPermissions();
    return Array.isArray(granted) ? granted.map((p) => String(p.recordType)) : [];
  } catch {
    return [];
  }
}

/** Open Health Connect's own settings, for revoking or managing access. */
export async function openHealthConnectSettings(): Promise<void> {
  const sdk = loadSdk();
  try {
    await sdk?.openHealthConnectSettings();
  } catch {
    /* the patient can reach it from system settings; never throw from a tap */
  }
}

/** Local midnight to now — the same window services/health.ts uses. */
function todayRange(): { operator: 'between'; startTime: string; endTime: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { operator: 'between', startTime: start.toISOString(), endTime: now.toISOString() };
}

/**
 * Aggregate one record type over today.
 *
 * `aggregateRecord` rather than reading raw records and summing: Health
 * Connect de-duplicates across the apps that wrote them, and summing raw
 * records ourselves would double-count a user whose phone AND watch both
 * recorded the same walk. This is the same trap as merging sources, one level
 * down.
 */
async function aggregateToday(
  recordType: HealthConnectRecordType,
): Promise<Record<string, number> | null> {
  const sdk = loadSdk();
  if (!sdk) return null;
  try {
    if (!(await sdk.initialize())) return null;
    const result = await sdk.aggregateRecord({
      recordType,
      timeRangeFilter: todayRange(),
    } as never);
    // Through `unknown`: the SDK's AggregateResult carries a dataOrigins
    // string[] alongside the numeric buckets, so it does not structurally
    // overlap a Record<string, number>. Every read below re-checks the value
    // is a finite number, so the widening is guarded at the point of use.
    return (result ?? null) as unknown as Record<string, number> | null;
  } catch {
    return null;
  }
}

export async function getTodayStepCount(): Promise<number> {
  const agg = await aggregateToday('Steps');
  const count = agg?.COUNT_TOTAL;
  return typeof count === 'number' && Number.isFinite(count) ? Math.round(count) : 0;
}

/**
 * Today's resting-ish heart rate.
 *
 * Health Connect's aggregate gives BPM_AVG over the window. services/health.ts
 * returns the most recent sample on iOS, so these are not identical
 * measurements — but an average over the day is the more stable of the two and
 * the screen labels it as today's heart rate, not "right now".
 */
export async function getTodayHeartRate(): Promise<number | null> {
  const agg = await aggregateToday('HeartRate');
  const avg = agg?.BPM_AVG;
  return typeof avg === 'number' && Number.isFinite(avg) && avg > 0 ? Math.round(avg) : null;
}

export async function getTodaySleepHours(): Promise<number> {
  const sdk = loadSdk();
  if (!sdk) return 0;
  try {
    if (!(await sdk.initialize())) return 0;
    /*
     * Sleep is read as records, not aggregated: a session that started last
     * night before midnight is the one the patient means by "last night", and
     * an aggregate over today-only would cut it in half. The window therefore
     * starts 24h back and we take the longest session that ENDS today.
     */
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { records } = (await sdk.readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between',
        startTime: from.toISOString(),
        endTime: now.toISOString(),
      },
    })) as unknown as { records: { startTime: string; endTime: string }[] };
    if (!Array.isArray(records) || records.length === 0) return 0;
    const longestMs = records.reduce((best, r) => {
      const ms = new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
      return Number.isFinite(ms) && ms > best ? ms : best;
    }, 0);
    return longestMs > 0 ? Math.round((longestMs / 3_600_000) * 10) / 10 : 0;
  } catch {
    return 0;
  }
}

/**
 * Calories burned today.
 *
 * TotalCaloriesBurned includes basal metabolic rate; ActiveCaloriesBurned does
 * not. HealthKit's ActiveEnergyBurned — what services/health.ts reads — is the
 * active figure, so Active is tried first and Total is only a fallback. Mixing
 * the two would make the same patient's number jump by roughly their BMR
 * depending on which device wrote the data.
 */
export async function getTodayCaloriesBurned(): Promise<number> {
  const active = await aggregateToday('ActiveCaloriesBurned');
  const activeKcal = active?.ACTIVE_CALORIES_TOTAL ?? active?.ENERGY_TOTAL;
  if (typeof activeKcal === 'number' && Number.isFinite(activeKcal) && activeKcal > 0) {
    return Math.round(activeKcal);
  }
  const total = await aggregateToday('TotalCaloriesBurned');
  const totalKcal = total?.ENERGY_TOTAL;
  return typeof totalKcal === 'number' && Number.isFinite(totalKcal) ? Math.round(totalKcal) : 0;
}

/**
 * All four metrics, in the shape services/health.ts returns.
 *
 * Fetched in parallel and individually failure-tolerant: a patient who granted
 * steps but not heart rate gets their steps, not an error.
 */
export async function getTodayHealthMetrics(): Promise<HealthMetrics> {
  if (!(await isHealthConnectAvailable())) {
    return {
      steps: 0,
      heartRate: null,
      sleepHours: 0,
      caloriesBurned: 0,
      isLoading: false,
      error: 'Health Connect is not available on this device',
    };
  }
  const [steps, heartRate, sleepHours, caloriesBurned] = await Promise.all([
    getTodayStepCount(),
    getTodayHeartRate(),
    getTodaySleepHours(),
    getTodayCaloriesBurned(),
  ]);
  return { steps, heartRate, sleepHours, caloriesBurned, isLoading: false, error: null };
}
