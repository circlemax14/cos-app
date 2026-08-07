/**
 * SCRUM-651: pure helpers backing the BPS regenerate live-tick UX.
 *
 * Extracted from `hooks/use-biopsychosocial-plan.ts` so a node:test unit
 * test can load them without dragging in React / react-query / apiClient
 * (which pull in RN + the whole app graph and can't be resolved from
 * `node --test` today). The hook file re-exports these under their
 * original names so external callers can keep importing from
 * `@/hooks/use-biopsychosocial-plan` — see the re-export block there.
 *
 * KEEP THIS FILE RN-IMPORT-FREE. Same rule as `lib/care-plan.ts` — the
 * loading test-runner has no RN shim so a stray `from 'react-native'`
 * would immediately break the test suite. If a future helper needs a
 * React hook, put it back in `use-biopsychosocial-plan.ts`; only pure
 * TS belongs here.
 */

/**
 * Default client-side thresholds. Used when the BE response omits the
 * SCRUM-651 envelope (pre-rollout deploys). Match the SCRUM-651 spec —
 * 5min banner-copy swap, 45min stuck-job affordance.
 */
export const DEFAULT_CLIENT_BANNER_SWAP_SECONDS = 300 as const;
export const DEFAULT_STUCK_JOB_THRESHOLD_SECONDS = 2700 as const;

/**
 * Compute elapsed seconds since an ISO timestamp against a caller-supplied
 * `nowMs`. Kept pure (no `Date.now()` inside) so the hook's ticker owns
 * the clock and tests can inject deterministic values.
 *
 * Returns 0 when `iso` is undefined, empty, unparseable, OR when the
 * timestamp is in the future (clock skew). The future-clamp keeps a
 * downstream `-5s ago` render from ever appearing.
 */
export function computeElapsedSec(iso: string | undefined, nowMs: number): number {
  if (!iso) return 0;
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 1000));
}

/**
 * Pure formatter for the "started Xs / Xm ago / generating for a while..."
 * label. Same shape as the pre-SCRUM-651 `formatRelativeStartedAt(iso)`
 * from `BiopsychosocialPlanScreen.tsx` — the only change is the input:
 * elapsed seconds (from the ticker), not the ISO timestamp (which would
 * force this to call Date.now() itself and drift from the ticker).
 */
export function formatRegenerationElapsed(elapsedSec: number): string {
  if (elapsedSec < 5) return 'just now';
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const elapsedMin = Math.floor(elapsedSec / 60);
  if (elapsedMin < 3) return `${elapsedMin}m ago`;
  return 'generating for a while...';
}

/**
 * Given the plan-envelope overrides (both optional — BE may omit either),
 * return the EFFECTIVE thresholds the UI should branch on. Centralizes
 * the "use server value if present, else the client default" fallback so
 * every caller reads the same policy.
 */
export function resolveRegenerationThresholds(overrides?: {
  clientBannerSwapSeconds?: number;
  stuckJobThresholdSeconds?: number;
}): { bannerSwapSeconds: number; stuckThresholdSeconds: number } {
  return {
    bannerSwapSeconds:
      overrides?.clientBannerSwapSeconds ?? DEFAULT_CLIENT_BANNER_SWAP_SECONDS,
    stuckThresholdSeconds:
      overrides?.stuckJobThresholdSeconds ?? DEFAULT_STUCK_JOB_THRESHOLD_SECONDS,
  };
}
