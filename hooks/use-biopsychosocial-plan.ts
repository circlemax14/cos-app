import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchBiopsychosocialPlan,
  type BiopsychosocialPlanResponse,
  type SectionPlan,
  type MeasurableGoal,
} from '@/services/api/biopsychosocial-plan'
// `updatePlanGoal` service export is intentionally not imported here after
// chunk 41 — the mutationFn now uses `fireAndForgetPut` directly. Service
// export stays live in `services/api/ai-health-plan.ts` so revert is a
// one-line re-import + 3-line mutationFn restore.
import type { GoalPatch } from '@/services/api/ai-health-plan'
import {
  fireAndForgetDelete,
  fireAndForgetPost,
  fireAndForgetPut,
} from '@/components/unified-plan/v2/net'
// SCRUM-651: pure helpers live in `lib/bio-regeneration.ts` so a node:test
// unit test can load them without a React harness. Re-exported below so
// external callers can keep importing them from this module unchanged.
import {
  DEFAULT_CLIENT_BANNER_SWAP_SECONDS,
  DEFAULT_STUCK_JOB_THRESHOLD_SECONDS,
  computeElapsedSec,
  formatRegenerationElapsed,
  resolveRegenerationThresholds,
} from '@/lib/bio-regeneration'

export {
  DEFAULT_CLIENT_BANNER_SWAP_SECONDS,
  DEFAULT_STUCK_JOB_THRESHOLD_SECONDS,
  formatRegenerationElapsed,
} from '@/lib/bio-regeneration'

/**
 * SCRUM-651: fine-grained "elapsed since jobStartedAt" ticker.
 *
 * Rationale — the pre-651 code used a static `REGENERATE_PENDING_WINDOW_MS`
 * latch (setTimeout inside the mutationFn) to keep the CTA visibly pending
 * for a fixed 30s window. That worked for the p50 Bedrock roundtrip but
 * broke down for slow paths: past 5 minutes we need to swap the active
 * "generating for a while" copy for a passive "we'll notify you" banner,
 * and past 45 minutes we need a stuck-job affordance. Neither transition
 * is possible from a one-shot setTimeout — the component has no live
 * signal after the latch expires.
 *
 * This selector reads jobStartedAt from wherever the caller passes it
 * (typically `planQuery.data?.jobStartedAt`), computes elapsed seconds
 * against a state cell that ticks once/sec, and derives the two boolean
 * transitions the UI actually branches on. When `jobStartedAt` is
 * undefined (no job in flight) we skip the interval entirely so the hook
 * costs nothing at idle — matches the "no wasted work" discipline chunks
 * 77 / 86 established for the regen surface.
 *
 * iOS 26.5 envelope: setInterval with a plain state setter is the same
 * primitive shape shipped in chunks 77 + 86 (both currently in prod
 * unmodified). No Animated/ActivityIndicator/native timer bridge.
 *
 * Background clocks: when the app is backgrounded, JS timers are throttled
 * or paused by iOS/Android. On foreground the effect's cleanup runs and
 * the next tick recomputes elapsed against `Date.now()` — so we always
 * catch up to reality within one tick, no drift beyond 1s.
 */
export interface BioRegenerationStatus {
  /** Seconds since `jobStartedAt`. 0 when no job is in flight or timestamp is invalid. */
  elapsedSec: number
  /** True once elapsed > effective clientBannerSwapSeconds (server override or 300s default). */
  isPast5MinBanner: boolean
  /** True once elapsed > effective stuckJobThresholdSeconds (server override or 2700s default). */
  isPastStuckThreshold: boolean
  /** The effective thresholds resolved for this tick — exposed so tests + callers can assert. */
  bannerSwapSeconds: number
  stuckThresholdSeconds: number
}

export function useBioRegenerationStatus(
  jobStartedAtIso: string | undefined,
  overrides?: { clientBannerSwapSeconds?: number; stuckJobThresholdSeconds?: number },
): BioRegenerationStatus {
  const { bannerSwapSeconds, stuckThresholdSeconds } = resolveRegenerationThresholds(overrides)

  // Anchor is the tick counter, not `Date.now()` — we want a stable render
  // identity that only changes on the 1s tick, otherwise every parent
  // re-render would recompute elapsed against a slightly different `now`
  // and re-render children needlessly.
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    if (!jobStartedAtIso) return
    // Refresh immediately on mount / jobStartedAt change so the first paint
    // isn't stuck on a stale nowMs from a previous idle period.
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [jobStartedAtIso])

  const elapsedSec = computeElapsedSec(jobStartedAtIso, nowMs)
  return {
    elapsedSec,
    // The threshold comparisons stay in-hook (not in the pure helper)
    // because they're trivial and inlining them here keeps the return
    // shape colocated with the tick anchor — one look at this function
    // shows the whole live-tick contract.
    isPast5MinBanner: !!jobStartedAtIso && elapsedSec > bannerSwapSeconds,
    isPastStuckThreshold: !!jobStartedAtIso && elapsedSec > stuckThresholdSeconds,
    bannerSwapSeconds,
    stuckThresholdSeconds,
  }
}

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
// SCRUM-651: the pre-651 static REGENERATE_PENDING_WINDOW_MS (30s) latch
// is now the SHORT bridge window only — just enough for the
// fire-and-forget POST to land server-side and the next
// ['biopsychosocial-plan'] fetch to observe `generating: true` +
// `jobStartedAt`. Once that lands, the LIVE-ticking
// `useBioRegenerationStatus(jobStartedAt)` selector takes over as the
// source of truth for the extended pending UX (>5min copy swap,
// >45min stuck-job affordance). Keeping this bridge preserves the
// chunk-40 fix (mutation.isPending flip only happens after the server
// state has landed, no multi-tap race) while unlocking the >5min /
// >45min transitions the static latch structurally couldn't reach.
//
// 5s bridge = comfortably longer than the fire-and-forget POST +
// network jitter but short enough that the shared mutation-key
// observer (chunks 67 / 77) hands off cleanly to server-truth once
// the GET refetch resolves.
const REGENERATE_BRIDGE_WINDOW_MS = 5_000

/**
 * CHUNK 67 (2026-07-23): mutation key so that OTHER components can
 * observe pending state cross-instance via `useIsMutating({ mutationKey })`.
 * Without a key, useMutation's `isPending` is scoped to the individual
 * hook instance — meaning the picker fires .mutate() then unmounts on
 * router.replace, and BpsWellbeingScoreCard's own hook instance would
 * see isPending=false even though the mutation is still in flight. The
 * shared mutation key + useIsMutating pair lets any screen render the
 * "Processing…" state during the pending window.
 */
export const REGENERATE_BIO_PLAN_MUTATION_KEY = ['regen-biopsychosocial-plan'] as const

/**
 * SCRUM-651: mutation key for the cancel-in-flight action. Separate from the
 * regen key so `useIsMutating({ mutationKey })` can distinguish "a cancel is
 * pending" from "a regen is pending" — the CTA needs to disable during cancel
 * even though `generating` may still be true server-side for a beat.
 */
export const CANCEL_BIO_PLAN_MUTATION_KEY = ['cancel-biopsychosocial-plan'] as const

export function useRegenerateBiopsychosocialPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: [...REGENERATE_BIO_PLAN_MUTATION_KEY],
    mutationFn: () => {
      // Fire the actual request immediately — no await (chunk 9.5 rule).
      void fireAndForgetPost('/v1/health-plan/biopsychosocial/regenerate', {})
      // Bridge only. See REGENERATE_BRIDGE_WINDOW_MS comment above — this
      // no longer covers the whole pending UX (the live-ticking selector
      // does), only the fire-and-forget → server-state-observed handoff.
      return new Promise<void>((resolve) =>
        setTimeout(resolve, REGENERATE_BRIDGE_WINDOW_MS),
      )
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['biopsychosocial-plan'] }),
  })
}

/**
 * SCRUM-651: cancel the in-flight regenerate job. Fire-and-forget via
 * `fireAndForgetDelete` for the same chunk-9.5 turbomodule reason
 * `useRegenerateBiopsychosocialPlan` uses `fireAndForgetPost` — the tap
 * that triggers this button sits inside the BPS surface (Modal + Text +
 * Pressable primitives) that we've been hardening for iOS 26.5.
 *
 * Server-truth reconciles via:
 *   1. The mirror push `BIOPSYCHOSOCIAL_PLAN_REGENERATE_CANCELLED` (or
 *      `_FAILED`) that use-notifications.ts already invalidates on, OR
 *   2. The onSuccess invalidate below, which fires after a short bridge
 *      window (so the DELETE has landed before the GET refetches).
 *
 * If `jobId` is missing (should never happen — the Cancel button is only
 * rendered when we have one), the mutationFn no-ops so a stale render can't
 * fire a DELETE against `/jobs/undefined`.
 */
const CANCEL_BRIDGE_WINDOW_MS = 3_000

export function useCancelBiopsychosocialRegeneration() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: [...CANCEL_BIO_PLAN_MUTATION_KEY],
    mutationFn: ({ jobId }: { jobId: string | undefined }) => {
      if (!jobId) {
        // No-op — see JSDoc. Resolve on the bridge tick so isPending still
        // flips false at the same cadence as the real cancel path.
        return new Promise<void>((resolve) => setTimeout(resolve, CANCEL_BRIDGE_WINDOW_MS))
      }
      const safeId = encodeURIComponent(jobId)
      void fireAndForgetDelete(`/v1/health-plan/biopsychosocial/regenerate/jobs/${safeId}`)
      return new Promise<void>((resolve) => setTimeout(resolve, CANCEL_BRIDGE_WINDOW_MS))
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
 * to import it — but it is NO LONGER a revert path for this hook: it
 * targets the legacy AI-plan row, which is the COS-C4 404 (see the
 * mutationFn comment). Restoring it here would re-break bio goal edits.
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

// CHUNK 41.1 fix (Ken reported "loader but not updated value"): apply an
// optimistic cache update on tap so the goal card shows the edited fields
// INSTANTLY, not 8s later after the pending window + refetch. Also fixes
// the case where the server write succeeds silently but the refetch
// arrives before the DDB read-back has propagated — the user was seeing
// stale data for the full 8s window with no visible confirmation their
// tap did anything.
function applyGoalPatchToSection(
  section: SectionPlan,
  goalId: string,
  patch: GoalPatch,
): SectionPlan {
  let touched = false
  const nextGoals = section.goals.map((g): MeasurableGoal => {
    if (g.id !== goalId) return g
    touched = true
    return { ...g, ...patch }
  })
  return touched ? { ...section, goals: nextGoals } : section
}

export function useUpdateBioGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ goalId, patch }: { goalId: string; patch: GoalPatch }) => {
      // Fire the actual PUT immediately — no await (chunk 9.5 rule).
      //
      // COS-C4: this used to PUT the BPS goal id to the LEGACY AI-plan
      // endpoint (`/v1/patients/me/health-plan/ai/goals/:id`). The two plans
      // are separate DynamoDB rows with independently minted uuids, so a BPS
      // goal id is never found in the AI plan and every edit 404'd. Silent
      // twice over: fireAndForgetPut swallows the error and onMutate has
      // already painted the change optimistically, so the card "saved".
      // The BPS route (cos-backend biopsychosocial-plan.routes.ts, mounted at
      // /health-plan/biopsychosocial) also accepts `subdomains`, which the AI
      // schema does not — so the chip edits BioGoalEditorModal sends were
      // being dropped too. Do not point this back at the /ai/ path.
      void fireAndForgetPut(
        `/v1/health-plan/biopsychosocial/goals/${encodeURIComponent(goalId)}`,
        patch as unknown as Record<string, unknown>,
      )
      // Latch mutation.isPending for the pending window so onSuccess
      // (invalidate) fires AFTER the server has landed the write.
      return new Promise<void>((resolve) =>
        setTimeout(resolve, EDIT_GOAL_PENDING_WINDOW_MS),
      )
    },
    onMutate: async ({ goalId, patch }) => {
      // CHUNK 41.1: optimistic update. Cancel any in-flight refetch so
      // it can't overwrite our optimistic write, snapshot the previous
      // plan for rollback, then patch the goal in whichever section it
      // lives in (we don't know which, so try all three — the helper
      // no-ops for sections that don't contain the goal).
      await qc.cancelQueries({ queryKey: ['biopsychosocial-plan'] })
      const prev = qc.getQueryData<BiopsychosocialPlanResponse>(['biopsychosocial-plan'])
      if (prev?.plan) {
        qc.setQueryData<BiopsychosocialPlanResponse>(['biopsychosocial-plan'], {
          ...prev,
          plan: {
            ...prev.plan,
            sections: {
              biological: applyGoalPatchToSection(prev.plan.sections.biological, goalId, patch),
              psychological: applyGoalPatchToSection(prev.plan.sections.psychological, goalId, patch),
              social: applyGoalPatchToSection(prev.plan.sections.social, goalId, patch),
            },
          },
        })
      }
      return { prevBioPlan: prev }
    },
    onError: (_err, _vars, context) => {
      // If the mutation "fails" (in practice fireAndForgetPut swallows
      // everything, so this fires only if the setTimeout wrapper rejects
      // — near impossible). Roll back the optimistic write.
      if (context?.prevBioPlan) {
        qc.setQueryData(['biopsychosocial-plan'], context.prevBioPlan)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['biopsychosocial-plan'] })
      qc.invalidateQueries({ queryKey: ['ai-health-plan'] })
    },
  })
}
