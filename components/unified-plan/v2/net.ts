/**
 * v2/net.ts — CHUNK 32 pre-step (2026-07-21); widened CHUNK 37 (2026-07-22).
 *
 * Shared iOS-26.5-safe fire-and-forget network helpers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * On Ken's iOS 26.5 (build 62) binary, any code path that awaits an axios
 * response inside a user-triggered tap handler crashes with SIGABRT on
 * com.meta.react.turbomodulemanager.queue. Chunk 9.5 discovered the safe
 * shape: raw `fetch()` with the response intentionally not awaited, error
 * .catch swallow, and the outer body wrapped in try/catch so a
 * getAccessToken failure is silently no-op. Reconcile server state on the
 * next poll rather than reading a response.
 *
 * Every chunk that fires a mutation from a tap handler MUST import from
 * this file. If a future chunk copy-pastes its own version and misses one
 * of the four guardrails (no await on fetch, .catch swallow, try/catch
 * outer, raw fetch not axios), the SIGABRT is back. Import, don't copy.
 *
 * WIDENED CHUNK 37 (2026-07-22): the BPS-port audit found 4 hot paths
 * that need PATCH / PUT / DELETE variants (BioGoalEditorModal save,
 * TaskEditorModal save/update, TaskDetailModal delete, MeasurementLogInput
 * log). Rather than fork the helper per verb, we expose all 4 verbs
 * behind the same guardrail shape. Prereq for BPS chunks 38-43.
 *
 * Chunks currently using these helpers:
 *   - PlanEmptyStates (chunk 32) — Basic-tier "Generate plan" CTA
 *   - SwipeableTaskRow (chunk 9.4 → chunk 32 refactor) — skip/snooze/reschedule
 *   - PlanScreenV2 handleGenerate (chunks 32, 34) — Generate + Regenerate
 *   - (chunks 38-43 — BPS port paths, WIP)
 */

import { getAccessToken } from '@/lib/auth-tokens';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export type FireAndForgetBody = Record<string, unknown>;
export type FireAndForgetMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Core helper. Every verb-specific wrapper below routes here so the
 * guardrails (no await on fetch, .catch swallow, try/catch outer, raw
 * fetch not axios) stay identical across all methods.
 *
 * `body` is optional to support DELETE requests that don't carry one
 * (still fine to pass a body if the endpoint uses it — some REST APIs do).
 */
export async function fireAndForgetRequest(
  method: FireAndForgetMethod,
  path: string,
  body?: FireAndForgetBody,
): Promise<void> {
  try {
    const token = await getAccessToken();
    const url = `${API_BASE.replace(/\/$/, '')}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    // DO NOT await this fetch. See file header — the await is the SIGABRT.
    fetch(url, init).catch(() => {
      // Swallow every error — reconcile on next poll.
    });
  } catch {
    // getAccessToken failed; nothing to do.
  }
}

export async function fireAndForgetPost(
  path: string,
  body: FireAndForgetBody,
): Promise<void> {
  return fireAndForgetRequest('POST', path, body);
}

export async function fireAndForgetPut(
  path: string,
  body: FireAndForgetBody,
): Promise<void> {
  return fireAndForgetRequest('PUT', path, body);
}

export async function fireAndForgetPatch(
  path: string,
  body: FireAndForgetBody,
): Promise<void> {
  return fireAndForgetRequest('PATCH', path, body);
}

export async function fireAndForgetDelete(
  path: string,
  body?: FireAndForgetBody,
): Promise<void> {
  return fireAndForgetRequest('DELETE', path, body);
}
