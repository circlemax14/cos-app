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
  // COS-932 — the readiness snapshot reads resting HR and respiratory rate;
  // without these its Android answer is permanently "no data".
  'RestingHeartRate',
  'RespiratoryRate',
  /*
   * COS-934 — the vitals section renders SEVEN tiles, and three of them had no
   * Android source at all, so they said "no recent data" forever no matter
   * what the patient's watch recorded: steps, blood glucose and HRV.
   * Steps is the worst of the three — READ_STEPS was already granted and the
   * metric simply was not mapped.
   */
  'BloodGlucose',
  'HeartRateVariabilityRmssd',
  /*
   * COS-935 — everything else iOS reads that Health Connect can answer, so
   * "Health Connect returns the data we need, similar to Apple Health" is
   * true rather than aspirational.
   *
   * Height is here only to derive BMI: Health Connect has no BMI record, and
   * iOS gets one from HealthKit. Deriving it from the latest weight and height
   * is the same number by the same formula, rather than a blank tile.
   *
   * NOT here: walking-heart-rate. Health Connect has no equivalent record at
   * all, so it stays iOS-only rather than being faked from resting HR.
   */
  'BodyTemperature',
  'Height',
  'Distance',
  'FloorsClimbed',
  'ExerciseSession',
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
export interface HealthConnectGrantResult {
  granted: boolean;
  /** Safe to show a patient. Null when it simply was not granted. */
  reason: string | null;
}

export async function requestHealthConnectAccess(): Promise<HealthConnectGrantResult> {
  const sdk = loadSdk();
  if (!sdk) return { granted: false, reason: 'Health Connect is not part of this app build.' };
  try {
    if (!(await sdk.initialize())) {
      return { granted: false, reason: 'Could not connect to Health Connect on this device.' };
    }

    const granted = await sdk.requestPermission(
      HEALTH_CONNECT_READ_PERMISSIONS.map((recordType) => ({
        accessType: 'read' as const,
        recordType,
      })),
    );
    if (Array.isArray(granted) && granted.length > 0) return { granted: true, reason: null };

    /*
     * COS-931 — DISTINGUISH "they said no" FROM "we never asked".
     *
     * Vishal: "our main point at this point is we will request for grant, and
     * it is saying that access is not granted. Ideally we should request for
     * it." He is describing a screen that reports refusal without ever showing
     * a dialog, and an empty array cannot tell those apart on its own.
     *
     * Re-reading the granted set after the request is what separates them: if
     * the patient genuinely declined, Health Connect still knows about us and
     * returns an empty list; if the dialog never appeared, the request failed
     * before Health Connect was ever involved. Same distinction, different
     * fix, and the patient needs to be told which.
     */
    const already = await sdk.getGrantedPermissions().catch(() => null);
    if (already === null) {
      return {
        granted: false,
        reason: 'Health Connect did not respond. Open Health Connect in your device settings and check this app is listed.',
      };
    }
    return { granted: false, reason: null };
  } catch (err) {
    /*
     * COS-931 — say what actually failed.
     *
     * This was `catch { return false }`, which is the COS-923 mistake again:
     * four different failures — the permission delegate never registered, the
     * provider package not resolvable, an SDK version mismatch, a genuine
     * refusal — all collapsed into one sentence with nothing to act on, on a
     * path that costs a rebuild to retry.
     *
     * Health Connect's own message names packages and permissions, not
     * patient data, so it carries no PHI.
     */
    const detail =
      (err as { message?: string })?.message?.trim() ??
      (err as { code?: string })?.code ??
      '';
    return {
      granted: false,
      reason: detail
        ? `Health Connect could not complete the request — ${detail}`
        : 'Health Connect could not complete the request.',
    };
  }
}

/** Back-compat boolean for callers that only need yes/no. */
export async function requestHealthConnectPermissions(): Promise<boolean> {
  return (await requestHealthConnectAccess()).granted;
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
/**
 * COS-938 — NOT every aggregate value is a number.
 *
 * The library types ACTIVE_CALORIES_TOTAL and ENERGY_TOTAL as EnergyResult,
 * DISTANCE as LengthResult, the blood-pressure averages as PressureResult and
 * so on — objects like `{ inCalories, inJoules, inKilocalories, inKilojoules }`.
 * Only COUNT_TOTAL and BPM_AVG are plain numbers.
 *
 * The first version read them all with `typeof v === 'number'`, so every
 * unit-carrying metric silently returned 0 — indistinguishable on screen from
 * "the patient has no data", which is exactly the state we were trying to
 * diagnose. A wrong reader looks identical to an empty store.
 */
const unwrap = readAggregate;

async function aggregateToday(
  recordType: HealthConnectRecordType,
): Promise<Record<string, unknown> | null> {
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
    return (result ?? null) as unknown as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

export async function getTodayStepCount(): Promise<number> {
  const agg = await aggregateToday('Steps');
  // COUNT_TOTAL is genuinely a number.
  const count = unwrap(agg?.COUNT_TOTAL, '');
  return count === null ? 0 : Math.round(count);
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
  // BPM_AVG is genuinely a number.
  const avg = unwrap(agg?.BPM_AVG, '');
  return avg !== null && avg > 0 ? Math.round(avg) : null;
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
  // EnergyResult — an OBJECT. See unwrap().
  const activeKcal =
    unwrap(active?.ACTIVE_CALORIES_TOTAL, 'inKilocalories') ??
    unwrap(active?.ENERGY_TOTAL, 'inKilocalories');
  if (activeKcal !== null && activeKcal > 0) return Math.round(activeKcal);

  const total = await aggregateToday('TotalCaloriesBurned');
  const totalKcal = unwrap(total?.ENERGY_TOTAL, 'inKilocalories');
  return totalKcal === null ? 0 : Math.round(totalKcal);
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

/**
 * COS-932 — vital TRENDS from Health Connect, in the shape the app already
 * charts.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────
 *
 * COS-929 wired today's four headline metrics and the Health Sync screen, and
 * stopped there. Every consumer of longitudinal data — the vitals section, the
 * readiness snapshot, the wellbeing score's sleep pillar — still asked
 * HealthKit, so on Android they showed "no data yet" while the Health Sync
 * screen said "connected". Vishal: "if I go to the vitals it is saying Health
 * Connect for Android coming soon... well-being score also doesn't have it
 * because for sleep it is saying no data yet."
 *
 * ─── THE SAME metricCode AS iOS, DELIBERATELY ────────────────────────
 *
 * VITAL_SPECS is imported from services/health.ts rather than re-declared.
 * metricCode is what the vitals section, the readiness snapshot and the
 * wellbeing score all key on, so minting Android-specific codes would make the
 * same measurement a different metric depending on the patient's phone — and
 * a patient switching device would lose their history.
 *
 * ─── ONLY WHAT WE HAVE PERMISSION FOR ────────────────────────────────
 *
 * HealthKit charts sixteen metrics. Health Connect can supply most, but each
 * needs its own manifest permission, and every extra permission is another row
 * the patient has to decide about on Health Connect's consent screen. So this
 * covers the eight that the vitals section and the readiness snapshot actually
 * read, and returns nothing for the rest rather than asking for access we
 * would not use.
 */

import { readAggregate, readQuantity } from '@/lib/health-connect-quantity';
import type { LongitudinalTrend, TrendDataPoint } from './api/types';
import { VITAL_SPECS, type HealthKitVitalMetric } from './health';

/**
 * Which Health Connect record answers each metric, and how to read a number
 * out of one of its samples.
 *
 * A record can carry several fields (BloodPressure has both systolic and
 * diastolic), so the reader is per-metric rather than per-record.
 */
const TREND_SOURCES: Partial<
  Record<
    HealthKitVitalMetric,
    { recordType: string; read: (r: Record<string, unknown>) => number | null }
  >
> = {
  'heart-rate': {
    recordType: 'HeartRate',
    // HeartRate is a SERIES record: one record holds many samples.
    read: (r) => {
      const samples = r.samples as { beatsPerMinute?: number }[] | undefined;
      if (!Array.isArray(samples) || samples.length === 0) return null;
      const nums = samples.map((s) => s.beatsPerMinute).filter((n): n is number => typeof n === 'number');
      return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
    },
  },
  'resting-heart-rate': {
    recordType: 'RestingHeartRate',
    read: (r) => (typeof r.beatsPerMinute === 'number' ? Math.round(r.beatsPerMinute) : null),
  },
  'respiratory-rate': {
    recordType: 'RespiratoryRate',
    read: (r) => (typeof r.rate === 'number' ? Math.round(r.rate * 10) / 10 : null),
  },
  'blood-pressure-systolic': {
    recordType: 'BloodPressure',
    // COS-938 — a record carries { value, unit }, NOT { inMillimetersOfMercury }.
    read: (r) => {
      const v = readQuantity(r.systolic, 'pressure-mmhg');
      return v === null ? null : Math.round(v);
    },
  },
  'blood-pressure-diastolic': {
    recordType: 'BloodPressure',
    read: (r) => {
      const v = readQuantity(r.diastolic, 'pressure-mmhg');
      return v === null ? null : Math.round(v);
    },
  },
  'oxygen-saturation': {
    recordType: 'OxygenSaturation',
    // percentage is a plain number on this record; readQuantity accepts both.
    read: (r) => {
      const v = readQuantity(r.percentage, 'pressure-mmhg');
      return v === null ? null : Math.round(v);
    },
  },
  'active-energy': {
    recordType: 'ActiveCaloriesBurned',
    read: (r) => {
      const v = readQuantity(r.energy, 'energy-kcal');
      return v === null ? null : Math.round(v);
    },
  },
  steps: {
    recordType: 'Steps',
    read: (r) => (typeof r.count === 'number' ? Math.round(r.count) : null),
  },
  'blood-glucose': {
    recordType: 'BloodGlucose',
    read: (r) => {
      const v = readQuantity(r.level, 'glucose-mgdl');
      return v === null ? null : Math.round(v);
    },
  },
  'heart-rate-variability': {
    recordType: 'HeartRateVariabilityRmssd',
    read: (r) =>
      typeof r.heartRateVariabilityMillis === 'number'
        ? Math.round(r.heartRateVariabilityMillis * 10) / 10
        : null,
  },
  'body-temperature': {
    recordType: 'BodyTemperature',
    // iOS reports Fahrenheit. readQuantity handles the offset scale, which a
    // plain multiplier would get wrong.
    read: (r) => {
      const v = readQuantity(r.temperature, 'temperature-f');
      return v === null ? null : Math.round(v);
    },
  },
  weight: {
    recordType: 'Weight',
    // iOS reports pounds. The unit is read, not assumed: Health Connect stores
    // whatever the writing app chose, so the same field can arrive in kilograms
    // from one app and pounds from another on the same device.
    read: (r) => {
      const v = readQuantity(r.weight, 'mass-lb');
      return v === null ? null : Math.round(v * 10) / 10;
    },
  },
  'distance-walking-running': {
    recordType: 'Distance',
    // iOS reports miles.
    read: (r) => {
      const v = readQuantity(r.distance, 'length-miles');
      return v === null ? null : Math.round(v * 100) / 100;
    },
  },
  'flights-climbed': {
    recordType: 'FloorsClimbed',
    read: (r) => (typeof r.floors === 'number' ? Math.round(r.floors) : null),
  },
  'exercise-time': {
    recordType: 'ExerciseSession',
    read: (r) => {
      const ms = new Date(String(r.endTime)).getTime() - new Date(String(r.startTime)).getTime();
      // iOS reports minutes.
      return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : null;
    },
  },
  'sleep-hours': {
    recordType: 'SleepSession',
    read: (r) => {
      const start = new Date(String(r.startTime)).getTime();
      const end = new Date(String(r.endTime)).getTime();
      const ms = end - start;
      return Number.isFinite(ms) && ms > 0 ? Math.round((ms / 3_600_000) * 10) / 10 : null;
    },
  },
};

/** Same direction rule the backend uses, so a trend reads consistently. */
function direction(points: TrendDataPoint[]): LongitudinalTrend['trendDirection'] {
  if (points.length < 3) return 'insufficient_data';
  const half = Math.floor(points.length / 2);
  const mean = (xs: TrendDataPoint[]) => xs.reduce((a, p) => a + p.value, 0) / xs.length;
  const early = mean(points.slice(0, half));
  const late = mean(points.slice(-half));
  if (early === 0) return 'stable';
  const pct = ((late - early) / Math.abs(early)) * 100;
  if (Math.abs(pct) < 5) return 'stable';
  return pct > 0 ? 'improving' : 'worsening';
}

/**
 * One metric's trend over `daysBack` days, or null when there is nothing to
 * chart. Never throws — an absent permission and an absent wearable are the
 * same answer to a patient.
 */
export async function getHealthConnectVitalTrend(
  metric: HealthKitVitalMetric,
  daysBack = 90,
): Promise<LongitudinalTrend | null> {
  // BMI is derived, not read — route it before the record lookup.
  if (metric === 'body-mass-index') return deriveBmiTrend(daysBack);

  const sourceSpec = TREND_SOURCES[metric];
  const spec = VITAL_SPECS[metric];
  if (!sourceSpec || !spec) return null;

  const sdk = loadSdk();
  if (!sdk) return null;
  try {
    if (!(await sdk.initialize())) return null;
    const now = new Date();
    const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const { records } = (await sdk.readRecords(sourceSpec.recordType as never, {
      timeRangeFilter: {
        operator: 'between',
        startTime: from.toISOString(),
        endTime: now.toISOString(),
      },
    })) as unknown as { records: Record<string, unknown>[] };
    if (!Array.isArray(records) || records.length === 0) return null;

    /*
     * One point per DAY, not per sample. A watch can write a heart rate every
     * few minutes; charting 20,000 raw points would be unreadable and would
     * make the trend direction meaningless. Daily means match what the backend
     * serves for lab trends, so the two render identically.
     */
    const byDay = new Map<string, number[]>();
    for (const r of records) {
      const value = sourceSpec.read(r);
      if (value === null) continue;
      const when = String(r.startTime ?? r.time ?? '');
      const day = when.slice(0, 10);
      if (!day) continue;
      const list = byDay.get(day) ?? [];
      list.push(value);
      byDay.set(day, list);
    }

    const dataPoints: TrendDataPoint[] = [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, values]) => ({
        date: day,
        value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
        unit: spec.unit,
      }));
    if (dataPoints.length === 0) return null;

    return {
      id: `hc-${spec.metricCode}`,
      metricCode: spec.metricCode,
      metricName: spec.metricName,
      category: 'vital',
      dataPoints,
      trendDirection: direction(dataPoints),
      trendPeriod: `${String(daysBack)}d`,
      relatedConditions: [],
      relatedMedications: [],
      // Same provenance marker iOS uses. The UI shows "from your device"
      // rather than naming Apple, so one value is correct for both.
      source: 'apple-health',
    };
  } catch {
    return null;
  }
}

/**
 * COS-935 — BMI, which Health Connect does not store.
 *
 * HealthKit has a BodyMassIndex record; Health Connect does not. Rather than
 * leave the tile permanently blank on Android, it is computed from the same
 * two measurements a clinician would use — the latest weight and the latest
 * height, both of which Health Connect DOES hold.
 *
 * Height is read once and reused for every weight point: people are weighed
 * often and measured rarely, so pairing each weight with the nearest height
 * reading would mostly pair it with the same value anyway, and would produce
 * gaps on every day with no height record.
 *
 * Returns null rather than a guess when either is missing. A BMI computed from
 * an assumed height is a clinical number that nobody measured.
 */
async function deriveBmiTrend(daysBack: number): Promise<LongitudinalTrend | null> {
  const spec = VITAL_SPECS['body-mass-index'];
  if (!spec) return null;
  const sdk = loadSdk();
  if (!sdk) return null;
  try {
    if (!(await sdk.initialize())) return null;
    const now = new Date();
    // Height is looked up over a long window: it changes rarely and a patient
    // may not have recorded one inside the trend window at all.
    const heightFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const { records: heights } = (await sdk.readRecords('Height' as never, {
      timeRangeFilter: {
        operator: 'between',
        startTime: heightFrom.toISOString(),
        endTime: now.toISOString(),
      },
    })) as unknown as { records: Record<string, unknown>[] };
    // COS-938 — a Height RECORD is { value, unit }. Read in miles then convert,
    // because that is the one length target readQuantity knows; metres is what
    // BMI needs.
    const latestHeightM = (heights ?? [])
      .map((r) => {
        const miles = readQuantity(r.height, 'length-miles');
        return miles === null ? null : miles * 1609.344;
      })
      .filter((n): n is number => typeof n === 'number' && n > 0)
      .pop();
    if (!latestHeightM) return null;

    const weightTrend = await getHealthConnectVitalTrend('weight', daysBack);
    if (!weightTrend || weightTrend.dataPoints.length === 0) return null;

    const dataPoints = weightTrend.dataPoints.map((p) => ({
      date: p.date,
      // weight points are in POUNDS (see the weight reader) -> kg for BMI.
      value: Math.round((p.value / 2.20462 / (latestHeightM * latestHeightM)) * 10) / 10,
      unit: spec.unit,
    }));

    return {
      id: `hc-${spec.metricCode}`,
      metricCode: spec.metricCode,
      metricName: spec.metricName,
      category: 'vital',
      dataPoints,
      trendDirection: direction(dataPoints),
      trendPeriod: `${String(daysBack)}d`,
      relatedConditions: [],
      relatedMedications: [],
      source: 'apple-health',
    };
  } catch {
    return null;
  }
}

/** Every metric Health Connect can answer. Failures are per-metric. */
export async function getAllHealthConnectVitalTrends(
  daysBack = 90,
): Promise<LongitudinalTrend[]> {
  const metrics = Object.keys(TREND_SOURCES) as HealthKitVitalMetric[];
  const results = await Promise.all([
    ...metrics.map((m) => getHealthConnectVitalTrend(m, daysBack).catch(() => null)),
    // BMI has no record of its own — see deriveBmiTrend.
    deriveBmiTrend(daysBack).catch(() => null),
  ]);
  return results.filter((t): t is LongitudinalTrend => t !== null);
}
