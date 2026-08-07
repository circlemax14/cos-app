/**
 * services/api/health-age-history.ts — Health Age history (graphable).
 *
 * Client for the richer projection of
 * `GET /v1/patients/me/health-age/history?days=N`:
 *
 *   { buckets: [{ bucketDate, healthAge, chronologicalAge, delta, computedAt }], days }
 *
 * WHY A SEPARATE FILE FROM services/api/health-age.ts
 *   health-age.ts ships `getHealthAgeHistory()`, which reads the LEGACY
 *   `points` projection (`{bucketDate, overall, healthAgeGap}`) and
 *   THROWS `HealthAgeFeatureDisabledError` on a flag-off 404. The trend
 *   surfaces on the detail screen need two different behaviours:
 *     - the richer `buckets` shape (chronologicalAge per bucket, so a
 *       birthday inside the window can't skew a client-recomputed delta),
 *     - and total failure tolerance — a missing sparkline must never
 *       throw into the screen's render or show a scary error. The backend
 *       still emits `points` for older binaries, so both clients coexist.
 *
 * FAILURE POLICY: this module NEVER throws. Flag-off 404, network
 * outage, malformed envelope — all collapse to `{ buckets: [], days }`,
 * which the UI renders as "your history is still building".
 *
 * Terminology (Legal): "Health Age" only — never "Biological Age".
 */

import { apiClient } from '@/lib/api-client'

/** Widest window the backend will serve (matches the 90-day row TTL). */
export const MAX_HEALTH_AGE_HISTORY_DAYS = 90

/**
 * One day of Health Age history.
 *
 * `delta` is `healthAge - chronologicalAge`. NEGATIVE IS GOOD — it means
 * the Health Age estimate sits below the patient's actual age. Every
 * consumer that renders this MUST say so in words; a chart alone reads
 * backwards to most people.
 */
export interface HealthAgeHistoryBucket {
  /** YYYY-MM-DD UTC bucket. */
  bucketDate: string
  /** Health Age in years for that day, or null on an insufficient-data day. */
  healthAge: number | null
  /** The patient's actual age ON THAT DAY, as recorded in the snapshot. */
  chronologicalAge: number | null
  /** healthAge - chronologicalAge. Lower (more negative) is better. */
  delta: number | null
  /** ISO 8601 of the computation, or null on legacy rows. */
  computedAt: string | null
}

export interface HealthAgeHistoryBucketsResponse {
  buckets: HealthAgeHistoryBucket[]
  days: number
}

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 30
  return Math.max(1, Math.min(MAX_HEALTH_AGE_HISTORY_DAYS, Math.floor(days)))
}

/**
 * Coerce one raw bucket defensively. Anything non-numeric becomes null
 * rather than 0 — a 0 would render as "your Health Age was zero that
 * day", which is both alarming and wrong.
 */
function normalizeBucket(raw: unknown): HealthAgeHistoryBucket | null {
  if (raw == null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.bucketDate !== 'string') return null
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  return {
    bucketDate: r.bucketDate,
    healthAge: num(r.healthAge),
    chronologicalAge: num(r.chronologicalAge),
    delta: num(r.delta),
    computedAt: typeof r.computedAt === 'string' ? r.computedAt : null,
  }
}

/**
 * Fetch the trailing `days`-day Health Age history (inclusive of today).
 * Missing days are simply absent from `buckets` — the backend does not
 * zero-fill and neither do we.
 *
 * Never rejects. On any failure the caller gets an empty series.
 */
export async function fetchHealthAgeHistory(
  days: number = 30,
): Promise<HealthAgeHistoryBucketsResponse> {
  const clamped = clampDays(days)
  try {
    const res = await apiClient.get<{ success?: boolean; data?: unknown }>(
      `/v1/patients/me/health-age/history?days=${clamped}`,
    )
    // cos-backend `sendSuccess` wraps payloads as { success, data }.
    // Unwrap defensively so a benign envelope tweak can't blank the chart.
    const body: unknown = res.data
    const payload =
      body != null && typeof body === 'object' && 'data' in (body as object)
        ? (body as { data?: unknown }).data
        : body
    const shaped = (payload ?? {}) as { buckets?: unknown; days?: unknown }
    const buckets = Array.isArray(shaped.buckets)
      ? shaped.buckets
          .map(normalizeBucket)
          .filter((b): b is HealthAgeHistoryBucket => b !== null)
      : []
    return {
      buckets,
      days: typeof shaped.days === 'number' ? shaped.days : clamped,
    }
  } catch {
    // Flag-off 404 / network failure / auth blip. Degrade to "no history"
    // — the screen shows its own "history is still building" empty state.
    return { buckets: [], days: clamped }
  }
}
