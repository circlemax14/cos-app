/**
 * SCRUM-648 — CGM / Glucose API client.
 *
 * Talks to the cos-backend glucose routes:
 *   GET  /v1/patients/me/glucose/trend     — TIR summary + 14-day series
 *   POST /v1/patients/me/glucose/samples   — batched sample ingest
 *
 * Backend routes are ALWAYS MOUNTED (see recon: inner-branch flag) —
 * a 404 would mean the router was not wired in routes/index.ts, NOT
 * that the flag is off. Explicitly avoids the BPS two-flag trap from
 * feedback_bps_two_flag_confusion.md.
 *
 * Response envelope: cos-backend `sendSuccess` wraps payloads as
 * `{ success: true, data: ... }`. Defensive unwrap matches the
 * habit-journal client so a benign envelope tweak never breaks UI.
 */

import { apiClient } from '@/lib/api-client'

// ─── Trend / TIR ─────────────────────────────────────────────────────

export interface GlucoseSeriesPoint {
  /** ISO 8601 timestamp for the reading. */
  ts: string
  /** Value in mg/dL. */
  valueMgDl: number
}

export interface GlucoseTirSummary {
  /** Time-in-range percentage (0..100). */
  pct: number
  /** Time-below-range percentage (0..100). */
  hypoPct: number
  /** Time-above-range percentage (0..100). */
  hyperPct: number
  /** Rolling window used for the computation. */
  windowDays: number
  /** Reference bands used to classify hypo/hyper (mg/dL). */
  bands: { low: number; high: number }
  /** Number of raw samples inside the window. */
  sampleCount: number
  /** ISO 8601 timestamp of when the TIR was computed. */
  computedAt: string
}

export interface GlucoseTrendResponse {
  series: GlucoseSeriesPoint[]
  /**
   * Null when the patient has no data yet (patient-self variant).
   * Care-manager variant emits a zeroed stub instead of null when
   * the flag is ON. Treat `null` OR `sampleCount === 0` as "no data".
   */
  tir: GlucoseTirSummary | null
  /** Human-readable caveat, e.g. "non-fasting ranges applied". */
  caveat: string
}

// ─── Sample ingest ───────────────────────────────────────────────────

export type GlucoseSampleSource = 'healthkit' | 'dexcom' | 'libre'

export interface GlucoseSampleInput {
  /** Value in mg/dL. */
  value: number
  /** ISO 8601 with offset. */
  startDate: string
  /** ISO 8601 with offset. */
  endDate: string
  /** Unit fixed to 'mg/dL' by the API contract. */
  unit: 'mg/dL'
}

export interface PostGlucoseSamplesRequest {
  samples: GlucoseSampleInput[]
  source?: GlucoseSampleSource
}

export interface PostSamplesResponse {
  accepted: number
  rejected: number
  /** ISO 8601 timestamp of the newest accepted sample, or null. */
  latestSampleAt: string | null
}

// ─── Envelope helper ─────────────────────────────────────────────────

function unwrap<T>(body: any): T {
  if (body == null) return body as T
  if (body.data && typeof body.data === 'object') return body.data as T
  return body as T
}

// ─── Endpoints ───────────────────────────────────────────────────────

export interface GetGlucoseTrendOptions {
  windowDays?: number
}

export async function getPatientGlucoseTrend(
  opts: GetGlucoseTrendOptions = {},
): Promise<GlucoseTrendResponse> {
  const res = await apiClient.get<any>('/v1/patients/me/glucose/trend', {
    params: opts.windowDays ? { windowDays: opts.windowDays } : undefined,
  })
  const shaped = unwrap<Partial<GlucoseTrendResponse>>(res.data)
  return {
    series: shaped?.series ?? [],
    tir: shaped?.tir ?? null,
    caveat: shaped?.caveat ?? '',
  }
}

export async function postGlucoseSamples(
  body: PostGlucoseSamplesRequest,
): Promise<PostSamplesResponse> {
  const res = await apiClient.post<any>('/v1/patients/me/glucose/samples', body)
  const shaped = unwrap<Partial<PostSamplesResponse>>(res.data)
  return {
    accepted: shaped?.accepted ?? 0,
    rejected: shaped?.rejected ?? 0,
    latestSampleAt: shaped?.latestSampleAt ?? null,
  }
}
