/**
 * Pure helpers for TryUnifiedPlanBanner (COS-467).
 *
 * Extracted so the dismissal-window logic can be exercised from
 * `node --test` without pulling AsyncStorage / React Native into the
 * test module graph.
 */

export const DISMISS_KEY = 'unifiedPlanBanner:dismissedAt';
export const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Set to `'1'` the first time the user opens the unified plan screen.
 * Once set, TryUnifiedPlanBanner returns null permanently — the peer CTA
 * has done its job and would just be noise on subsequent renders.
 */
export const EVER_VISITED_KEY = 'unifiedPlanBanner:everVisited';

/**
 * Given the raw AsyncStorage payload (timestamp as string, or null/
 * undefined for "never dismissed") and the current wall-clock time,
 * decide whether the banner should stay hidden.
 *
 * Fail-safe policy on odd inputs:
 *   - null/undefined/empty/non-numeric/zero → treat as never dismissed.
 *   - Future timestamps (clock skew) → treat as dismissed so we don't
 *     spam the banner while the clock catches up.
 */
export function isBannerDismissed(
  raw: string | null | undefined,
  nowMs: number,
  windowMs: number = DISMISS_WINDOW_MS,
): boolean {
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return nowMs - ts < windowMs;
}
