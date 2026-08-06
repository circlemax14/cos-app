/**
 * React Query hooks for Health-Plan Medication Management (COS-357 / SCRUM-504).
 *
 * One query (`['plan-medications']`) for the GET, one mutation for the PUT.
 * The mutation invalidates the query on success so the list re-fetches the
 * server-recomputed supply/refill state. We also seed the cache from the PUT
 * response for an instant update before the invalidation settles.
 *
 * Flag-gating lives in the consuming component: it renders nothing unless
 * `query.data.flagEnabled === true`. The query itself always runs (it's the
 * source of the flag), but the service returns a disabled empty result on
 * any error so this never breaks the screen.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPlanMedications,
  updatePlanMedications,
  type PlanMedicationsResponse,
  type UpdatePlanMedicationsBody,
} from '@/services/api/plan-medications';

const PLAN_MEDICATIONS_KEY = ['plan-medications'] as const;
const PLAN_MEDICATIONS_WITH_PAST_KEY = ['plan-medications', 'includePast'] as const;

/**
 * Ken 2026-08-05 — `includePast` opt-in threads through to the BE's
 * `?includePast=1` query param. When true, the response includes
 * discontinued meds with `discontinuedAt` populated so the FE can
 * split Active vs Past client-side. Cached under a separate query key
 * so surfaces that DON'T want past meds (e.g. the plan banner) never
 * accidentally consume a response inflated with discontinued rows.
 */
export function usePlanMedications(opts: { includePast?: boolean } = {}) {
  const includePast = opts.includePast === true;
  return useQuery<PlanMedicationsResponse>({
    queryKey: includePast ? PLAN_MEDICATIONS_WITH_PAST_KEY : PLAN_MEDICATIONS_KEY,
    queryFn: () => fetchPlanMedications({ includePast }),
    staleTime: 60_000,
  });
}

export function useUpdatePlanMedications(opts: { includePast?: boolean } = {}) {
  const includePast = opts.includePast === true;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanMedicationsBody) => updatePlanMedications(body, { includePast }),
    onSuccess: (medications, variables) => {
      // Seed the cache immediately, preserving the existing flag state, then
      // invalidate so the next read re-confirms with the server. The PUT only
      // returns the medication list, so we carry over the review fields from
      // the prior cache — and optimistically clear medsReviewNeeded when this
      // mutation confirmed the review, so the prompt disappears at once.
      const seedKey = includePast ? PLAN_MEDICATIONS_WITH_PAST_KEY : PLAN_MEDICATIONS_KEY;
      qc.setQueryData<PlanMedicationsResponse>(seedKey, (prev) => {
        const confirmed = variables.confirmReview === true;
        return {
          flagEnabled: prev?.flagEnabled ?? true,
          medications,
          medsReviewNeeded: confirmed ? false : prev?.medsReviewNeeded ?? false,
          medsReviewedAt: confirmed ? new Date().toISOString() : prev?.medsReviewedAt ?? null,
        };
      });
      // Invalidate BOTH cache variants so the banner (default key) and the
      // full-list surface (includePast key) both refetch after any mutation.
      // Otherwise a discontinue action wouldn't update the banner count
      // until the 60s staleTime elapses.
      qc.invalidateQueries({ queryKey: PLAN_MEDICATIONS_KEY });
      qc.invalidateQueries({ queryKey: PLAN_MEDICATIONS_WITH_PAST_KEY });
    },
  });
}
