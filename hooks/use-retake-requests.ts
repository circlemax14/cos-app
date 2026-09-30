/**
 * COS-482 Phase 1 — React Query wrappers for the patient-side retake-request
 * surface. Mirrors the ergonomic shape of hooks/use-patient-intake.ts and
 * hooks/use-care-gaps.ts (flat kebab-case query keys, invalidate-on-success).
 *
 * The list query is intentionally cache-hot (staleTime 30s) so a rapid revisit
 * to Home doesn't re-network — the card is a nudge surface, not a hot list,
 * and the push handler already forces a refetch (see chunk in
 * lib/notification-routing.ts + hooks/use-notifications.ts:onResponse).
 *
 * Both mutations optimistically drop the row from the cached list so the card
 * disappears same-tick — even if the server round-trip lags, the patient sees
 * an immediate "acknowledged" response to their tap. On error we roll back and
 * a toast surfaces (owned by the calling component).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  dismissRetakeRequest,
  fetchPendingRetakeRequests,
  snoozeRetakeRequest,
  type PatientRetakeRequestView,
  type RetakeDismissReason,
} from '@/services/api/retake-requests'

/** Shared query key for the patient-self pending retake requests. */
export const RETAKE_REQUESTS_QUERY_KEY = ['retake-requests', 'me'] as const

/**
 * List the current patient's PENDING retake requests. The card at the top of
 * Home reads this and renders when `data.length > 0`; empty → don't render
 * (silent-drop pattern, matches AssessmentDueBanner).
 */
export function usePendingRetakeRequests() {
  return useQuery({
    queryKey: RETAKE_REQUESTS_QUERY_KEY,
    queryFn: fetchPendingRetakeRequests,
    staleTime: 30_000,
    /*
     * COS-1176 — a new request must reach the patient WITHOUT a push.
     *
     * Vishal, 2026-09-30: "if I am on the plan screen and if I re-initiate a
     * retake assessment ... ideally it should automatically change".
     *
     * It already did, but by exactly one route: use-notifications invalidates
     * this key on an ASSESSMENT_RETAKE_REQUESTED push while the app is
     * foregrounded. With notifications denied, a dropped push, or a simulator
     * without a token, nothing else ever looked again — `staleTime` with no
     * interval means a patient can sit on the plan screen indefinitely while a
     * BLOCKING gate waits on data the app is not fetching.
     *
     * 60s while mounted, and only while mounted. The push stays the fast path
     * (it invalidates, so it is immediate); this is the floor under it.
     * Deliberately not shorter: the gate is a nudge, not a live feed, and this
     * query is mounted on Home, the plan screen and the gate at once.
     */
    refetchInterval: 60_000,
    // A request issued while the app was backgrounded should be waiting when
    // the patient comes back, not 60s after.
    refetchOnMount: true,
    refetchOnReconnect: true,
    // The BE is flag-gated OFF by default; fetchPendingRetakeRequests swallows
    // the 404 to [] so this query never enters an error state during dark
    // ship — the card just silent-drops. Belt-and-braces: also disable retry
    // so we don't paper over a real failure with three network taps.
    retry: 1,
  })
}

/**
 * POST /:id/snooze — patient defers the request. Optimistically drops the row
 * from the cached list so the card removes itself same-tick. On failure we
 * roll back so the card re-appears and the caller can toast.
 */
export function useSnoozeRetakeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; untilIso: string }) =>
      snoozeRetakeRequest(args.id, args.untilIso),
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: RETAKE_REQUESTS_QUERY_KEY })
      const prev = qc.getQueryData<PatientRetakeRequestView[]>(RETAKE_REQUESTS_QUERY_KEY)
      if (prev) {
        qc.setQueryData<PatientRetakeRequestView[]>(
          RETAKE_REQUESTS_QUERY_KEY,
          prev.filter((r) => r.id !== args.id),
        )
      }
      return { prev }
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(RETAKE_REQUESTS_QUERY_KEY, ctx.prev)
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: RETAKE_REQUESTS_QUERY_KEY })
    },
  })
}

/**
 * POST /:id/dismiss — patient declined the ask. Same optimistic-drop pattern
 * as snooze. `not_applicable` maps to Ken's "doesn't apply to me" preset; the
 * `declined` reason is reserved for future UI (Phase 2).
 */
export function useDismissRetakeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; reason: RetakeDismissReason }) =>
      dismissRetakeRequest(args.id, args.reason),
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: RETAKE_REQUESTS_QUERY_KEY })
      const prev = qc.getQueryData<PatientRetakeRequestView[]>(RETAKE_REQUESTS_QUERY_KEY)
      if (prev) {
        qc.setQueryData<PatientRetakeRequestView[]>(
          RETAKE_REQUESTS_QUERY_KEY,
          prev.filter((r) => r.id !== args.id),
        )
      }
      return { prev }
    },
    onError: (_err, _args, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(RETAKE_REQUESTS_QUERY_KEY, ctx.prev)
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: RETAKE_REQUESTS_QUERY_KEY })
    },
  })
}
