import { apiClient } from '@/lib/api-client';
import type {
  AiHealthPlan,
  AiPlanGoal,
  BpsDomain,
  CreateRoutineBody,
  RoutineRow,
  TaskOccurrence,
  UpdateRoutineBody,
} from './types';

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

/**
 * Patient-local calendar day helper (COS-475 / SCRUM-595).
 *
 * The BE routes /complete + /omit now anchor the "today"/"early"/"omit"
 * checks against a caller-supplied patientLocalDate instead of the server
 * UTC slice. Callers may override, but by default we send the user's LOCAL
 * calendar day — NOT `toISOString().slice(0, 10)`, which is UTC and
 * mis-anchors Pacific users after 17:00 local (bug SCRUM-595 exists to fix).
 */
export const getTodayLocalDate = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

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

/** Extended result for completeTask when Phase 6.1 "early" flag is honored. */
export interface CompleteTaskResult extends TaskActionResult {
  earlyRecorded?: boolean;
}

/** Options for the new completeTask object signature. */
export interface CompleteTaskOptions {
  scheduledFor: string;
  notes?: string;
  early?: boolean;
  patientLocalDate?: string;
}

/**
 * Mark a task occurrence complete.
 *
 * Supports two signatures for back-compat with existing callers:
 *  - Legacy: completeTask(taskId, scheduledFor, notes?)  → transparent
 *    shim, no new body fields sent.
 *  - COS-475 / Phase 6.4: completeTask(taskId, { scheduledFor, notes,
 *    early, patientLocalDate }) → sends the extended body, with
 *    patientLocalDate auto-filled from getTodayLocalDate() when omitted.
 */
export async function completeTask(
  taskId: string,
  scheduledFor: string,
  notes?: string,
): Promise<TaskActionResult>;
export async function completeTask(
  taskId: string,
  opts: CompleteTaskOptions,
): Promise<CompleteTaskResult>;
export async function completeTask(
  taskId: string,
  a: string | CompleteTaskOptions,
  b?: string,
): Promise<CompleteTaskResult> {
  try {
    let body: Record<string, unknown>;
    if (typeof a === 'string') {
      // Legacy positional form — send byte-for-byte legacy body.
      body = { scheduledFor: a, notes: b };
    } else {
      body = {
        scheduledFor: a.scheduledFor,
        notes: a.notes,
        early: a.early,
        patientLocalDate: a.patientLocalDate ?? getTodayLocalDate(),
      };
    }
    const res = await apiClient.post<{
      success?: boolean;
      data?: { earlyRecorded?: boolean };
    }>(`/v1/patients/me/tasks/${encodeURIComponent(taskId)}/complete`, body);
    const earlyRecorded = res?.data?.data?.earlyRecorded === true;
    return earlyRecorded ? { ok: true, earlyRecorded } : { ok: true };
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

// ─── Phase 6.4 (COS-475) — Patient overrides + Routines ────────────────

/** Thin wrapped error with a `.code` field the caller can dispatch on. */
export interface WrappedApiError extends Error {
  code?: string;
  status?: number;
}

function wrapApiError(err: unknown, fallbackMessage: string): WrappedApiError {
  const desc = describeError(err);
  const wrapped = new Error(desc.message ?? fallbackMessage) as WrappedApiError;
  wrapped.code = desc.code;
  wrapped.status = desc.status;
  return wrapped;
}

/**
 * POST /v1/patients/me/tasks/:taskId/omit — skip today (patient override).
 * BE anchors `omittedFrom[taskId]` against `patientLocalDate` (SCRUM-595)
 * when supplied; wrapper defaults it to the patient's local calendar day.
 */
export interface OmitTaskOptions {
  reason?: string;
  patientLocalDate?: string;
}

export interface OmitTaskResult {
  override: { omittedTemplateIds: string[]; updatedAt: string };
}

export async function omitTask(
  taskId: string,
  opts: OmitTaskOptions = {},
): Promise<OmitTaskResult> {
  try {
    const res = await apiClient.post<{
      success?: boolean;
      data?: OmitTaskResult;
    }>(`/v1/patients/me/tasks/${encodeURIComponent(taskId)}/omit`, {
      reason: opts.reason,
      patientLocalDate: opts.patientLocalDate ?? getTodayLocalDate(),
    });
    const payload = res?.data?.data;
    if (!payload) {
      throw new Error('Empty omit response');
    }
    return payload;
  } catch (err) {
    throw wrapApiError(err, 'Failed to skip task');
  }
}

/**
 * POST /v1/patients/me/tasks/:taskId/snooze — Phase 6.1 pin to 60 minutes.
 * NOTE: BE does NOT yet accept `patientLocalDate` on this route — follow-up
 * ticket queued to add parity with /omit + /complete.
 *
 * COS-475 Phase 6.4 round 2 (2026-07-20): the `originalTime` field on
 * SnoozeTaskOptions is RETAINED in the TS shape (for future BE support)
 * but is NOT sent on the wire — BE's snooze zod schema uses `.strict()`
 * and would 400 on unknown keys. Routines currently model one occurrence
 * per day per template, so `scheduledFor` alone unambiguously identifies
 * the occurrence today. Follow-up ticket needed if we ever add
 * multi-occurrence-per-day routines.
 */
export interface SnoozeTaskOptions {
  scheduledFor: string;
  deltaMinutes?: 60;
  /** HH:mm 24-hour local time of the occurrence being snoozed. */
  originalTime?: string;
}

export interface SnoozeTaskResult {
  snooze: {
    taskId: string;
    scheduledFor: string;
    originalTime: string;
    newTime: string;
  };
}

export async function snoozeTask(
  taskId: string,
  opts: SnoozeTaskOptions,
): Promise<SnoozeTaskResult> {
  try {
    const body: Record<string, unknown> = {
      scheduledFor: opts.scheduledFor,
      deltaMinutes: opts.deltaMinutes ?? 60,
    };
    // originalTime intentionally NOT included on the wire — BE snooze zod is .strict()
    const res = await apiClient.post<{
      success?: boolean;
      data?: SnoozeTaskResult;
    }>(`/v1/patients/me/tasks/${encodeURIComponent(taskId)}/snooze`, body);
    const payload = res?.data?.data;
    if (!payload) {
      throw new Error('Empty snooze response');
    }
    return payload;
  } catch (err) {
    throw wrapApiError(err, 'Failed to snooze task');
  }
}

/**
 * POST /v1/patients/me/tasks/:taskId/reschedule-occurrence — one-off time
 * move for today. NOTE: BE does NOT yet accept `patientLocalDate` here.
 */
export interface RescheduleOccurrenceOptions {
  scheduledFor: string;
  /** HH:mm 24-hour local time */
  newTime: string;
}

export interface RescheduleOccurrenceResult {
  reschedule: {
    taskId: string;
    scheduledFor: string;
    originalTime: string;
    newTime: string;
  };
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function rescheduleOccurrence(
  taskId: string,
  opts: RescheduleOccurrenceOptions,
): Promise<RescheduleOccurrenceResult> {
  if (!HHMM_RE.test(opts.newTime)) {
    const bad = new Error('Invalid time format') as WrappedApiError;
    bad.code = 'INVALID_TIME';
    throw bad;
  }
  try {
    const res = await apiClient.post<{
      success?: boolean;
      data?: RescheduleOccurrenceResult;
    }>(
      `/v1/patients/me/tasks/${encodeURIComponent(taskId)}/reschedule-occurrence`,
      { scheduledFor: opts.scheduledFor, newTime: opts.newTime },
    );
    const payload = res?.data?.data;
    if (!payload) {
      throw new Error('Empty reschedule response');
    }
    return payload;
  } catch (err) {
    throw wrapApiError(err, 'Failed to reschedule task');
  }
}

// ── Routines CRUD (Phase 6.2 endpoints, Phase 6.4 wrapper) ─────────────

/**
 * Simple UUID-v4-ish idempotency key generator. Uses Math.random for
 * client uniqueness only (the server enforces the actual dedupe key).
 * Avoids adding a `uuid` runtime dep — collisions are cosmetic.
 */
function makeIdempotencyKey(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${rand}`;
}

export interface ListRoutinesOptions {
  includeArchived?: boolean;
  bpsDomain?: BpsDomain;
}

export async function listRoutines(
  opts: ListRoutinesOptions = {},
): Promise<{ routines: RoutineRow[] }> {
  try {
    const params: string[] = [];
    if (opts.includeArchived) params.push('includeArchived=true');
    if (opts.bpsDomain) params.push(`bpsDomain=${encodeURIComponent(opts.bpsDomain)}`);
    const query = params.length ? `?${params.join('&')}` : '';
    const res = await apiClient.get<{
      success?: boolean;
      data?: { routines: RoutineRow[] };
    }>(`/v1/patients/me/routines${query}`);
    return { routines: res?.data?.data?.routines ?? [] };
  } catch (err) {
    const desc = describeError(err);
    if (desc.code === 'FEATURE_DISABLED') {
      // Mirror useUnifiedPlan disabled semantics — never throw for a flag
      // being off server-side; caller shows an empty bucket.
      return { routines: [] };
    }
    throw wrapApiError(err, 'Failed to list routines');
  }
}

export interface CreateRoutineOptions {
  idempotencyKey?: string;
}

export async function createRoutine(
  body: CreateRoutineBody,
  opts: CreateRoutineOptions = {},
): Promise<{ routine: RoutineRow }> {
  try {
    const headers: Record<string, string> = {
      'Idempotency-Key': opts.idempotencyKey ?? makeIdempotencyKey(),
    };
    const res = await apiClient.post<{
      success?: boolean;
      data?: { routine: RoutineRow };
    }>('/v1/patients/me/routines', body, { headers });
    const routine = res?.data?.data?.routine;
    if (!routine) throw new Error('Empty createRoutine response');
    return { routine };
  } catch (err) {
    throw wrapApiError(err, 'Failed to create routine');
  }
}

export interface UpdateRoutineOptions {
  /** Server ETag = the row.updatedAt returned from the previous read. */
  ifMatch?: string;
}

export async function updateRoutine(
  id: string,
  patch: UpdateRoutineBody,
  opts: UpdateRoutineOptions = {},
): Promise<{ routine: RoutineRow }> {
  try {
    const headers: Record<string, string> = {};
    if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
    const res = await apiClient.patch<{
      success?: boolean;
      data?: { routine: RoutineRow };
    }>(`/v1/patients/me/routines/${encodeURIComponent(id)}`, patch, {
      headers: Object.keys(headers).length ? headers : undefined,
    });
    const routine = res?.data?.data?.routine;
    if (!routine) throw new Error('Empty updateRoutine response');
    return { routine };
  } catch (err) {
    throw wrapApiError(err, 'Failed to update routine');
  }
}

export async function deleteRoutine(
  id: string,
): Promise<{ deleted: true; id: string }> {
  try {
    await apiClient.delete(`/v1/patients/me/routines/${encodeURIComponent(id)}`);
    return { deleted: true, id };
  } catch (err) {
    throw wrapApiError(err, 'Failed to delete routine');
  }
}
