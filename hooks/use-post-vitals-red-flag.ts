import { useMutation } from '@tanstack/react-query';
import {
  postVitalsRedFlagEvent,
  type VitalsRedFlagEventBody,
} from '@/services/api/vitals-red-flag';

/**
 * HS-3b: thin React Query `useMutation` wrapper around
 * `postVitalsRedFlagEvent` (POST /v1/patients/me/vitals-red-flag-event).
 *
 * Intended usage: fire-and-forget from the vitals red-flag notifications
 * observer. Callers should use `.mutate(body)` (NOT `.mutateAsync`) and
 * attach a `.catch(() => {})` at the call site so a transient network
 * failure never blocks the local UX or the scheduled local recheck
 * notification. The server-side endpoint is best-effort as well and
 * returns 204 (which `postVitalsRedFlagEvent` maps to `null`) whenever
 * the `VITALS_RED_FLAG_ENABLED` dark-launch flag is off, so the client
 * does not need to condition on the flag.
 *
 * No query invalidation on success: the summary prompt reads red flags
 * server-side via the DDB `cos-health-plans` table, and the FE surface
 * (`VitalsRedFlagSection`) is computed locally from Apple Health trends
 * — neither depends on a cached query key that this POST would refresh.
 */
export function usePostVitalsRedFlag() {
  return useMutation({
    mutationFn: (body: VitalsRedFlagEventBody) => postVitalsRedFlagEvent(body),
  });
}
