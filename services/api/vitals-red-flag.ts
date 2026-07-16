/**
 * Vitals red-flag event submitter (HS-3b, SCRUM-{fe}).
 *
 * Client-computed verdicts only — NO raw metric values on the wire so
 * blood-pressure / glucose numbers never hit request bodies or logs. The
 * BE endpoint mirrors the same threshold rules in
 * cos-backend/src/services/vitals-red-flag-rules.ts, so severity labels
 * agree by construction. Any threshold change MUST bump RULES_VERSION in
 * lib/vitals-red-flag-rules.ts AND its BE twin.
 *
 * Backend: POST /v1/patients/me/vitals-red-flag-event
 *   200 { success: true, data: { accepted: true } }   flag on, accepted
 *   204 (empty)                                       flag off — returns null
 *
 * Callers use hooks/use-post-vitals-red-flag.ts (React Query mutation)
 * and fire-and-forget with .catch — a network blip must never block the
 * local UX or the local recheck notification.
 */

import { apiClient } from '@/lib/api-client';
import type { MetricType, Severity } from '../../lib/vitals-red-flag-rules';

export interface VitalsRedFlagEventBody {
  metricType: MetricType;
  // Only amber | red are POSTed — green / info are noise and never sent.
  severity: Exclude<Severity, 'green' | 'info'>;
  // ISO 8601 with timezone, e.g. '2026-07-16T08:15:00.000Z'.
  observedAt: string;
  source?: 'apple-health' | 'self-report';
}

export interface VitalsRedFlagEventAccepted {
  accepted: boolean;
}

/**
 * POST a client-computed red-flag verdict. Resolves to `null` when the
 * server responds 204 (VITALS_RED_FLAG_ENABLED is unset/false on the
 * stage) so the caller never has to condition on the flag.
 */
export async function postVitalsRedFlagEvent(
  body: VitalsRedFlagEventBody,
): Promise<VitalsRedFlagEventAccepted | null> {
  const res = await apiClient.post<{ success: boolean; data: VitalsRedFlagEventAccepted }>(
    '/v1/patients/me/vitals-red-flag-event',
    body,
  );
  if (res.status === 204) return null;
  return res.data?.data ?? null;
}
