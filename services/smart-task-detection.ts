/**
 * Smart task detection — classifies a daily-plan task and infers a
 * recordable metric type from its title + description.
 *
 * SCRUM-279 build 45. Ken's feedback was: "if we are giving user task
 * to check blood glucose level then we should take initiative to
 * record it". This module is the classifier.
 *
 * Design: pure keyword matching (no AI inference at runtime). The
 * upstream AI plan generator picks task titles freely, so we sweep
 * common synonyms. Misses are non-fatal — the user can still
 * complete the task without recording a value. Adding a new metric
 * type means appending a row here AND in the backend enum.
 */

import type { TaskOccurrence } from '@/services/api/types';
import type { SelfReportedMetricType } from '@/services/api/self-reported-metrics';

/** UI metadata for a recordable metric. */
export interface MetricInputSpec {
  /** Canonical type string sent to the backend. */
  type: SelfReportedMetricType;
  /** Display label shown above the input ("Blood glucose"). */
  label: string;
  /** Unit text appended after the input. */
  unit: string;
  /** Sane lower/upper bounds for client-side validation. */
  min: number;
  max: number;
  /** Decimal precision — 0 = integer only, 1 = one decimal etc. */
  precision: number;
  /** Friendly placeholder shown when input is empty. */
  placeholder: string;
}

interface MetricRule {
  spec: MetricInputSpec;
  /** Lowercase keywords that signal this metric in a task. ANY match wins. */
  keywords: string[];
}

const RULES: MetricRule[] = [
  {
    spec: { type: 'blood_glucose', label: 'Blood glucose', unit: 'mg/dL', min: 30, max: 600, precision: 0, placeholder: 'e.g. 110' },
    keywords: ['blood glucose', 'blood sugar', 'glucose', 'glucometer'],
  },
  {
    spec: { type: 'blood_pressure_systolic', label: 'Blood pressure (systolic)', unit: 'mmHg', min: 60, max: 250, precision: 0, placeholder: 'e.g. 120' },
    keywords: ['blood pressure', 'systolic', ' bp ', 'bp check', 'check bp'],
  },
  {
    spec: { type: 'weight', label: 'Weight', unit: 'lb', min: 20, max: 800, precision: 1, placeholder: 'e.g. 165.5' },
    keywords: ['weight', 'body weight', 'weigh in', 'weigh-in'],
  },
  {
    spec: { type: 'water_intake', label: 'Water intake', unit: 'oz', min: 0, max: 256, precision: 0, placeholder: 'e.g. 16' },
    keywords: ['water', 'hydration', 'fluid intake', 'drink water'],
  },
  {
    spec: { type: 'temperature', label: 'Temperature', unit: '°F', min: 90, max: 110, precision: 1, placeholder: 'e.g. 98.6' },
    keywords: ['temperature', 'temp check', 'check temp', 'fever'],
  },
  {
    spec: { type: 'heart_rate', label: 'Heart rate', unit: 'bpm', min: 30, max: 220, precision: 0, placeholder: 'e.g. 72' },
    keywords: ['heart rate', 'pulse', 'resting heart rate'],
  },
  {
    spec: { type: 'oxygen_saturation', label: 'Oxygen saturation', unit: '%', min: 60, max: 100, precision: 0, placeholder: 'e.g. 98' },
    keywords: ['oxygen', 'spo2', 'pulse ox', 'oximeter', 'oxygen saturation'],
  },
  {
    spec: { type: 'pain_level', label: 'Pain level (0–10)', unit: '/10', min: 0, max: 10, precision: 0, placeholder: 'e.g. 3' },
    keywords: ['pain level', 'pain score', 'rate pain', 'pain check'],
  },
  {
    spec: { type: 'mood', label: 'Mood (1–10)', unit: '/10', min: 1, max: 10, precision: 0, placeholder: 'e.g. 7' },
    keywords: ['mood', 'how do you feel', 'emotional check', 'wellbeing check'],
  },
  {
    spec: { type: 'sleep_hours', label: 'Sleep last night', unit: 'hours', min: 0, max: 24, precision: 1, placeholder: 'e.g. 7.5' },
    keywords: ['sleep', 'hours slept', 'sleep check', 'rest hours'],
  },
];

/**
 * Inspect a task and return the recordable metric spec, if any. Null
 * means the task isn't recordable and the existing complete/skip
 * behaviour applies unchanged.
 */
export function detectMetricForTask(task: Pick<TaskOccurrence, 'title' | 'description' | 'type'>): MetricInputSpec | null {
  // Medications and appointments are NEVER recordable metrics — they're
  // adherence-tracked separately. Skip them up front to avoid the
  // "Take metformin" task being flagged as a glucose check.
  if (task.type === 'medication' || task.type === 'appointment') return null;

  const haystack = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return rule.spec;
    }
  }
  return null;
}
