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

export function usePlanMedications() {
  return useQuery<PlanMedicationsResponse>({
    queryKey: PLAN_MEDICATIONS_KEY,
    queryFn: fetchPlanMedications,
    staleTime: 60_000,
  });
}

export function useUpdatePlanMedications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanMedicationsBody) => updatePlanMedications(body),
    onSuccess: (medications) => {
      // Seed the cache immediately, preserving the existing flag state, then
      // invalidate so the next read re-confirms with the server.
      qc.setQueryData<PlanMedicationsResponse>(PLAN_MEDICATIONS_KEY, (prev) => ({
        flagEnabled: prev?.flagEnabled ?? true,
        medications,
      }));
      qc.invalidateQueries({ queryKey: PLAN_MEDICATIONS_KEY });
    },
  });
}
