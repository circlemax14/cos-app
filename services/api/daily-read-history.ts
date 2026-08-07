/**
 * SCRUM-644 (Aug-6 amendment) — Daily Read HISTORY API client.
 *
 * Talks to:
 *   GET /v1/patients/me/daily-read/history?days=N
 *     → { buckets: [{ bucketDate, score, computedAt, tone? }], days }
 *
 * WHY A SEPARATE FILE FROM services/api/daily-read.ts
 *   The primary daily-read client throws `DailyReadFeatureDisabledError`
 *   on a flag-off 404 so the tile can distinguish "feature is dark" from
 *   "network died". The history client deliberately does NOT throw at
 *   all: a sparkline is decoration, and a missing sparkline must never
 *   be able to take down the card that owns it. Different failure
 *   contract → different module, rather than an options flag that a
 *   future caller could get wrong.
 *
 * FAILURE CONTRACT: NEVER throws. Every error path (flag-off 404,
 * network, timeout, malformed envelope) returns `{ buckets: [], days }`.
 * The caller renders no sparkline and the card keeps its existing copy.
 *
 * PHI: the envelope is a date, a 0-100 index, an ISO timestamp and a
 * categorical tone. No vitals, no copy, no identifiers. Safe to cache.
 */

import { apiClient } from '@/lib/api-client'

/** Mirrors the BE DailyReadTone union (aggregator.ts). */
export type DailyReadHistoryTone = 'positive' | 'steady' | 'attention' | 'empty'

export interface DailyReadHistoryBucket {
  /** Bare YYYY-MM-DD (UTC day the score was filed under). */
  bucketDate: string
  /**
   * 0-100 composite for that day, or null when no scoring pillar had
   * data. null is NOT zero — the sparkline must skip these, never
   * render them as a floor bar.
   */
  score: number | null
  /** ISO8601 timestamp of the aggregation that produced the row. */
  computedAt: string
  tone?: DailyReadHistoryTone
}

export interface DailyReadHistoryResponse {
  /** Chronological, oldest first. Days with no data are OMITTED. */
  buckets: DailyReadHistoryBucket[]
  /** The server-clamped window actually queried. */
  days: number
}

/** Server clamps to this range; mirrored here so the URL is never silly. */
const MIN_DAYS = 1
const MAX_DAYS = 90

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 7
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.floor(days)))
}

/**
 * Narrow one wire row into a bucket, or null if it is unusable.
 * Defensive because a graph fed a bad row renders a confidently wrong
 * picture, which is worse than rendering nothing.
 */
function normalizeBucket(raw: unknown): DailyReadHistoryBucket | null {
  if (raw == null || typeof raw !== 'object') return null
  const r = raw as Partial<DailyReadHistoryBucket>
  if (typeof r.bucketDate !== 'string' || r.bucketDate.length === 0) return null
  const score =
    typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : null
  return {
    bucketDate: r.bucketDate,
    score,
    computedAt: typeof r.computedAt === 'string' ? r.computedAt : '',
    ...(typeof r.tone === 'string' ? { tone: r.tone as DailyReadHistoryTone } : {}),
  }
}

/**
 * Fetch the patient's daily read-score history.
 *
 * @param days window size, clamped client- and server-side to [1, 90].
 * @returns always resolves; `{ buckets: [], days }` on any failure.
 */
export async function fetchDailyReadHistory(
  days: number = 7,
): Promise<DailyReadHistoryResponse> {
  const clamped = clampDays(days)
  try {
    const res = await apiClient.get<{
      success?: boolean
      data?: Partial<DailyReadHistoryResponse>
    }>('/v1/patients/me/daily-read/history', { params: { days: clamped } })

    // cos-backend sendSuccess wraps as { success, data }. Unwrap
    // defensively so a benign envelope tweak never breaks the graph.
    const body = res.data as
      | { data?: Partial<DailyReadHistoryResponse> }
      | Partial<DailyReadHistoryResponse>
      | undefined
    const shaped =
      body && typeof body === 'object' && 'data' in body && body.data
        ? (body.data as Partial<DailyReadHistoryResponse>)
        : ((body ?? {}) as Partial<DailyReadHistoryResponse>)

    const rawBuckets = Array.isArray(shaped.buckets) ? shaped.buckets : []
    const buckets = rawBuckets
      .map(normalizeBucket)
      .filter((b): b is DailyReadHistoryBucket => b !== null)

    return {
      buckets,
      days: typeof shaped.days === 'number' ? shaped.days : clamped,
    }
  } catch {
    // Swallow EVERYTHING — see the file header. A dark flag returns 404
    // here and that is a completely ordinary outcome, not an error worth
    // surfacing to a patient.
    return { buckets: [], days: clamped }
  }
}
