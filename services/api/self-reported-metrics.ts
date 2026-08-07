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

/** One charting datapoint. Narrower than SelfReportedMetric on purpose —
 *  the history endpoint projects only what a chart needs. */
export interface MetricHistoryPoint {
  recordedAt: string;
  value: number;
  unit: string;
}

export interface MetricHistory {
  type: SelfReportedMetricType;
  days: number;
  /** OLDEST-FIRST. The backend reads with ScanIndexForward: true so the
   *  series is already chart-ordered; do NOT reverse it. */
  points: MetricHistoryPoint[];
  /**
   * True when the backend could not read the store and answered with an
   * empty list rather than a 5xx.
   *
   * This flag is why the UI can stay honest: `points: []` alone is
   * ambiguous between "you haven't recorded anything yet" and "we failed
   * to load your data", and showing the cheerful first message during the
   * second situation is a lie to a patient about their own health record.
   * Callers MUST branch on it.
   */
  degraded: boolean;
}

/**
 * Fetch a time-windowed, oldest-first history for ONE metric type.
 *
 * GET /v1/patients/me/self-reported-metrics/history?type=<type>&days=N
 *
 * Never throws. A transport/parse failure resolves to an EMPTY series
 * flagged `degraded: true` — same contract as the server's own catch, so
 * the calling component has exactly one code path for "we don't have the
 * data" regardless of whether the failure was on the wire or in Dynamo.
 *
 * @param type Canonical metric type.
 * @param days Lookback window; server clamps to 1..365. Default 30.
 */
export async function fetchMetricHistory(
  type: SelfReportedMetricType,
  days = 30,
): Promise<MetricHistory> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: { type: SelfReportedMetricType; days: number; points: MetricHistoryPoint[]; degraded?: boolean };
    }>(`/v1/patients/me/self-reported-metrics/history?type=${encodeURIComponent(type)}&days=${days}`);

    const data = res.data?.data;
    const rawPoints = Array.isArray(data?.points) ? data.points : [];

    // Defensive normalisation. A NaN slipping into a chart series is a
    // silent renderer of nonsense bars, so drop bad rows here — at the
    // single seam — rather than making every consumer re-check.
    const points = rawPoints.filter(
      (p): p is MetricHistoryPoint =>
        !!p &&
        typeof p.value === 'number' &&
        Number.isFinite(p.value) &&
        typeof p.recordedAt === 'string',
    );

    return {
      type,
      days: typeof data?.days === 'number' ? data.days : days,
      points,
      degraded: data?.degraded === true,
    };
  } catch {
    return { type, days, points: [], degraded: true };
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
