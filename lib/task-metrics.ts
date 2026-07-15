/**
 * task-metrics (COS-450 / SCRUM-588, Chunk 1c).
 *
 * Preset metric library + client-side smart-default detection from a task
 * title. Keyword rules MIRROR the cos-backend safety net in
 * ai-health-plan.service.ts — keep the two in lockstep so the FE editor
 * previews the same completionStyle/metric Bedrock will end up setting
 * when the task is saved.
 */

import type { TaskMetric } from '@/services/api/types';

/** Preset metric definitions users can pick from the editor library. */
export const PRESET_METRICS: readonly TaskMetric[] = [
  { key: 'blood_pressure', name: 'Blood Pressure', unit: 'mmHg', healthKitType: 'HKQuantityTypeIdentifierBloodPressureSystolic' },
  { key: 'blood_glucose',  name: 'Blood Glucose',  unit: 'mg/dL', healthKitType: 'HKQuantityTypeIdentifierBloodGlucose' },
  { key: 'weight',         name: 'Weight',         unit: 'lbs',   healthKitType: 'HKQuantityTypeIdentifierBodyMass' },
  { key: 'mood',           name: 'Mood',           unit: '1-10' },
  { key: 'pain',           name: 'Pain',           unit: '0-10' },
  { key: 'steps',          name: 'Steps',          unit: 'count', healthKitType: 'HKQuantityTypeIdentifierStepCount' },
  { key: 'sleep_hours',    name: 'Sleep Duration', unit: 'hours', healthKitType: 'HKCategoryTypeIdentifierSleepAnalysis' },
] as const;

const KEYWORD_RULES: Array<{ match: RegExp; metricKey: string }> = [
  { match: /\b(blood\s*pressure|bp)\b/i,       metricKey: 'blood_pressure' },
  { match: /\b(glucose|blood\s*sugar|a1c)\b/i, metricKey: 'blood_glucose' },
  { match: /\b(weight|weigh)\b/i,              metricKey: 'weight' },
  { match: /\b(mood|how\s*i\s*feel)\b/i,       metricKey: 'mood' },
  { match: /\bpain\b/i,                        metricKey: 'pain' },
  { match: /\bsteps?\b/i,                      metricKey: 'steps' },
  { match: /\bsleep\s*hours?\b/i,              metricKey: 'sleep_hours' },
];

export interface DetectionResult {
  completionStyle: 'simple' | 'measurable';
  metric?: TaskMetric;
}

/**
 * Given a task title, return the auto-detected {completionStyle, metric}.
 * Same rules as the cos-backend sanitizer's detectCompletionStyleFromTitle
 * — kept in sync so the FE preview and the ultimately-stored value agree.
 */
export function detectCompletionStyleFromTitle(title: string): DetectionResult {
  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(title)) {
      const metric = PRESET_METRICS.find((m) => m.key === rule.metricKey);
      if (metric) return { completionStyle: 'measurable', metric };
    }
  }
  return { completionStyle: 'simple' };
}

/** Look up a preset metric by key. Returns undefined for unknown or custom keys. */
export function findPresetMetric(key: string | undefined): TaskMetric | undefined {
  if (!key) return undefined;
  return PRESET_METRICS.find((m) => m.key === key);
}

/** Make a Custom metric key from a user-typed name — collision-safe with presets. */
export function makeCustomMetricKey(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return `custom:${slug || 'metric'}`;
}
