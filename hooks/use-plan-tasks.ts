/**
 * use-plan-tasks (COS-450 / SCRUM-588, Chunk 1c).
 *
 * React Query mutation hooks over the 4 patient-authored task endpoints.
 * On success each invalidates the AI plan query so any list rendering
 * plan.tasks[] refetches. Query key mirrors what ai-health-plan.ts uses
 * for the plan query itself.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

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

export function useCreatePlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskBody) => createPlanTask(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
    },
  });
}

export function useUpdatePlanTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: UpdateTaskBody }) => updatePlanTask(args.id, args.body),
    onSuccess: () => {
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
    mutationFn: (args: { id: string; body: LogMeasurementBody }) => logTaskMeasurement(args.id, args.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AI_HEALTH_PLAN_QUERY_KEY });
    },
  });
}
