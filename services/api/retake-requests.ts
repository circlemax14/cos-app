import { apiClient } from '@/lib/api-client'

/**
 * COS-482 Phase 1 — patient-side API client for the retake-request feature.
 *
 * Three thin wrappers over `/v1/patients/me/retake-requests`, served by
 * cos-backend's `patientRetakeRequestRouter`. Every route is flag-gated
 * behind `RETAKE_REQUEST_ENABLED` on the Lambda env (default OFF); with
 * the flag OFF every call returns `404 FEATURE_DISABLED` and this module
 * collapses that into an empty list / a swallowed no-op so an older client
 * never crashes when the BE surface is disabled.
 *
 * The `RetakeDismissReason` values match the BE zod enum
 * (`not_applicable | declined`) — the Ken-approved patient sheet ships both
 * "1 day / 3 days / weekend" snoozes and a "doesn't apply to me" dismiss.
 */

/** BE-emitted status set. Only `pending` rows ever surface on the patient side. */
export type RetakeRequestStatus =
  | 'pending'
  | 'completed'
  | 'snoozed'
  | 'dismissed_by_patient'
  | 'expired'

export type RetakeDismissReason = 'not_applicable' | 'declined'

/**
 * Patient-side card view. Additive fields on top of the base row that the BE
 * enriches for the mobile inbox (see
 * cos-backend/src/services/retake-request.service.ts:listPendingForPatientEnriched).
 * `note` is the CM's freeform note (CM audit only on the wire but rendered to
 * the patient here — the BE contract is that it never carries PII beyond a
 * short human sentence).
 */
export interface PatientRetakeRequestView {
  id: string
  patientId: string
  instrumentKey: string
  requesterUserId: string
  requesterRole: string
  requesterAccountId: string | null
  accountId: string | null
  note?: string
  status: RetakeRequestStatus
  createdAt: string
  expiresAt: string
  snoozeUntil?: string
  completedAt?: string
  dismissedAt?: string
  dismissReason?: RetakeDismissReason
  reminderCount?: number
  requesterFirstName: string
  agencyName: string | null
  instrumentDisplayName: string
  estMinutes: number
}

const BASE = '/v1/patients/me/retake-requests'

/**
 * List PENDING retake requests targeting the current patient. Returns `[]` on
 * any failure (network, 404 FEATURE_DISABLED, 401, malformed envelope) —
 * the inbox card is a nudge surface and MUST silent-drop when the BE isn't
 * ready, so a card never renders "we couldn't load" chrome.
 */
export async function fetchPendingRetakeRequests(): Promise<PatientRetakeRequestView[]> {
  try {
    const res = await apiClient.get<{
      success: boolean
      data: { items: PatientRetakeRequestView[] }
    }>(BASE)
    const items = res.data?.data?.items
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

/**
 * POST /:id/snooze — defer the request until an ISO timestamp in the future.
 * Throws on non-2xx so the caller (mutation hook) can surface a toast + keep
 * the card visible on failure. The BE enforces `until` is a future ISO in the
 * next 60 days — a past `until` returns 422.
 */
export async function snoozeRetakeRequest(id: string, untilIso: string): Promise<void> {
  await apiClient.post(`${BASE}/${encodeURIComponent(id)}/snooze`, { until: untilIso })
}

/**
 * POST /:id/dismiss — patient declined ("doesn't apply to me" or "not now
 * forever"). BE writes a durable audit row so the CM's view surfaces the
 * decline in Phase 2. Throws on non-2xx (see snooze).
 */
export async function dismissRetakeRequest(
  id: string,
  reason: RetakeDismissReason,
): Promise<void> {
  await apiClient.post(`${BASE}/${encodeURIComponent(id)}/dismiss`, { reason })
}
