/**
 * SCRUM-642 — Health Age API client.
 *
 * Talks to the cos-backend health-age routes:
 *   GET  /v1/patients/me/health-age            — current snapshot (read-through)
 *   POST /v1/patients/me/health-age/recompute  — force-refresh (rate-limited)
 *   GET  /v1/patients/me/health-age/history    — sparkline series
 *
 * The routes are ALWAYS MOUNTED — handlers short-circuit with a 404
 * `{ code: 'FEATURE_DISABLED' }` when the backend flag is OFF (mirrors
 * feedback_bps_two_flag_confusion.md discipline). The client surfaces
 * FEATURE_DISABLED as a distinct thrown error via `HealthAgeFeatureDisabledError`
 * so callers can silently collapse the surface instead of showing a scary
 * "network error".
 *
 * Response envelope: cos-backend `sendSuccess` wraps payloads as
 * `{ success: true, data: ... }`. Defensive unwrap matches the
 * cgm-glucose client so a benign envelope tweak never breaks UI.
 *
 * Terminology (Legal): "Health Age" only — never "Biological Age".
 */

import axios from 'axios'

import { apiClient } from '@/lib/api-client'

// ─── Errors ──────────────────────────────────────────────────────────

export class HealthAgeFeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED'
  constructor() {
    super('Health Age feature is disabled')
    this.name = 'HealthAgeFeatureDisabledError'
  }
}

// ─── Types (mirror BE HealthAgeResult) ───────────────────────────────

export type HealthAgeBand = 'younger' | 'on-track' | 'older'

export type HealthAgeComponentStatus = 'fresh' | 'stale' | 'missing'

export type HealthAgeComponentSource =
  | 'fhir-lab'
  | 'healthkit'
  | 'self-report'
  | 'glucose-samples'

export interface HealthAgeComponentFreshness {
  /** ISO 8601 timestamp of the newest observation feeding this component, or null. */
  newestObservationAt: string | null
  source: HealthAgeComponentSource
}

export interface HealthAgeComponent {
  /** Machine name, e.g. `hba1c`, `albumin`. Safe for logging (no PHI). */
  name: string
  /** Years this component contributed to overall Health Age; null when missing/stale. */
  contributionYears: number | null
  freshness: HealthAgeComponentFreshness
  status: HealthAgeComponentStatus
}

export interface HealthAgeResult {
  /** Computed Health Age in years, or null when insufficient data. NEVER returns 0. */
  overall: number | null
  /** Patient's chronological age in years, or null when DOB missing. */
  chronologicalAge: number | null
  /** overall - chronologicalAge; positive = older-than-actual. Null when either input null. */
  healthAgeGap: number | null
  band: HealthAgeBand | null
  components: HealthAgeComponent[]
  /** Coefficient version used, e.g. `levine-2018` or `csh-2026-v1`. */
  coefficientsVersion: string
  /** ISO 8601 timestamp of computation. */
  computedAt: string
}

// ─── History (sparkline) ─────────────────────────────────────────────

export interface HealthAgeHistoryPoint {
  /** YYYY-MM-DD UTC bucket. */
  bucketDate: string
  overall: number | null
  healthAgeGap: number | null
}

export interface HealthAgeHistoryResponse {
  points: HealthAgeHistoryPoint[]
  coefficientsVersion: string
}

// ─── Envelope helper ─────────────────────────────────────────────────

function unwrap<T>(body: any): T {
  if (body == null) return body as T
  if (body.data && typeof body.data === 'object') return body.data as T
  return body as T
}

function throwIfFeatureDisabled(err: unknown): never {
  if (axios.isAxiosError(err) && err.response?.status === 404) {
    const code = (err.response.data as { code?: string } | undefined)?.code
    if (code === 'FEATURE_DISABLED') {
      throw new HealthAgeFeatureDisabledError()
    }
  }
  throw err as Error
}

function normalizeResult(shaped: Partial<HealthAgeResult> | undefined): HealthAgeResult {
  return {
    overall: shaped?.overall ?? null,
    chronologicalAge: shaped?.chronologicalAge ?? null,
    healthAgeGap: shaped?.healthAgeGap ?? null,
    band: shaped?.band ?? null,
    components: Array.isArray(shaped?.components) ? shaped!.components! : [],
    coefficientsVersion: shaped?.coefficientsVersion ?? '',
    computedAt: shaped?.computedAt ?? '',
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────

/**
 * Fetch the patient's current Health Age snapshot. Read-through: the
 * backend computes-on-miss and writes the daily bucket, so a successful
 * response always reflects fresh math even when the DDB row was absent.
 */
export async function getHealthAge(): Promise<HealthAgeResult> {
  try {
    const res = await apiClient.get<any>('/v1/patients/me/health-age')
    return normalizeResult(unwrap<Partial<HealthAgeResult>>(res.data))
  } catch (err) {
    throwIfFeatureDisabled(err)
  }
}

/**
 * Force-refresh path (pull-to-refresh on the detail screen). Bypasses
 * cache; rate-limited server-side at 1/hr per user (429 on abuse).
 */
export async function recomputeHealthAge(): Promise<HealthAgeResult> {
  try {
    const res = await apiClient.post<any>('/v1/patients/me/health-age/recompute')
    return normalizeResult(unwrap<Partial<HealthAgeResult>>(res.data))
  } catch (err) {
    throwIfFeatureDisabled(err)
  }
}

export interface GetHealthAgeHistoryOptions {
  /** Trailing window in days. Default 30, backend caps at 90. */
  days?: number
}

export async function getHealthAgeHistory(
  opts: GetHealthAgeHistoryOptions = {},
): Promise<HealthAgeHistoryResponse> {
  try {
    const res = await apiClient.get<any>('/v1/patients/me/health-age/history', {
      params: opts.days ? { days: opts.days } : undefined,
    })
    const shaped = unwrap<Partial<HealthAgeHistoryResponse>>(res.data)
    return {
      points: Array.isArray(shaped?.points) ? shaped!.points! : [],
      coefficientsVersion: shaped?.coefficientsVersion ?? '',
    }
  } catch (err) {
    throwIfFeatureDisabled(err)
  }
}
