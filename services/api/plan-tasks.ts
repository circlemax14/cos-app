/**
 * plan-tasks API client (COS-450 / SCRUM-588, Chunk 1c).
 *
 * Thin wrappers for the four patient-authored task endpoints on cos-backend
 * (SCRUM-587):
 *   POST   /v1/patients/me/health-plan/tasks
 *   PATCH  /v1/patients/me/health-plan/tasks/:id
 *   DELETE /v1/patients/me/health-plan/tasks/:id
 *   POST   /v1/patients/me/health-plan/tasks/:id/measurements
 *
 * Kept in a dedicated file so hooks/use-plan-tasks.ts can call these
 * without threading auth headers or URL prefixes through the UI.
 * Response shapes mirror the BE service return types.
 */

import { apiClient } from '@/lib/api-client';
import type { PlanTask, TaskCompletionStyle, TaskMetric, TaskRecurrence, TaskType } from './types';

const BASE = '/v1/patients/me/health-plan/tasks';

export interface CreateTaskBody {
  type: TaskType;
  title: string;
  description?: string;
  scheduledTime: string; // HH:MM
  recurrence: TaskRecurrence;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  daysOfWeek?: number[];
  category?: string;
  completionStyle?: TaskCompletionStyle;
  metric?: TaskMetric;
}

export interface UpdateTaskBody {
  title?: string;
  description?: string;
  scheduledTime?: string;
  recurrence?: TaskRecurrence;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  category?: string;
  completionStyle?: TaskCompletionStyle;
  metric?: TaskMetric;
}

export interface LogMeasurementBody {
  value: Record<string, number | string>;
  source?: 'manual' | 'healthkit';
}

export async function createPlanTask(body: CreateTaskBody): Promise<PlanTask> {
  const res = await apiClient.post<{ success: boolean; data: { task: PlanTask } }>(BASE, body);
  return res.data.data.task;
}

export async function updatePlanTask(id: string, body: UpdateTaskBody): Promise<PlanTask> {
  const res = await apiClient.patch<{ success: boolean; data: { task: PlanTask } }>(`${BASE}/${encodeURIComponent(id)}`, body);
  return res.data.data.task;
}

export async function deletePlanTask(id: string): Promise<void> {
  await apiClient.delete<{ success: boolean; data: { deleted: true } }>(`${BASE}/${encodeURIComponent(id)}`);
}

export async function logTaskMeasurement(id: string, body: LogMeasurementBody): Promise<PlanTask> {
  const res = await apiClient.post<{ success: boolean; data: { task: PlanTask } }>(
    `${BASE}/${encodeURIComponent(id)}/measurements`,
    body,
  );
  return res.data.data.task;
}
