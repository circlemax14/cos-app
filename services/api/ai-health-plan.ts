import { apiClient } from '@/lib/api-client';
import type { AiHealthPlan, TaskOccurrence } from './types';

/** Get the active AI-generated health plan for the current user. */
export async function fetchAiHealthPlan(): Promise<AiHealthPlan | null> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: { plan: AiHealthPlan | null };
    }>('/v1/patients/me/health-plan/ai');
    return res.data.data.plan ?? null;
  } catch {
    return null;
  }
}

/** Generate (or regenerate) the AI health plan. */
export async function generateAiHealthPlan(force = false): Promise<AiHealthPlan | null> {
  try {
    const res = await apiClient.post<{
      success: boolean;
      data: { plan: AiHealthPlan };
    }>('/v1/patients/me/health-plan/ai/generate', { force });
    return res.data.data.plan;
  } catch {
    return null;
  }
}

/** List task occurrences for a given date (defaults to today). */
export async function fetchTasksForDate(date?: string): Promise<TaskOccurrence[]> {
  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await apiClient.get<{
      success: boolean;
      data: { date: string; tasks: TaskOccurrence[] };
    }>(`/v1/patients/me/tasks${query}`);
    return res.data.data.tasks;
  } catch {
    return [];
  }
}

/** Count of pending tasks for a given date (defaults to today). */
export async function fetchPendingTaskCount(date?: string): Promise<number> {
  try {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await apiClient.get<{
      success: boolean;
      data: { date: string; count: number };
    }>(`/v1/patients/me/tasks/pending-count${query}`);
    return res.data.data.count ?? 0;
  } catch {
    return 0;
  }
}

/** Mark a task occurrence complete. */
export async function completeTask(
  taskId: string,
  scheduledFor: string,
  notes?: string,
): Promise<boolean> {
  try {
    await apiClient.post(`/v1/patients/me/tasks/${encodeURIComponent(taskId)}/complete`, {
      scheduledFor,
      notes,
    });
    return true;
  } catch {
    return false;
  }
}

/** Mark a task occurrence skipped. */
export async function skipTask(
  taskId: string,
  scheduledFor: string,
  notes?: string,
): Promise<boolean> {
  try {
    await apiClient.post(`/v1/patients/me/tasks/${encodeURIComponent(taskId)}/skip`, {
      scheduledFor,
      notes,
    });
    return true;
  } catch {
    return false;
  }
}
