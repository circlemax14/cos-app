/**
 * SCRUM-654 — Readiness snapshot ingest API client.
 *
 * Talks to the cos-backend readiness route:
 *   POST /v1/patients/me/readiness/snapshot   — daily categorical snapshot
 *
 * Contract highlights (see BE state notes + design.route):
 *  - Route is ALWAYS MOUNTED — flag gate is INNER-BRANCH. A 404 would
 *    mean the router was not wired in routes/index.ts, NOT that the
 *    flag is off. Explicitly avoids the BPS two-flag trap from
 *    feedback_bps_two_flag_confusion.md.
 *  - Server responds 200 { accepted: 0, reason: 'flag_off' } when the
 *    `readiness_score_enabled` SSM flag is OFF (silent no-op).
 *  - Server responds 429 { retryAfterSeconds } when a snapshot for this
 *    userSub was written < 300s ago. Client honors this via AsyncStorage.
 *  - Server upsert is IDEMPOTENT on (userSub, asOfLocalDay).
 *  - Server authoritatively sets userSub = req.user.sub — any body userSub
 *    is IGNORED. Do NOT send it.
 *
 * PHI hygiene — the request body is a categorical envelope ONLY:
 *   score (0-100 int) + band (enum) + baselineDays (int) + asOfLocalDay
 *   + computedAt + driverBreakdown (enum-valued map) + source.
 * NEVER raw HRV ms, sleep hours, resting HR bpm, or respiratory rate.
 * The BE zod schema is `.strict()` and will reject unknown keys with 400.
 *
 * Response envelope: cos-backend `sendSuccess` wraps payloads as
 * `{ success: true, data: ... }`. Defensive unwrap matches the
 * services/api/cgm-glucose.ts postGlucoseSamples pattern.
 */

import { apiClient } from '@/lib/api-client'

// ─── Enums (mirror BE zod exactly) ───────────────────────────────────

export type ReadinessSnapshotBand = 'optimal' | 'balanced' | 'strained' | 'depleted'
export type ReadinessDriverState = 'below_baseline' | 'at_baseline' | 'above_baseline'
export type ReadinessSnapshotSource = 'healthkit'

// ─── Request body ────────────────────────────────────────────────────

export interface ReadinessDriverBreakdown {
  hrv?: ReadinessDriverState
  sleep?: ReadinessDriverState
  restingHr?: ReadinessDriverState
  respRate?: ReadinessDriverState
}

export interface PostReadinessSnapshotRequest {
  /** Composite 0..100 integer. */
  score: number
  /** Band label (see BE zod enum). */
  band: ReadinessSnapshotBand
  /** Baseline days count (integer, 0..60). */
  baselineDays: number
  /** Canonical "as-of" day in device-LOCAL calendar (YYYY-MM-DD).
   *  MUST come from query.data.debug.todayIsoLocal — do NOT recompute
   *  from `new Date()` (SCRUM-664 local/UTC trap). */
  asOfLocalDay: string
  /** ISO 8601 with offset — when the score was computed on-device. */
  computedAt: string
  /** Per-driver categorical position vs personal baseline. Enum-valued
   *  only — NEVER raw vitals. */
  driverBreakdown: ReadinessDriverBreakdown
  /** Fixed to 'healthkit' in v1. */
  source?: ReadinessSnapshotSource
}

// ─── Response ────────────────────────────────────────────────────────

export interface AcceptResponse {
  /** 1 = snapshot persisted. 0 = flag OFF (silent no-op) OR throttled. */
  accepted: number
  /** ISO 8601 timestamp the server stored — echoes computedAt when accepted. */
  computedAt?: string
  /** Echoes asOfLocalDay when accepted. */
  asOfLocalDay?: string
  /** Echoes band when accepted. */
  band?: ReadinessSnapshotBand
  /** Server-computed trailing 7-day linear slope. Denormalized on ingest
   *  so the loader read is single-shot. */
  trendSlope7d?: number
  /** True when the server rate-limited the write (< 5 min since last). */
  throttled?: boolean
  /** Present when accepted === 0 and the flag is OFF. */
  reason?: 'flag_off'
  /** Present on 429 THROTTLED responses (surfaced by axios error, but
   *  also occasionally on 200 envelopes when the server chooses to
   *  return a soft-throttle). Honored by the client-side gate. */
  retryAfterSeconds?: number
}

// ─── Envelope helper ─────────────────────────────────────────────────

function unwrap<T>(body: unknown): T {
  if (body == null) return body as T
  if (typeof body === 'object' && body !== null && 'data' in body) {
    const data = (body as { data?: unknown }).data
    if (data && typeof data === 'object') return data as T
  }
  return body as T
}

// ─── Endpoint ────────────────────────────────────────────────────────

/**
 * POST the categorical daily readiness snapshot. Fire-and-forget from
 * the derivation hook — callers should `.catch()` and swallow errors
 * (see hooks/use-readiness-derivation.ts). The zero-API-surface
 * contract for the Home tile means user-visible errors must NEVER
 * surface from this ingest.
 */
export async function postReadinessSnapshot(
  body: PostReadinessSnapshotRequest,
): Promise<AcceptResponse> {
  const res = await apiClient.post<unknown>(
    '/v1/patients/me/readiness/snapshot',
    body,
  )
  const shaped = unwrap<Partial<AcceptResponse>>(res.data)
  return {
    accepted: shaped?.accepted ?? 0,
    computedAt: shaped?.computedAt,
    asOfLocalDay: shaped?.asOfLocalDay,
    band: shaped?.band,
    trendSlope7d: shaped?.trendSlope7d,
    throttled: shaped?.throttled,
    reason: shaped?.reason,
    retryAfterSeconds: shaped?.retryAfterSeconds,
  }
}
