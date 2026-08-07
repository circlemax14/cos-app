/**
 * services/api/wellbeing-score.ts — Ken 2026-08-06.
 *
 * Client for the server-computed Wellbeing Score V2 endpoints
 * (cos-backend PR #366 + #367). Both are protected + dark-launched
 * behind `WELLBEING_SCORE_V2_ENABLED` (already ON prod since 2026-07-30);
 * the endpoints 404 FEATURE_DISABLED while the flag is OFF, so this
 * client returns null/empty on 404 to let callers degrade gracefully
 * (Home tile keeps rendering from client-side derivation).
 *
 * Two endpoints:
 *   GET  /v1/patients/me/wellbeing-score
 *        → { overall, band, components[], computedAt, computedFrom }
 *   GET  /v1/patients/me/wellbeing-score/history?days=N
 *        → { buckets: [{bucketDate, overall, band, computedAt}], days }
 *
 * PHI hygiene: the endpoint envelope is categorical only (score +
 * band + timestamp), never raw signals. Safe to cache in React Query.
 */

import { apiClient } from '@/lib/api-client'

// ── Shared types (mirror cos-backend/src/services/wellbeing-score.service.ts) ─

export type WellbeingBand = 'optimal' | 'developing' | 'foundational' | 'initial'

/**
 * Component names emitted by the V2 formula. Ken 2026-08-06 iter 2:
 *   self-assessments 40% · sleep 20% · adherence 20% · lab-results 10% · wearables 10%.
 * `wellness-wheel` is a reserved name — weight 0 today.
 * `lab-results` + `wearables` currently emit null-scored components
 * until their data sources are wired; the FE renders them with a
 * "coming soon" caption in the meantime.
 */
export type WellbeingComponentName =
  | 'self-assessments'
  | 'wellness-wheel'
  | 'sleep'
  | 'wearables'
  | 'adherence'
  | 'lab-results'

export interface WellbeingComponentFreshness {
  newestAssessmentAt: string | null
  instrumentCount: number
}

export interface WellbeingComponent {
  name: WellbeingComponentName
  /** 0-100 subscore, or null when the component has no data. */
  score: number | null
  /** Effective weight in the composite (redistributed when a component is null). */
  weight: number
  contribution: number | null
  freshness: WellbeingComponentFreshness
}

export interface WellbeingScoreResponse {
  overall: number | null
  band: WellbeingBand | null
  components: WellbeingComponent[]
  computedAt: string
  computedFrom?: 'cache' | 'fresh'
}

export interface WellbeingHistoryBucket {
  bucketDate: string
  overall: number | null
  band: WellbeingBand | null
  computedAt: string
}

export interface WellbeingHistoryResponse {
  buckets: WellbeingHistoryBucket[]
  days: number
}

// ── Endpoint clients ────────────────────────────────────────────────────

/**
 * `GET /v1/patients/me/wellbeing-score` — today's composite.
 * Returns null on 404 (flag OFF or endpoint absent) so callers can
 * degrade to client-side derivation without try/catch noise.
 */
export async function fetchWellbeingScore(): Promise<WellbeingScoreResponse | null> {
  try {
    const res = await apiClient.get<{ success: boolean; data: WellbeingScoreResponse }>(
      '/v1/patients/me/wellbeing-score',
    )
    return res.data?.data ?? null
  } catch (err) {
    // Any error (404 flag-off, network, timeout) → null. Callers already
    // handle missing data. NEVER throws — the wellbeing tile must never
    // become a crash surface.
    return null
  }
}

/**
 * `GET /v1/patients/me/wellbeing-score/history?days=N` — chronological
 * daily buckets from the cache table. Empty array on any failure. `days`
 * is clamped server-side to [1, 90]; caller should still pass a
 * reasonable value.
 */
export async function fetchWellbeingHistory(
  days: number,
): Promise<WellbeingHistoryResponse> {
  try {
    const clamped = Math.max(1, Math.min(90, Math.floor(days)))
    const res = await apiClient.get<{ success: boolean; data: WellbeingHistoryResponse }>(
      `/v1/patients/me/wellbeing-score/history?days=${clamped}`,
    )
    const data = res.data?.data
    return {
      buckets: Array.isArray(data?.buckets) ? data.buckets : [],
      days: typeof data?.days === 'number' ? data.days : clamped,
    }
  } catch {
    return { buckets: [], days: Math.max(1, Math.min(90, Math.floor(days))) }
  }
}
