/**
 * Patient-authored PERSONAL GOALS (COS-405 / SCRUM-532).
 *
 * Ken's plan structure: per care-plan category, GOALS + metrics are set "by the
 * individual, the proxy, or the agency care manager." This service is the
 * PATIENT side — the patient ADDs / EDITs / DELETEs their own measurable goals
 * (with metrics) alongside the AI-suggested goals, per category.
 *
 * Backend contract (gated by the backend's CARE_PLAN_V2_ENABLED flag, so these
 * 404 until the backend ships + enables them):
 *   GET    /v1/me/personal-goals                    -> { goals: PersonalGoal[] }
 *   POST   /v1/me/personal-goals                    -> { goal }
 *   PUT    /v1/me/personal-goals/:id                -> { goal }
 *   POST   /v1/me/personal-goals/:id/reflection     -> { goal? }
 *   DELETE /v1/me/personal-goals/:id                -> { ok }
 *
 * GRACEFUL DEGRADATION (mirrors plan-medications.ts): the GET resolves to an
 * EMPTY list on ANY failure — a 404 (backend flag off / route not shipped), a
 * FEATURE_DISABLED code, a network error, etc. — so the plan renders exactly as
 * today's v3 with no error spam. The AI goals still render. Mutations are only
 * ever invoked from UI that the client kill-switch PERSONAL_GOALS_ENABLED has
 * already gated on, so they never fire before the feature is meant to be live.
 *
 * No PHI is logged here; failures are swallowed (GET) or surfaced as a generic
 * UI message by the caller (mutations).
 */

import { apiClient } from '@/lib/api-client';
import {
  normalizePersonalGoals,
  normalizePersonalGoal,
  type NormalizedPersonalGoal,
  type PersonalGoalSubmit,
} from '@/lib/care-plan';

export type PersonalGoal = NormalizedPersonalGoal;

const BASE = '/v1/me/personal-goals';

/**
 * GET the patient's personal goals. Resolves to [] on ANY error (404 when the
 * backend flag is off / route not shipped, network failure, malformed body) so
 * the plan degrades gracefully to "no personal goals" — never throwing into the
 * UI. Malformed rows are dropped by the normalizer.
 */
export async function fetchPersonalGoals(): Promise<PersonalGoal[]> {
  try {
    const res = await apiClient.get<unknown>(BASE);
    return normalizePersonalGoals(res.data);
  } catch {
    // 404 (feature disabled / not shipped), network, etc. → empty, no error spam.
    return [];
  }
}

/**
 * POST a new personal goal in a category. Throws on failure so the caller can
 * show a generic retry message (the UI is only reachable when the feature is on,
 * so we don't swallow create errors the way the GET does).
 */
export async function createPersonalGoal(
  category: string,
  body: PersonalGoalSubmit,
): Promise<PersonalGoal | null> {
  const res = await apiClient.post<{ goal?: unknown }>(BASE, { category, ...body });
  return normalizePersonalGoal(res.data?.goal);
}

/** PUT an edit to an existing personal goal. */
export async function updatePersonalGoal(
  id: string,
  body: Partial<PersonalGoalSubmit>,
): Promise<PersonalGoal | null> {
  const res = await apiClient.put<{ goal?: unknown }>(
    `${BASE}/${encodeURIComponent(id)}`,
    body,
  );
  return normalizePersonalGoal(res.data?.goal);
}

/** DELETE a personal goal. Resolves to true on success. */
export async function deletePersonalGoal(id: string): Promise<boolean> {
  const res = await apiClient.delete<{ ok?: boolean }>(`${BASE}/${encodeURIComponent(id)}`);
  return res.data?.ok !== false;
}

export interface PersonalGoalReflectionInput {
  note?: string;
  rating?: number;
}

/**
 * POST a period reflection (qualitative check-in) — a note + an optional 1–5
 * self-rating. Returns the updated goal when the backend echoes it (so the
 * caller can prime the cache), else null.
 */
export async function addPersonalGoalReflection(
  id: string,
  input: PersonalGoalReflectionInput,
): Promise<PersonalGoal | null> {
  const res = await apiClient.post<{ goal?: unknown }>(
    `${BASE}/${encodeURIComponent(id)}/reflection`,
    input,
  );
  return normalizePersonalGoal(res.data?.goal);
}
