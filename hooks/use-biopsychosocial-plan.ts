import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchBiopsychosocialPlan,
} from '@/services/api/biopsychosocial-plan'
// `updatePlanGoal` service export is intentionally not imported here after
// chunk 41 — the mutationFn now uses `fireAndForgetPut` directly. Service
// export stays live in `services/api/ai-health-plan.ts` so revert is a
// one-line re-import + 3-line mutationFn restore.
import type { GoalPatch } from '@/services/api/ai-health-plan'
import { fireAndForgetPost, fireAndForgetPut } from '@/components/unified-plan/v2/net'

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
 */
export function useBiopsychosocialPlan() {
  return useQuery({
    queryKey: ['biopsychosocial-plan'],
    queryFn: fetchBiopsychosocialPlan,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Mutation for `POST /v1/health-plan/biopsychosocial/regenerate`.
 *
 * CHUNK 40 (2026-07-21): rewritten to fire-and-forget via `fireAndForgetPost`
 * from `v2/net.ts`. The prior `await regenerateBiopsychosocialPlan()` was an
 * awaited axios response inside a tap-triggered mutation — the exact
 * chunk-9.5 SIGABRT shape on iOS 26.5 (turbomodule queue). No response is
 * awaited here; server state is reconciled on the next
 * `['biopsychosocial-plan']` fetch (invalidated in `onSuccess`), which will
 * observe `generating: true` and the existing poll cycle converges the UI.
 *
 * Because nothing awaits the response, the old 409 `REGENERATION_IN_FLIGHT`
 * (`RegenerationInFlightError`) swallow is structurally unnecessary — the
 * fire-and-forget `.catch` inside `net.ts` is the replacement. The service
 * export (`regenerateBiopsychosocialPlan` + `RegenerationInFlightError`)
 * stays in place so tests continue to import them and a one-line hook
 * restore is the calm-window revert path.
 *
 * We keep `useMutation` (rather than an inline fire-and-forget) so
 * `mutation.isPending` remains available synchronously on tap for the CTA's
 * disabled state — closes the extra-tap re-enable window.
 */
// CHUNK 40 fix (adversarial-verify blocker): minimum pending window.
// fireAndForgetPost only awaits getAccessToken (a memory read) then
// returns — so a naive `mutationFn: fireAndForgetPost(...)` resolves in
// ~1ms and mutation.isPending flips back to false before Bedrock has even
// received the POST. That re-enables the "Refresh my plan" CTA within a
// frame and lets the user multi-tap-fire multiple regen jobs, and
// onSuccess's invalidateQueries races back to the pre-regen snapshot.
// Fix: wrap the fire-and-forget in a promise that resolves after
// PENDING_WINDOW_MS. This keeps mutation.isPending true for a bounded
// window matching Bedrock's p95 (~8-15s) with tail headroom, so the CTA
// stays visibly regenerating and onSuccess (invalidate) fires AFTER the
// server has had time to record generating:true.
const REGENERATE_PENDING_WINDOW_MS = 30_000

export function useRegenerateBiopsychosocialPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => {
      // Fire the actual request immediately — no await (chunk 9.5 rule).
      void fireAndForgetPost('/v1/health-plan/biopsychosocial/regenerate', {})
      // Return a promise that keeps mutation.isPending latched for the
      // pending window. See comment above.
      return new Promise<void>((resolve) =>
        setTimeout(resolve, REGENERATE_PENDING_WINDOW_MS),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biopsychosocial-plan'] }),
  })
}

/**
 * COS-433: named-hook wrapper for editing a biopsychosocial goal via the
 * shared `updatePlanGoal` endpoint. Same REST call as legacy's
 * `useUpdatePlanGoal`, but this variant also invalidates
 * `['biopsychosocial-plan']` (in addition to `['ai-health-plan']`) so the
 * bio surface reflects the edit as soon as the mutation resolves. Moving
 * this out of `BiopsychosocialPlanScreen`'s inline `useMutation` was one
 * of the two structural asymmetries the July 10 forensic flagged as
 * unique to bio vs. legacy — see project_ios26_biopsychosocial_parked.md.
 *
 * CHUNK 41 (2026-07-21): rewritten to fire-and-forget via `fireAndForgetPut`
 * from `v2/net.ts` (chunk 37 helper), same template as chunk 40's
 * `useRegenerateBiopsychosocialPlan`. The prior `await updatePlanGoal()`
 * was an awaited axios response inside a tap-triggered mutation whose
 * Save button was bound from a still-mounted Modal — the exact chunk-9.5
 * SIGABRT shape on iOS 26.5 (turbomodule queue). Chunks 9.5 / 32 / 34 / 37
 * document the pattern; chunk 40 established the pending-window latch.
 *
 * Endpoint verb: PUT — verified against
 * `services/api/ai-health-plan.ts:150-156` (`apiClient.put`). The audit
 * brief said PATCH; that was incorrect. If `updatePlanGoal` is ever
 * swapped to PATCH, swap this call to `fireAndForgetPatch` (also exported
 * from `v2/net.ts`).
 *
 * The service export (`updatePlanGoal`) stays in place so tests continue
 * to import it and a one-line mutationFn restore is the calm-window
 * revert path.
 *
 * Two callers today: `app/Home/biopsychosocial-plan.tsx` (Modal closes
 * same-tick, so `mutation.isPending` is presentational dead code there)
 * and `app/Home/health-plan.tsx` (Modal stays mounted; `isPending` still
 * drives the Save spinner for the full pending window). If a future
 * caller re-awaits `mutateAsync`, they lose the chunk-9.5 protection —
 * see the same-tick close in biopsychosocial-plan.tsx for the correct
 * shape.
 *
 * iOS background-timer note: the setTimeout latch below can be delayed
 * when the app is backgrounded — invalidateQueries then fires on next
 * foreground. Not a correctness issue (5min staleTime + pull-to-refresh
 * reconcile), just don't chase a phantom.
 */
// See chunk 40's REGENERATE_PENDING_WINDOW_MS comment for the mechanism.
// A single-goal DDB write is much cheaper than a Bedrock regen — 8s is
// enough headroom for cold-Lambda + DDB write + read-back on p95 while
// keeping the Save spinner on health-plan.tsx from feeling stuck. If
// canary p99 goal-edit latency on Ken's build 62 blows past this, bump
// to 15s.
const EDIT_GOAL_PENDING_WINDOW_MS = 8_000

export function useUpdateBioGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, patch }: { goalId: string; patch: GoalPatch }) => {
      // Fire the actual PUT immediately — no await (chunk 9.5 rule).
      void fireAndForgetPut(
        `/v1/patients/me/health-plan/ai/goals/${encodeURIComponent(goalId)}`,
        patch as unknown as Record<string, unknown>,
      )
      // Latch mutation.isPending for the pending window so onSuccess
      // (invalidate) fires AFTER the server has landed the write.
      return new Promise<void>((resolve) =>
        setTimeout(resolve, EDIT_GOAL_PENDING_WINDOW_MS),
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biopsychosocial-plan'] })
      qc.invalidateQueries({ queryKey: ['ai-health-plan'] })
    },
  })
}
