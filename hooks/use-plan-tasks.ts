/**
 * use-plan-tasks (COS-450 / SCRUM-588, Chunk 1c).
 *
 * React Query mutation hooks over the 4 patient-authored task endpoints.
 * On success each invalidates the AI plan query so any list rendering
 * plan.tasks[] refetches. Query key mirrors what ai-health-plan.ts uses
 * for the plan query itself.
 *
 * CHUNK 42 (2026-07-21): useCreatePlanTask + useUpdatePlanTask rewritten
 * to fire-and-forget via `fireAndForgetPost` / `fireAndForgetPatch` so
 * TaskEditorModal's Save can close the Modal same-tick without awaiting
 * an axios response — the awaited-inside-tap-handler shape is the
 * iOS 26.5 SIGABRT primitive documented in components/unified-plan/v2/net.ts.
 * Mirrors chunk 40 (regenerate) and chunk 41 (bio-goal edit).
 *
 * CHUNK 43 (2026-07-21): useLogTaskMeasurement rewritten to fire-and-forget
 * the POST + optimistically append the composed measurement to the
 * ai-health-plan cache. Same iOS 26.5 SIGABRT class as chunks 40-42 —
 * awaiting axios inside the Log button's tap handler was the primitive.
 * Optimistic append is REQUIRED (per BPS audit) so MeasurementHistoryList
 * re-renders same-tick — without it the just-logged value disappears
 * from the user's view until the 8s invalidate lands.
 *
 * Revert path (if the pending-window latch causes user-visible weirdness):
 * flip the three mutationFns back to `createPlanTask(body)` /
 * `updatePlanTask(args.id, args.body)` / `logTaskMeasurement(args.id, args.body)`
 * — the axios wrappers in services/api/plan-tasks.ts are still live for
 * non-tap callers, and drop the onMutate/onError optimistic patch blocks.
 *
 * iOS background-timer note: the setTimeout latch below can be delayed
 * when the app is backgrounded — invalidateQueries then fires on next
 * foreground. Not a correctness issue, just don't chase a phantom.
 *
 * useDeletePlanTask intentionally untouched here — separate audit chunk
 * owns that hot path.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fireAndForgetPost, fireAndForgetPatch } from '@/components/unified-plan/v2/net';
import { fetchAiHealthPlan } from '@/services/api/ai-health-plan';
import type { AiHealthPlan, PlanTask, TaskMeasurement } from '@/services/api/types';
import {
  createPlanTask,
  updatePlanTask,
  deletePlanTask,
  logTaskMeasurement,
  type CreateTaskBody,
  type UpdateTaskBody,
  type LogMeasurementBody,
} from '@/services/api/plan-tasks';

// Same query key ai-health-plan.ts + the wellbeing map derive from. Kept
// as a literal here (rather than imported) to avoid a new circular
// dependency. If ai-health-plan.ts renames this in the future, keep in
// sync — this is used by consumers all over the plan surface.
const AI_HEALTH_PLAN_QUERY_KEY = ['ai-health-plan'] as const;

// Chunks 40/41/42: pending-window latch that keeps `mutation.isPending`
// true after a fire-and-forget helper returns synchronously, so the UI
// doesn't briefly flash "done" before the server has landed the write.
// 8s is enough headroom for cold-Lambda + DDB write + read-back on p95.
// A single-task DDB write is cheap; a full-plan regenerate uses 30s (see
// chunk 40). If canary p99 create/update task latency on Ken's build 62
// blows past this, bump to 15s.
const TASK_MUTATION_PENDING_WINDOW_MS = 8_000;

const BASE_PATH = '/v1/patients/me/health-plan/tasks';

export function useCreatePlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskBody) => {
      // Fire the POST immediately — no await (chunk 9.5 rule; see
      // components/unified-plan/v2/net.ts header for the SIGABRT trap).
      void fireAndForgetPost(BASE_PATH, body as unknown as Record<string, unknown>);
      // Latch mutation.isPending for the pending window so the invalidate
      // in onSettled fires AFTER the server has landed the write.
      return new Promise<void>((resolve) =>
        setTimeout(resolve, TASK_MUTATION_PENDING_WINDOW_MS),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
    },
  });
}

export function useUpdatePlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: UpdateTaskBody }) => {
      // Fire the PATCH immediately — no await (chunk 9.5 rule; see
      // components/unified-plan/v2/net.ts header for the SIGABRT trap).
      void fireAndForgetPatch(
        `${BASE_PATH}/${encodeURIComponent(args.id)}`,
        args.body as unknown as Record<string, unknown>,
      );
      return new Promise<void>((resolve) =>
        setTimeout(resolve, TASK_MUTATION_PENDING_WINDOW_MS),
      );
    },
    // CHUNK 42 fix (adversarial-verify minor; Ken chunk-41.1 lesson):
    // optimistic cache update. Without this the edited task shows the
    // pre-edit values for the full 8s pending window — same "loader but
    // no update" UX bug Ken hit on chunk 41 goal-edit. Patch the task
    // in the ai-health-plan cache immediately on tap.
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
      const prev = qc.getQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY);
      if (prev?.tasks) {
        const nextTasks = prev.tasks.map((t): PlanTask =>
          t.id === id ? { ...t, ...(body as Partial<PlanTask>) } : t,
        );
        qc.setQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY, {
          ...prev,
          tasks: nextTasks,
        });
      }
      return { prevAiPlan: prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevAiPlan) {
        qc.setQueryData(AI_HEALTH_PLAN_QUERY_KEY, context.prevAiPlan);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
    },
  });
}

export function useDeletePlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePlanTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
    },
  });
}

export function useLogTaskMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: LogMeasurementBody }) => {
      // Fire the POST immediately — no await (chunk 9.5 rule; see
      // components/unified-plan/v2/net.ts header for the SIGABRT trap).
      void fireAndForgetPost(
        `${BASE_PATH}/${encodeURIComponent(args.id)}/measurements`,
        args.body as unknown as Record<string, unknown>,
      );
      // Latch mutation.isPending for the pending window so the invalidate
      // in onSettled fires AFTER the server has landed the write, AND the
      // Log button stays disabled to prevent double-fires.
      return new Promise<void>((resolve) =>
        setTimeout(resolve, TASK_MUTATION_PENDING_WINDOW_MS),
      );
    },
    // CHUNK 43 optimistic append: without this, MeasurementHistoryList
    // doesn't re-render until the 8s invalidate — the user's just-logged
    // measurement disappears from view. Compose the row locally with a
    // client-side ISO timestamp; the server-authoritative row replaces
    // it on invalidate. Shape must match types.ts:307 exactly
    // ({ timestamp, value, source }) — same shape MeasurementLogInput's
    // onLog composer builds for the synthetic PlanTask it hands upward.
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
      const prev = qc.getQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY);
      const composed: TaskMeasurement = {
        timestamp: new Date().toISOString(),
        value: body.value,
        source: body.source ?? 'manual',
      };
      if (prev?.tasks) {
        const nextTasks = prev.tasks.map((t): PlanTask =>
          t.id === id
            ? { ...t, measurements: [...(t.measurements ?? []), composed] }
            : t,
        );
        qc.setQueryData<AiHealthPlan | null>(AI_HEALTH_PLAN_QUERY_KEY, {
          ...prev,
          tasks: nextTasks,
        });
      }
      return { prevAiPlan: prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevAiPlan) {
        qc.setQueryData(AI_HEALTH_PLAN_QUERY_KEY, context.prevAiPlan);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
    },
  });
}

export function useAiHealthPlan() {
  return useQuery({
    queryKey: AI_HEALTH_PLAN_QUERY_KEY,
    queryFn: fetchAiHealthPlan,
    staleTime: 60_000,
  });
}
