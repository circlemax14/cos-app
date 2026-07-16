/**
 * Vitals red-flag rules — shared client-side thresholds (HS-3b).
 *
 * MIRRORS `cos-backend/src/services/vitals-red-flag-rules.ts` VERBATIM.
 * Client and server evaluate the same numeric thresholds against the same
 * inputs and MUST produce the same verdict for the same values — the wire
 * contract (`POST /v1/patients/me/vitals-red-flag-event`) trusts the
 * client-computed severity label, so any drift here silently corrupts the
 * summary prompt input on the backend.
 *
 * Any change to a threshold in this file:
 *   1. Update the matching number in cos-backend/src/services/vitals-red-flag-rules.ts
 *   2. Bump `RULES_VERSION` in BOTH files (keep the literal identical)
 *   3. Bump `SCHEMA_VERSION` in cos-backend/src/db/tables/health-summary-cache.ts
 *      so the summary cache invalidates cleanly on the flag flip.
 *
 * Consumers:
 *   - `components/health-summary/VitalsRedFlagSection.tsx` (tile verdicts —
 *     replaces the inline bpLight/glucoseLight/stepsLight helpers previously
 *     living at lines 23-56 of that file).
 *   - `hooks/use-vitals-red-flag-notifications.ts` (observer hook that fires
 *     local rechecks + POSTs verdicts to the backend on transitions into
 *     amber|red).
 *
 * Keep this file PURE — no React, no expo-*, no AsyncStorage, no network.
 * It has one job: (metric, values) → verdict.
 */

import type { TrendDataPoint } from '@/services/api/types';

export type Severity = 'green' | 'amber' | 'red' | 'info';

export type MetricType = 'bp' | 'glucose' | 'steps' | 'hr' | 'hrv' | 'spo2';

export interface RuleVerdict {
  severity: Severity;
  reason: string;
  caveat?: string;
}

/**
 * Version stamp for the threshold set. Wire this into every persisted verdict
 * (`RedFlagRecord.rulesVersion` on the backend) so downstream readers can tell
 * which rule generation produced a given event. MUST match the BE constant
 * literally — a mismatch means one side redeployed without the other.
 */
export const RULES_VERSION = 'v1-2026-07-16-hrv-min-14';

/**
 * `info` and `green` never POST to the backend and never fire a local recheck
 * — they exist so the tile UI can render a neutral state (green = normal,
 * info = insufficient data / non-actionable).
 */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  green: 0,
  info: 1,
  amber: 2,
  red: 3,
};

// Non-fasting HK glucose caveat — the Health app cannot label a reading as
// fasting vs post-prandial, so we treat every self-reported/HK glucose as
// non-fasting and surface that caveat everywhere the verdict flows (tile
// subtitle, notification copy, summary prompt block).
const GLUCOSE_CAVEAT = 'non-fasting ranges applied';

// HRV trend needs at least this many samples across the window before we'll
// call it a real trend. Below this we return `info` so the UI can show
// "not enough data yet" and the observer hook can skip the POST.
const HRV_MIN_SAMPLES = 14;
const HRV_AMBER_DROP_PCT = 0.2; // 20% drop over the window → amber

/**
 * HRV trend window split: last N days = recent, older = prior.
 * Kept in one place so `VitalsRedFlagSection.tsx` and
 * `use-vitals-red-flag-notifications.ts` cannot drift on the cutoff.
 */
const HRV_SPLIT_DAYS = 30;

/**
 * Time-based split of an HRV data-point series into `recent` (last 30 days
 * from now) and `prior` (older) numeric value arrays, plus the total
 * `sampleCount` (points with a parseable date). Feed the returned arrays
 * through your own averaging step and pass the results into
 * `evaluateHRVTrend(recentAvg, priorAvg, sampleCount)`.
 *
 * Extracted so `hooks/use-vitals-red-flag-notifications.ts` and
 * `components/health-summary/VitalsRedFlagSection.tsx` use the SAME split
 * (previously duplicated in the hook). Pure — no clock injection needed
 * because both call sites evaluate on-render / on-settle and the 30-day
 * boundary is intentionally "now-relative".
 */
export function splitHRVTrend(
  dataPoints: TrendDataPoint[],
): { recent: number[]; prior: number[]; sampleCount: number } {
  const recent: number[] = [];
  const prior: number[] = [];
  if (!dataPoints || dataPoints.length === 0) {
    return { recent, prior, sampleCount: 0 };
  }
  const cutoffMs = Date.now() - HRV_SPLIT_DAYS * 24 * 60 * 60 * 1000;
  let sampleCount = 0;
  for (const p of dataPoints) {
    const t = Date.parse(p.date);
    if (Number.isNaN(t)) continue;
    sampleCount += 1;
    if (t >= cutoffMs) recent.push(p.value);
    else prior.push(p.value);
  }
  return { recent, prior, sampleCount };
}

/** BP: red >=140/90, amber (Stage 1) >=130/80, amber (Elevated) systolic >=120. */
export function evaluateBP(systolic: number, diastolic: number): RuleVerdict {
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
    return { severity: 'info', reason: 'BP reading incomplete' };
  }
  if (systolic >= 140 || diastolic >= 90) {
    return { severity: 'red', reason: 'BP at or above 140/90' };
  }
  if (systolic >= 130 || diastolic >= 80) {
    return { severity: 'amber', reason: 'BP at or above 130/80' };
  }
  if (systolic >= 120) {
    return { severity: 'amber', reason: 'BP elevated (systolic at or above 120)' };
  }
  return { severity: 'green', reason: 'BP in normal range' };
}

/** Glucose: red >=180, amber >=140 or <70. Always carries the non-fasting caveat. */
export function evaluateGlucose(mgDl: number): RuleVerdict {
  if (!Number.isFinite(mgDl)) {
    return { severity: 'info', reason: 'Glucose reading missing', caveat: GLUCOSE_CAVEAT };
  }
  if (mgDl >= 180) {
    return { severity: 'red', reason: 'Glucose at or above 180 mg/dL', caveat: GLUCOSE_CAVEAT };
  }
  if (mgDl < 70) {
    return { severity: 'amber', reason: 'Glucose below 70 mg/dL', caveat: GLUCOSE_CAVEAT };
  }
  if (mgDl >= 140) {
    return { severity: 'amber', reason: 'Glucose at or above 140 mg/dL', caveat: GLUCOSE_CAVEAT };
  }
  return { severity: 'green', reason: 'Glucose in normal range', caveat: GLUCOSE_CAVEAT };
}

/** Steps: amber <5000/day. No red tier — low steps is never critical on its own. */
export function evaluateStepsDaily(count: number): RuleVerdict {
  if (!Number.isFinite(count) || count < 0) {
    return { severity: 'info', reason: 'Steps count unavailable' };
  }
  if (count < 5000) {
    return { severity: 'amber', reason: 'Fewer than 5,000 steps today' };
  }
  return { severity: 'green', reason: 'Steps on track' };
}

/** Resting HR: red >=100 or <=50, amber >=90 or <=60. */
export function evaluateRestingHR(bpm: number): RuleVerdict {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    return { severity: 'info', reason: 'Resting heart rate unavailable' };
  }
  if (bpm >= 100) {
    return { severity: 'red', reason: 'Resting heart rate at or above 100 bpm' };
  }
  if (bpm <= 50) {
    return { severity: 'red', reason: 'Resting heart rate at or below 50 bpm' };
  }
  if (bpm >= 90) {
    return { severity: 'amber', reason: 'Resting heart rate at or above 90 bpm' };
  }
  if (bpm <= 60) {
    return { severity: 'amber', reason: 'Resting heart rate at or below 60 bpm' };
  }
  return { severity: 'green', reason: 'Resting heart rate in normal range' };
}

/**
 * HRV trend: amber when the recent-window average has dropped 20% or more
 * compared to the prior window. Returns `info` when we have fewer than
 * `HRV_MIN_SAMPLES` samples across the window — HRV is noisy and a small
 * sample size will fabricate trends that aren't there.
 */
export function evaluateHRVTrend(
  recentAvg: number,
  priorAvg: number,
  sampleCount: number,
): RuleVerdict {
  if (!Number.isFinite(sampleCount) || sampleCount < HRV_MIN_SAMPLES) {
    return { severity: 'info', reason: 'Not enough HRV samples for a trend' };
  }
  if (!Number.isFinite(recentAvg) || !Number.isFinite(priorAvg) || priorAvg <= 0) {
    return { severity: 'info', reason: 'HRV trend inputs incomplete' };
  }
  const deltaPct = (recentAvg - priorAvg) / priorAvg;
  if (deltaPct <= -HRV_AMBER_DROP_PCT) {
    return {
      severity: 'amber',
      reason: 'HRV trending down 20% or more over the last 30 days',
    };
  }
  return { severity: 'green', reason: 'HRV trend stable' };
}

/** SpO2: red <90, amber 90-94. */
export function evaluateSpO2(pct: number): RuleVerdict {
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { severity: 'info', reason: 'SpO2 reading unavailable' };
  }
  if (pct < 90) {
    return { severity: 'red', reason: 'SpO2 below 90%' };
  }
  if (pct < 95) {
    return { severity: 'amber', reason: 'SpO2 between 90% and 94%' };
  }
  return { severity: 'green', reason: 'SpO2 at or above 95%' };
}

/**
 * Severity ordering for aggregation: green < info < amber < red.
 * Used by the aggregate pill above the tile grid — pick the max rank across
 * visible tiles and colour the pill by that severity.
 */
export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}
