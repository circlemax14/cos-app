/**
 * SCRUM-272 — Android Health Connect bridge.
 *
 * Mirrors the Apple HealthKit integration in `services/health.ts` so the
 * Result Trends carousel + Home metrics card render the same way on
 * Android. Uses `react-native-health-connect`, which is the official
 * Health Connect SDK successor to Google Fit.
 *
 * Health Connect requires Android API 26+ (most production phones) plus
 * the Health Connect app installed. On Android 14+ Health Connect is
 * part of the OS; on older versions the user installs it from the Play
 * Store. We surface a friendly empty state on devices where the SDK
 * reports unavailable.
 *
 * Privacy stance: read-only for v1. We mirror the iOS pattern — data
 * stays on the device and renders client-side; no backend ingest.
 */

import { Platform } from 'react-native'
import type { LongitudinalTrend, TrendDataPoint } from './api/types'

let healthConnect: typeof import('react-native-health-connect') | null = null
try {
  // Lazy require so iOS doesn't pay the native-bridge cost.
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    healthConnect = require('react-native-health-connect') as typeof import('react-native-health-connect')
  }
} catch {
  healthConnect = null
}

/** SDK availability on the current device. */
export type HealthConnectStatus = 'available' | 'provider-update-required' | 'not-installed' | 'unsupported'

export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  if (Platform.OS !== 'android' || !healthConnect) return 'unsupported'
  try {
    const status = await healthConnect.getSdkStatus()
    switch (status) {
      case healthConnect.SdkAvailabilityStatus.SDK_AVAILABLE:
        return 'available'
      case healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED:
        return 'provider-update-required'
      case healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE:
        return 'not-installed'
      default:
        return 'unsupported'
    }
  } catch {
    return 'unsupported'
  }
}

/** Read-record-type → user-facing metric. Mirrors HealthKitVitalMetric. */
export type HealthConnectMetric =
  | 'steps'
  | 'distance-walking-running'
  | 'flights-climbed'
  | 'active-energy'
  | 'exercise-time'
  | 'heart-rate'
  | 'resting-heart-rate'
  | 'heart-rate-variability'
  | 'blood-pressure-systolic'
  | 'blood-pressure-diastolic'
  | 'blood-glucose'
  | 'body-temperature'
  | 'oxygen-saturation'
  | 'respiratory-rate'
  | 'weight'
  | 'body-mass-index'
  | 'body-fat-percentage'
  | 'lean-body-mass'
  | 'height'
  | 'sleep-hours'
  | 'vo2-max'
  | 'walking-speed'
  | 'water-intake'
  | 'mindful-minutes'

interface HCSpec {
  metricCode: string
  metricName: string
  /** Health Connect record type as accepted by `readRecords`. */
  recordType: string
  /** Health Connect permission identifier. */
  permission: string
  unit: string
  refRange: { low: number; high: number }
  /** How to reduce multiple records in one day into a single point. */
  dayReducer?: 'mean' | 'sum'
  /** Optional scaler — e.g. m → km. */
  scale?: (v: number) => number
  /** Extractor: pulls the numeric value out of a Health Connect record. */
  extract: (record: Record<string, unknown>) => number | null
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

function inValue(rec: Record<string, unknown>, key = 'count'): number | null {
  const obj = rec[key] as Record<string, unknown> | number | undefined
  if (typeof obj === 'number') return num(obj)
  if (obj && typeof obj === 'object') {
    return num((obj as Record<string, unknown>).inMilligrams ?? (obj as Record<string, unknown>).inMeters ?? (obj as Record<string, unknown>).inKilograms ?? (obj as Record<string, unknown>).inCelsius ?? (obj as Record<string, unknown>).inMillimetersOfMercury ?? (obj as Record<string, unknown>).inMilligramsPerDeciliter)
  }
  return null
}

const HC_SPECS: Record<HealthConnectMetric, HCSpec> = {
  steps: {
    metricCode: 'hc-steps',
    metricName: 'Steps',
    recordType: 'Steps',
    permission: 'Steps',
    unit: 'steps',
    refRange: { low: 7000, high: 12000 },
    dayReducer: 'sum',
    extract: (r) => num(r.count),
  },
  'distance-walking-running': {
    metricCode: 'hc-distance',
    metricName: 'Distance',
    recordType: 'Distance',
    permission: 'Distance',
    unit: 'km',
    refRange: { low: 5, high: 10 },
    dayReducer: 'sum',
    scale: (v) => v / 1000,
    extract: (r) => inValue(r, 'distance'),
  },
  'flights-climbed': {
    metricCode: 'hc-floors',
    metricName: 'Flights Climbed',
    recordType: 'FloorsClimbed',
    permission: 'FloorsClimbed',
    unit: 'floors',
    refRange: { low: 5, high: 20 },
    dayReducer: 'sum',
    extract: (r) => num(r.floors),
  },
  'active-energy': {
    metricCode: 'hc-active-energy',
    metricName: 'Active Calories',
    recordType: 'ActiveCaloriesBurned',
    permission: 'ActiveCaloriesBurned',
    unit: 'kcal',
    refRange: { low: 250, high: 600 },
    dayReducer: 'sum',
    extract: (r) => {
      const e = r.energy as Record<string, unknown> | undefined
      if (e && typeof e === 'object') return num((e as Record<string, unknown>).inKilocalories)
      return null
    },
  },
  'exercise-time': {
    metricCode: 'hc-exercise-time',
    metricName: 'Exercise Time',
    recordType: 'ExerciseSession',
    permission: 'ExerciseSession',
    unit: 'min',
    refRange: { low: 30, high: 60 },
    dayReducer: 'sum',
    extract: (r) => {
      // duration in milliseconds between startTime + endTime
      const s = r.startTime as string | undefined
      const e = r.endTime as string | undefined
      if (!s || !e) return null
      return Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000)
    },
  },
  'heart-rate': {
    metricCode: 'hc-heart-rate',
    metricName: 'Heart Rate',
    recordType: 'HeartRate',
    permission: 'HeartRate',
    unit: 'bpm',
    refRange: { low: 60, high: 100 },
    extract: (r) => {
      // HeartRate is a series; the SDK returns samples[]
      const samples = r.samples as { beatsPerMinute?: number }[] | undefined
      if (Array.isArray(samples) && samples.length > 0) {
        const valid = samples.map((s) => s.beatsPerMinute ?? 0).filter((v) => v > 0)
        if (valid.length === 0) return null
        return valid.reduce((a, b) => a + b, 0) / valid.length
      }
      return num(r.beatsPerMinute)
    },
  },
  'resting-heart-rate': {
    metricCode: 'hc-resting-hr',
    metricName: 'Resting Heart Rate',
    recordType: 'RestingHeartRate',
    permission: 'RestingHeartRate',
    unit: 'bpm',
    refRange: { low: 50, high: 70 },
    extract: (r) => num(r.beatsPerMinute),
  },
  'heart-rate-variability': {
    metricCode: 'hc-hrv',
    metricName: 'Heart Rate Variability',
    recordType: 'HeartRateVariabilityRmssd',
    permission: 'HeartRateVariabilityRmssd',
    unit: 'ms',
    refRange: { low: 30, high: 80 },
    extract: (r) => num(r.heartRateVariabilityMillis),
  },
  'blood-pressure-systolic': {
    metricCode: 'hc-bp-systolic',
    metricName: 'Blood Pressure (Systolic)',
    recordType: 'BloodPressure',
    permission: 'BloodPressure',
    unit: 'mmHg',
    refRange: { low: 90, high: 120 },
    extract: (r) => {
      const sys = r.systolic as Record<string, unknown> | undefined
      if (sys) return num((sys as Record<string, unknown>).inMillimetersOfMercury)
      return null
    },
  },
  'blood-pressure-diastolic': {
    metricCode: 'hc-bp-diastolic',
    metricName: 'Blood Pressure (Diastolic)',
    recordType: 'BloodPressure',
    permission: 'BloodPressure',
    unit: 'mmHg',
    refRange: { low: 60, high: 80 },
    extract: (r) => {
      const dia = r.diastolic as Record<string, unknown> | undefined
      if (dia) return num((dia as Record<string, unknown>).inMillimetersOfMercury)
      return null
    },
  },
  'blood-glucose': {
    metricCode: 'hc-glucose',
    metricName: 'Blood Glucose',
    recordType: 'BloodGlucose',
    permission: 'BloodGlucose',
    unit: 'mg/dL',
    refRange: { low: 70, high: 100 },
    extract: (r) => {
      const level = r.level as Record<string, unknown> | undefined
      if (level) return num((level as Record<string, unknown>).inMilligramsPerDeciliter)
      return null
    },
  },
  'body-temperature': {
    metricCode: 'hc-body-temp',
    metricName: 'Body Temperature',
    recordType: 'BodyTemperature',
    permission: 'BodyTemperature',
    unit: '°C',
    refRange: { low: 36.1, high: 37.2 },
    extract: (r) => {
      const t = r.temperature as Record<string, unknown> | undefined
      if (t) return num((t as Record<string, unknown>).inCelsius)
      return null
    },
  },
  'oxygen-saturation': {
    metricCode: 'hc-spo2',
    metricName: 'Oxygen Saturation',
    recordType: 'OxygenSaturation',
    permission: 'OxygenSaturation',
    unit: '%',
    refRange: { low: 95, high: 100 },
    extract: (r) => {
      const pct = r.percentage as Record<string, unknown> | undefined
      if (pct) return num((pct as Record<string, unknown>).value)
      return null
    },
  },
  'respiratory-rate': {
    metricCode: 'hc-resp-rate',
    metricName: 'Respiratory Rate',
    recordType: 'RespiratoryRate',
    permission: 'RespiratoryRate',
    unit: 'breaths/min',
    refRange: { low: 12, high: 20 },
    extract: (r) => num(r.rate),
  },
  weight: {
    metricCode: 'hc-weight',
    metricName: 'Weight',
    recordType: 'Weight',
    permission: 'Weight',
    unit: 'kg',
    refRange: { low: 50, high: 100 },
    extract: (r) => {
      const w = r.weight as Record<string, unknown> | undefined
      if (w) return num((w as Record<string, unknown>).inKilograms)
      return null
    },
  },
  'body-mass-index': {
    metricCode: 'hc-bmi',
    metricName: 'Body Mass Index',
    recordType: 'BodyMassIndex',
    permission: 'BodyMassIndex',
    unit: 'kg/m²',
    refRange: { low: 18.5, high: 24.9 },
    extract: (r) => num(r.bmi),
  },
  'body-fat-percentage': {
    metricCode: 'hc-body-fat',
    metricName: 'Body Fat %',
    recordType: 'BodyFat',
    permission: 'BodyFat',
    unit: '%',
    refRange: { low: 8, high: 24 },
    extract: (r) => {
      const pct = r.percentage as Record<string, unknown> | undefined
      if (pct) return num((pct as Record<string, unknown>).value)
      return null
    },
  },
  'lean-body-mass': {
    metricCode: 'hc-lean-body-mass',
    metricName: 'Lean Body Mass',
    recordType: 'LeanBodyMass',
    permission: 'LeanBodyMass',
    unit: 'kg',
    refRange: { low: 40, high: 80 },
    extract: (r) => {
      const m = r.mass as Record<string, unknown> | undefined
      if (m) return num((m as Record<string, unknown>).inKilograms)
      return null
    },
  },
  height: {
    metricCode: 'hc-height',
    metricName: 'Height',
    recordType: 'Height',
    permission: 'Height',
    unit: 'cm',
    refRange: { low: 150, high: 200 },
    scale: (v) => v * 100,
    extract: (r) => {
      const h = r.height as Record<string, unknown> | undefined
      if (h) return num((h as Record<string, unknown>).inMeters)
      return null
    },
  },
  'sleep-hours': {
    metricCode: 'hc-sleep',
    metricName: 'Sleep',
    recordType: 'SleepSession',
    permission: 'Sleep',
    unit: 'hours',
    refRange: { low: 7, high: 9 },
    dayReducer: 'sum',
    extract: (r) => {
      const s = r.startTime as string | undefined
      const e = r.endTime as string | undefined
      if (!s || !e) return null
      return (new Date(e).getTime() - new Date(s).getTime()) / 3_600_000
    },
  },
  'vo2-max': {
    metricCode: 'hc-vo2-max',
    metricName: 'VO₂ Max',
    recordType: 'Vo2Max',
    permission: 'Vo2Max',
    unit: 'mL/(kg·min)',
    refRange: { low: 30, high: 50 },
    extract: (r) => num(r.vo2MillilitersPerMinuteKilogram),
  },
  'walking-speed': {
    metricCode: 'hc-walking-speed',
    metricName: 'Walking Speed',
    recordType: 'Speed',
    permission: 'Speed',
    unit: 'm/s',
    refRange: { low: 1.0, high: 1.4 },
    extract: (r) => {
      const samples = r.samples as { speed?: { inMetersPerSecond?: number } }[] | undefined
      if (Array.isArray(samples) && samples.length > 0) {
        const valid = samples.map((s) => s.speed?.inMetersPerSecond ?? 0).filter((v) => v > 0)
        if (valid.length === 0) return null
        return valid.reduce((a, b) => a + b, 0) / valid.length
      }
      return null
    },
  },
  'water-intake': {
    metricCode: 'hc-water',
    metricName: 'Water Intake',
    recordType: 'Hydration',
    permission: 'Hydration',
    unit: 'L',
    refRange: { low: 2, high: 3 },
    dayReducer: 'sum',
    extract: (r) => {
      const vol = r.volume as Record<string, unknown> | undefined
      if (vol) return num((vol as Record<string, unknown>).inLiters)
      return null
    },
  },
  'mindful-minutes': {
    metricCode: 'hc-mindful',
    metricName: 'Mindful Minutes',
    recordType: 'MindfulnessSession',
    permission: 'Mindfulness',
    unit: 'min',
    refRange: { low: 5, high: 30 },
    dayReducer: 'sum',
    extract: (r) => {
      const s = r.startTime as string | undefined
      const e = r.endTime as string | undefined
      if (!s || !e) return null
      return Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000)
    },
  },
}

/** Ask Health Connect for read permission on every supported metric. */
export async function requestHealthConnectPermissions(): Promise<boolean> {
  if (!healthConnect) return false
  try {
    const initialized = await healthConnect.initialize()
    if (!initialized) return false
    const perms = Object.values(HC_SPECS).map((spec) => ({
      accessType: 'read' as const,
      recordType: spec.recordType as never,
    }))
    const granted = await healthConnect.requestPermission(perms)
    return granted.length > 0
  } catch {
    return false
  }
}

export async function getHealthConnectPermissions(): Promise<string[]> {
  if (!healthConnect) return []
  try {
    await healthConnect.initialize()
    const perms = await healthConnect.getGrantedPermissions()
    return perms.map((p) => String(p.recordType))
  } catch {
    return []
  }
}

const interpretPoint = (
  value: number,
  range: { low: number; high: number },
): TrendDataPoint['interpretation'] => {
  if (value < range.low) return 'low'
  if (value > range.high) return 'high'
  return 'normal'
}

/**
 * Fetch one Health Connect metric over the last `daysBack` days, bucketed
 * by calendar day in the device's local timezone. Returns the same
 * LongitudinalTrend shape Apple Health uses so the existing trends UI
 * is platform-agnostic.
 */
export async function getHealthConnectTrend(
  metric: HealthConnectMetric,
  daysBack = 90,
): Promise<LongitudinalTrend | null> {
  if (!healthConnect) return null
  const spec = HC_SPECS[metric]
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - daysBack)
  let records: Record<string, unknown>[]
  try {
    await healthConnect.initialize()
    const res = await healthConnect.readRecords(spec.recordType as never, {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    })
    records = (res.records ?? []) as unknown as Record<string, unknown>[]
  } catch {
    return null
  }
  if (records.length === 0) return null

  const byDay: Record<string, number[]> = {}
  for (const rec of records) {
    const valueRaw = spec.extract(rec)
    if (valueRaw == null) continue
    const scaled = spec.scale ? spec.scale(valueRaw) : valueRaw
    const ts = (rec.startTime ?? rec.time) as string | undefined
    if (!ts) continue
    const day = ts.slice(0, 10)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(scaled)
  }

  const points: TrendDataPoint[] = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      const value = spec.dayReducer === 'sum'
        ? values.reduce((a, b) => a + b, 0)
        : values.reduce((a, b) => a + b, 0) / values.length
      return {
        date,
        value: Math.round(value * 100) / 100,
        unit: spec.unit,
        referenceRange: { low: spec.refRange.low, high: spec.refRange.high },
        interpretation: interpretPoint(value, spec.refRange),
      }
    })

  if (points.length === 0) return null

  const recent = points.slice(-7).map((p) => p.value)
  const baseline = points.slice(0, 7).map((p) => p.value)
  let direction: LongitudinalTrend['trendDirection'] = 'insufficient_data'
  if (recent.length >= 3 && baseline.length >= 3) {
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const baselineAvg = baseline.reduce((a, b) => a + b, 0) / baseline.length
    const delta = recentAvg - baselineAvg
    const threshold = Math.max(0.05 * baselineAvg, 0.5)
    if (Math.abs(delta) < threshold) direction = 'stable'
    else if (delta > 0) direction = 'improving'
    else direction = 'worsening'
  }

  return {
    id: spec.metricCode,
    metricCode: spec.metricCode,
    metricName: spec.metricName,
    category: 'vital',
    dataPoints: points,
    trendDirection: direction,
    trendPeriod: `${daysBack}d`,
    relatedConditions: [],
    relatedMedications: [],
    source: 'health-connect',
  }
}

export async function getAllHealthConnectTrends(daysBack = 90): Promise<LongitudinalTrend[]> {
  const all = await Promise.all(
    (Object.keys(HC_SPECS) as HealthConnectMetric[]).map((m) =>
      getHealthConnectTrend(m, daysBack).catch(() => null),
    ),
  )
  return all.filter((t): t is LongitudinalTrend => t !== null)
}
