/**
 * services/api/readiness-history.ts — Vishal 2026-08-06.
 *
 * Client for the Readiness history read:
 *   GET /v1/patients/me/readiness/history?days=N
 *     → { buckets: [{ asOfLocalDay, score, band, computedAt }], days }
 *
 * Storage for this series has existed since SCRUM-654 — the derivation
 * hook has been POSTing one categorical snapshot per local day to
 * /v1/patients/me/readiness/snapshot. This module is the missing READ
 * side that makes the score graphable.
 *
 * Deliberately mirrors services/api/wellbeing-score.ts so the two
 * detail screens share one mental model. Two intentional differences:
 *
 *   1. MAX 30 DAYS, not 90. The DDB table's TTL is 30 days, so rows
 *      older than that are physically reaped. Offering a 90d range
 *      would promise history that cannot exist.
 *   2. The endpoint's `band` is the BACKEND enum
 *      ('optimal'|'balanced'|'strained'|'depleted'), which is NOT the
 *      same vocabulary as the on-device `ReadinessBand`
 *      ('optimal'|'developing'|'foundational'|'initial'). The derivation
 *      hook maps local → BE on write; `snapshotBandToLocalBand` below is
 *      the inverse, so anything reading history can get back to the
 *      palette names in constants/design-system ScoreBands.
 *
 * PHI hygiene: the envelope is categorical only — composite score,
 * band, and timestamps. NEVER raw HRV ms / sleep hours / resting HR.
 * The BE deliberately does not project driverBreakdown into history.
 * Safe to cache in React Query.
 *
 * NEVER THROWS. Every failure mode (flag-off 404, network drop, auth
 * blip, malformed payload) resolves to an empty series, because a
 * missing graph must degrade to "hidden", never to a crashed screen.
 */

import { apiClient } from '@/lib/api-client'
import type { ReadinessBand } from '@/lib/readiness-score'
import type { ReadinessSnapshotBand } from '@/services/api/readiness-snapshot'

// ── Range constants (mirror the BE clamp) ───────────────────────────

/** BE clamps `days` to [1, 30]; the ceiling is the table's 30-day TTL. */
export const READINESS_HISTORY_MIN_DAYS = 1
export const READINESS_HISTORY_MAX_DAYS = 30
/** Default window when the caller does not specify one. */
export const READINESS_HISTORY_DEFAULT_DAYS = 7

// ── Types ────────────────────────────────────────────────────────────

export interface ReadinessHistoryBucket {
  /** Patient-LOCAL calendar day, YYYY-MM-DD. */
  asOfLocalDay: string
  /** Composite readiness score for that day, 0-100. */
  score: number
  /** Backend band vocabulary — see `snapshotBandToLocalBand`. */
  band: ReadinessSnapshotBand
  /** ISO 8601 timestamp of the on-device computation. */
  computedAt: string
}

export interface ReadinessHistoryResponse {
  /** Chronological, oldest first. Missing days are OMITTED, not zero-filled. */
  buckets: ReadinessHistoryBucket[]
  /** The window the server actually served, after its own clamp. */
  days: number
}

// ── Band vocabulary bridge ───────────────────────────────────────────

/**
 * Inverse of `bandToSnapshotBand` in hooks/use-readiness-derivation.ts.
 * Converts a persisted backend band back into the on-device
 * `ReadinessBand`, which is also the key set of `ScoreBands` in
 * constants/design-system — so the result can be handed straight to
 * ScoreHistorySparkline's `band` prop.
 *
 * WHY THE TWO VOCABULARIES EXIST: the BE enum was fixed by the
 * SCRUM-654 Zod schema before the on-device band names settled. Rather
 * than migrate persisted rows (and break every row already in DDB), we
 * keep a pure two-line map at each boundary. Round-trips exactly.
 */
export function snapshotBandToLocalBand(band: ReadinessSnapshotBand): ReadinessBand {
  switch (band) {
    case 'optimal': return 'optimal'
    case 'balanced': return 'developing'
    case 'strained': return 'foundational'
    case 'depleted': return 'initial'
    default: return 'developing'
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Clamp to the BE-supported window so we never send a range it will reject. */
export function clampReadinessHistoryDays(days: number): number {
  if (!Number.isFinite(days)) return READINESS_HISTORY_DEFAULT_DAYS
  return Math.max(
    READINESS_HISTORY_MIN_DAYS,
    Math.min(READINESS_HISTORY_MAX_DAYS, Math.floor(days)),
  )
}

/**
 * Runtime shape guard. The endpoint is ours, but a partial deploy (BE
 * ahead of / behind the app binary) can hand back something unexpected,
 * and one malformed bucket must not poison the whole series. Anything
 * that fails the guard is dropped silently.
 */
function isValidBucket(value: unknown): value is ReadinessHistoryBucket {
  if (typeof value !== 'object' || value === null) return false
  const b = value as Partial<ReadinessHistoryBucket>
  return (
    typeof b.asOfLocalDay === 'string' &&
    typeof b.score === 'number' &&
    Number.isFinite(b.score) &&
    typeof b.band === 'string'
  )
}

// ── Endpoint ─────────────────────────────────────────────────────────

/**
 * `GET /v1/patients/me/readiness/history?days=N`.
 *
 * Returns chronological daily buckets (oldest first) for the requested
 * window. `days` is clamped client-side to [1, 30] before the request
 * and again server-side, so a bad caller cannot widen the window.
 *
 * Resolves to `{ buckets: [], days }` on ANY failure — including the
 * 404 FEATURE_DISABLED the route returns while `readiness_score_enabled`
 * is OFF. Callers therefore never need a try/catch.
 */
export async function fetchReadinessHistory(
  days: number = READINESS_HISTORY_DEFAULT_DAYS,
): Promise<ReadinessHistoryResponse> {
  const clamped = clampReadinessHistoryDays(days)
  try {
    const res = await apiClient.get<{ success: boolean; data: ReadinessHistoryResponse }>(
      `/v1/patients/me/readiness/history?days=${clamped}`,
    )
    const data = res.data?.data
    const raw = Array.isArray(data?.buckets) ? data.buckets : []
    return {
      buckets: raw.filter(isValidBucket),
      days: typeof data?.days === 'number' ? data.days : clamped,
    }
  } catch {
    // 404 (flag off) / network / timeout / auth blip all land here. An
    // empty series renders as "history is still building", which is the
    // correct user-facing story for every one of those cases.
    return { buckets: [], days: clamped }
  }
}
