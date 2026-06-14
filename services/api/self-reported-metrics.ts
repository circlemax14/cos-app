/**
 * Self-reported health metrics — patient-submitted values captured
 * inline from daily tasks (SCRUM-279, build 45).
 *
 * Backend: POST/GET /v1/patients/me/self-reported-metrics
 * Storage: piggybacks the healthPlans DynamoDB table with the
 * `METRIC#<type>#<recordedAt>` SK prefix — see
 * cos-backend/src/services/self-reported-metric.service.ts.
 */

import { apiClient } from '@/lib/api-client';

export type SelfReportedMetricType =
  | 'blood_glucose'
  | 'blood_pressure_systolic'
  | 'blood_pressure_diastolic'
  | 'weight'
  | 'water_intake'
  | 'temperature'
  | 'heart_rate'
  | 'oxygen_saturation'
  | 'pain_level'
  | 'mood'
  | 'sleep_hours'
  | 'steps';

export interface SelfReportedMetric {
  type: SelfReportedMetricType;
  value: number;
  unit: string;
  recordedAt: string;
  sourceTaskId?: string;
  source?: 'patient';
}

export interface RecordMetricResult {
  ok: boolean;
  metric?: SelfReportedMetric;
  status?: number;
  message?: string;
}

export async function recordSelfReportedMetric(
  payload: SelfReportedMetric,
): Promise<RecordMetricResult> {
  try {
    const res = await apiClient.post<{ success: boolean; data: { metric: SelfReportedMetric } }>(
      '/v1/patients/me/self-reported-metrics',
      payload,
    );
    return { ok: true, metric: res.data.data?.metric };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'response' in err) {
      const e = err as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
      return {
        ok: false,
        status: e.response?.status,
        message: e.response?.data?.error ?? e.response?.data?.message ?? e.message ?? 'Request failed',
      };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function listSelfReportedMetrics(opts: { type?: SelfReportedMetricType; limit?: number } = {}): Promise<SelfReportedMetric[]> {
  try {
    const params = new URLSearchParams();
    if (opts.type) params.set('type', opts.type);
    if (opts.limit) params.set('limit', String(opts.limit));
    const res = await apiClient.get<{ success: boolean; data: { metrics: SelfReportedMetric[] } }>(
      `/v1/patients/me/self-reported-metrics${params.size ? `?${params}` : ''}`,
    );
    return res.data.data?.metrics ?? [];
  } catch {
    return [];
  }
}
