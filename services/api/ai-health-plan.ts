import { apiClient } from '@/lib/api-client';
import type { AiHealthPlan, AiPlanGoal, TaskOccurrence } from './types';
import { todayLocalIso, tzOffsetMinutes } from '@/lib/day-key'

// ── Care Plan goal editing (COS-377) ───────────────────────────────────────
// COS-430: `subdomains` added — NovoPsych biopsychosocial subdomain tags per
// goal. Optional and backward-compatible: callers that never patch it keep
// working; backends that don't yet accept it ignore it (verified by the BE
// team as an additive PATCH field, mirrors legacy tolerance for extra keys).
export type GoalPatch = Partial<
  Pick<
    AiPlanGoal,
    'title' | 'description' | 'metric' | 'baseline' | 'target' | 'timeframe' | 'status' | 'subdomains'
  >
>;

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
  } catch (err) {
    // SCRUM-228: surface AI_AWAITING_ASSESSMENTS so callers (Plan tab,
    // catalog) can route the user to the catalog instead of silently
    // swallowing the failure as a no-op.
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
    if (code === 'AI_AWAITING_ASSESSMENTS') {
      const wrapped = new Error('Complete at least one assessment to build your plan');
      (wrapped as Error & { code?: string }).code = code;
      throw wrapped;
    }
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

/**
 * SCRUM-279 (2026-06-11 build 41): expose the underlying failure
 * reason instead of swallowing it as `false`. Ken reported tapping a
 * task in Today's Schedule and seeing it revert; we need to know
 * whether it's auth, network, or a validation error before we can
 * fix the right thing.
 */
export interface TaskActionResult {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
}

function describeError(err: unknown): TaskActionResult {
  if (err && typeof err === 'object' && 'response' in err) {
    const e = err as { response?: { status?: number; data?: { code?: string; error?: string; message?: string } }; message?: string };
    return {
      ok: false,
      status: e.response?.status,
      code: e.response?.data?.code,
      message: e.response?.data?.error ?? e.response?.data?.message ?? e.message ?? 'Request failed',
    };
  }
  if (err && typeof err === 'object' && 'code' in err) {
    const e = err as { code?: string; message?: string };
    return { ok: false, code: e.code, message: e.message };
  }
  return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' };
}

/**
 * Mark a task occurrence complete.
 *
 * Sends the patient's local frame alongside the completion. Both fields are
 * things only the DEVICE knows, and the backend had been guessing at both:
 *
 * `patientLocalDate` — the backend has accepted this since SCRUM-595, added
 * to fix "the ±14h off-by-one where an Auckland patient completing a today
 * task before the slot had the early claim silently dropped because server-UTC
 * was still yesterday". The app never sent it, so that fix has been
 * unreachable dead code ever since it shipped.
 *
 * `tzOffsetMinutes` — minutes AHEAD of UTC (Los Angeles in summer → -420).
 * `scheduledTime` on a task is the patient's LOCAL wall clock while
 * `completedAt` is a UTC instant, and the backend compared them directly, so
 * `onTime` was false for every patient more than 2 hours from UTC. That flag
 * feeds the "On-Time Master" badge, which needs 60% over 30 days — meaning it
 * was not hard for US patients, it was arithmetically impossible.
 *
 * Both are additive and optional server-side: an older client omitting them
 * gets exactly the previous behaviour.
 */
export async function completeTask(
  taskId: string,
  scheduledFor: string,
  notes?: string,
): Promise<TaskActionResult> {
  try {
    const now = new Date();
    await apiClient.post(`/v1/patients/me/tasks/${encodeURIComponent(taskId)}/complete`, {
      scheduledFor,
      notes,
      patientLocalDate: todayLocalIso(now),
      tzOffsetMinutes: tzOffsetMinutes(now),
    });
    return { ok: true };
  } catch (err) {
    return describeError(err);
  }
}

/** Mark a task occurrence skipped. */
export async function skipTask(
  taskId: string,
  scheduledFor: string,
  notes?: string,
): Promise<TaskActionResult> {
  try {
    await apiClient.post(`/v1/patients/me/tasks/${encodeURIComponent(taskId)}/skip`, {
      scheduledFor,
      notes,
    });
    return { ok: true };
  } catch (err) {
    return describeError(err);
  }
}

/**
 * Edit a measurable goal on the AI health plan (COS-377).
 * Calls PUT /v1/patients/me/health-plan/ai/goals/:goalId and returns the
 * updated full plan. Unwrap follows the same `res.data.data.plan` convention
 * as `fetchAiHealthPlan` above.
 */
export async function updatePlanGoal(goalId: string, patch: GoalPatch): Promise<AiHealthPlan> {
  const res = await apiClient.put<{
    success: boolean;
    data: { plan: AiHealthPlan };
  }>(`/v1/patients/me/health-plan/ai/goals/${encodeURIComponent(goalId)}`, patch);
  return res.data.data.plan;
}
