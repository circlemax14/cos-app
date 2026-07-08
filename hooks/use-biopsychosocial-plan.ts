import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchBiopsychosocialPlan,
  regenerateBiopsychosocialPlan,
  RegenerationInFlightError,
} from '@/services/api/biopsychosocial-plan'

/**
 * Phase 3 (COS-360 / SCRUM-518): wraps `GET /v1/health-plan/biopsychosocial`.
 *
 * Query key: ['biopsychosocial-plan']. 5-minute staleTime — the plan only
 * changes on regenerate or the monthly reassessment sweep, so it doesn't need
 * to be aggressively fresh.
 *
 * 404 `FEATURE_DISABLED` is handled inside the API client (it resolves to a
 * null plan instead of throwing), so this hook never errors purely because
 * `BIOPSYCHOSOCIAL_PLAN_ENABLED` is off — treat `data?.plan == null` as
 * "no plan yet" (flag off, or a plan hasn't been generated).
 *
 * COS-415: while a regenerate job is in flight (`data.generating === true`,
 * additive field from the interim BE lock, cos-backend PR #259) poll every
 * 3s so the UI picks up completion without the user manually pulling to
 * refresh. Once `generating` flips back to false, `refetchInterval` returns
 * `false` and polling stops naturally — react-query's own state update from
 * that transition doubles as the "one final refetch" to pick up the
 * finished plan, no extra invalidation needed here.
 */
export function useBiopsychosocialPlan() {
  return useQuery({
    queryKey: ['biopsychosocial-plan'],
    queryFn: fetchBiopsychosocialPlan,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => (query.state.data?.generating === true ? 3000 : false),
  })
}

/**
 * Mutation for `POST /v1/health-plan/biopsychosocial/regenerate`. On success,
 * invalidates ['biopsychosocial-plan'] so `useBiopsychosocialPlan` refetches
 * once the async regeneration job has had a moment to land.
 *
 * COS-415: a `RegenerationInFlightError` (409 `REGENERATION_IN_FLIGHT` — a
 * job for this patient is already running) is NOT propagated to the caller.
 * We swallow it silently and invalidate `['biopsychosocial-plan']` the same
 * as on success — that refetch will observe `generating: true` and kick off
 * `useBiopsychosocialPlan`'s polling cycle, so the UI converges on the same
 * "generating…" state regardless of whether this tap started the job or
 * just found one already in progress. Every other error still throws for
 * the caller's `onError` handler.
 */
export function useRegenerateBiopsychosocialPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        return await regenerateBiopsychosocialPlan()
      } catch (err) {
        if (err instanceof RegenerationInFlightError) {
          return null
        }
        throw err
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biopsychosocial-plan'] }),
  })
}
