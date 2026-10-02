/**
 * COS-1226 — what the boot gate draws, and who hides the native splash.
 *
 * ─── WHY THIS IS A TABLE AND NOT AN IF-CHAIN IN THE COMPONENT ────────
 *
 * The chain lived in components/PlanBootGate.tsx, where `node --test` cannot
 * reach it (no React Native in node — see cos-app CLAUDE.md), so the ordering
 * was pinned only by regexes over the source text. Ordering is the whole
 * behaviour here: six states, and two of them differ from their neighbour by
 * one boolean. The same move was made for the entitlement gate
 * (lib/entitlement-decision.ts) and screen visibility (lib/screen-visibility.ts)
 * for the same reason.
 *
 * ─── THE TWO ARMS THAT ARE NOT OBVIOUS ───────────────────────────────
 *
 * 1. `indeterminate` is NOT `present`.
 *
 *    The gate corroborates a session the way app/index.tsx does, so a cold
 *    iOS Keychain now reports 'indeterminate' instead of a false 'absent'
 *    (COS-874 / COS-890). That is what stops the gate waving a signed-in
 *    patient through to a wide-open app — but it also means a device that has
 *    signed in BEFORE and is now signed out reads 'indeterminate', because
 *    sign-out clears the cached profile and NOT the PIN (lib/purge-local-phi.ts
 *    vs services/pin-auth.ts clearPinData). Showing that person "we couldn't
 *    load your account" with a retry button, forever, instead of the sign-in
 *    screen would be a worse bug than the one being fixed. So when we never
 *    actually confirmed a session, a failure hands off to the splash gate,
 *    which knows how to route it (lock screen, or COS-890's "could not open
 *    your session" copy).
 *
 * 2. An in-flight retry outranks a stale error.
 *
 *    react-query keeps `status: 'error'` while a refetch runs, so rendering
 *    the error screen on `isError` alone meant tapping Retry changed nothing
 *    on screen — the one thing a retry button must never do.
 */

/** 'app' = render children; the gate is not in the way. */
export type BootDecision = 'app' | 'error' | 'loading';

/**
 * Who lifts the native splash for a given decision.
 *
 * 'paint' — our own boot screen will hide it once its logo is actually on
 *           screen. Hiding on the React commit instead would expose a frame
 *           of bare background while the image decodes, on every launch.
 * 'now'   — the screen has nothing to decode (text + a button), so the commit
 *           IS the paint. Anything later leaves it invisible under the splash.
 * 'route' — the first real screen owns it, exactly as it always has
 *           (app/index.tsx, in a `finally`).
 */
export type SplashHandover = 'paint' | 'now' | 'route';

/** A Keychain read that has not answered yet is `null`, not a guess. */
export type SessionPresence = 'present' | 'absent' | 'indeterminate';

export interface BootGateState {
  presence: SessionPresence | null;
  /** A live /feature-permissions answer is in hand. */
  hasPlan: boolean;
  /** The device has a last-known screen map on disk. */
  hasCachedPlan: boolean;
  /** The disk cache has finished hydrating, so `hasCachedPlan` means something. */
  cacheReady: boolean;
  /** CACHE_FALLBACK_MS has passed, so the cache is allowed to answer. */
  mayUseCache: boolean;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  timedOut: boolean;
}

export function decideBootGate(s: BootGateState): BootDecision {
  // Nobody is signed in — there is no plan to wait for. Sign-in, onboarding
  // and the PIN screen must never be held behind a 401.
  if (s.presence === 'absent') return 'app';

  // A live answer.
  if (s.hasPlan) return 'app';

  // COS-1069 — the device's last-known map, as a bounded FALLBACK for a slow
  // fetch. Deliberately below the live branch so a healthy launch never pays
  // the timer, and above the error branch so a patient on a train is not
  // stranded on an error screen with a perfectly good cached map on disk.
  if (s.mayUseCache && s.cacheReady && s.hasCachedPlan) return 'app';

  if ((s.isError || s.timedOut) && !s.isFetching) {
    return s.presence === 'indeterminate' ? 'app' : 'error';
  }

  if (
    s.presence === null ||
    s.isLoading ||
    s.isFetching ||
    !s.cacheReady ||
    !s.mayUseCache
  ) {
    return 'loading';
  }

  // Settled, signed in, no data, no error, nothing in flight. Nothing left to
  // wait for, so render rather than hold the app on a spinner forever.
  return 'app';
}

export function splashHandover(decision: BootDecision): SplashHandover {
  if (decision === 'loading') return 'paint';
  if (decision === 'error') return 'now';
  return 'route';
}
