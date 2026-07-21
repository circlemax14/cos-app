/**
 * v2/net.ts — CHUNK 32 pre-step (2026-07-21).
 *
 * Shared iOS-26.5-safe fire-and-forget POST helper for the v2 stack.
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
 * Every v2 chunk that fires a POST from a tap handler MUST import this
 * helper. If a future chunk copy-pastes its own version and misses one of
 * the four guardrails (no await on fetch, .catch swallow, try/catch outer,
 * raw fetch not axios), the SIGABRT is back. Import, don't copy.
 *
 * Chunks currently using this helper:
 *   - PlanEmptyStates (chunk 32) — Basic-tier "Generate plan" CTA
 *   - SwipeableTaskRow (chunk 9.4 → chunk 32 refactor) — skip / snooze / reschedule
 */

import { getAccessToken } from '@/lib/auth-tokens';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export type FireAndForgetBody = Record<string, unknown>;

export async function fireAndForgetPost(
  path: string,
  body: FireAndForgetBody,
): Promise<void> {
  try {
    const token = await getAccessToken();
    const url = `${API_BASE.replace(/\/$/, '')}${path}`;
    // DO NOT await this fetch. See file header — the await is the SIGABRT.
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => {
      // Swallow every error — reconcile on next poll.
    });
  } catch {
    // getAccessToken failed; nothing to do.
  }
}
