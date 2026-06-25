/**
 * SCRUM-520 (COS-379): Pure decision helper for the background→active lock guard.
 *
 * Extracted from use-app-lock.ts so the guard formula can be unit-tested without
 * the React Native / expo-router runtime. The hook calls this function and acts
 * on the result — keeping the effectful bits (AsyncStorage, router.replace,
 * setAppLocked) in the hook and the decision logic here.
 *
 * WHY THIS EXISTS — the regression
 * The original guard was:
 *   `isAppLocked() || (pathname ?? '').startsWith('/(security)/lock-screen')`
 *
 * The OR short-circuits when `isAppLocked()` is true. The security-store
 * initialises `isLocked` to `true` and the mirror effect in SecurityProvider
 * syncs it — so `_appLocked` is `true` on first render until
 * `refreshSecurityState` resolves. On every warm resume the stale mirror read
 * `true`, the OR short-circuited, and `captureAndLock` was never called. The
 * user saw the sign-in screen instead of the PIN lock screen.
 *
 * THE FIX — AND instead of OR
 *   `wasLocked && onLockScreen`
 *
 * `wasLocked` is the REAL lock state captured BEFORE the async getLockTimeout()
 * gap. The AND is only true when the user was GENUINELY mid-unlock (on the lock
 * screen with the mirror already set). A normal warm resume where wasLocked=false
 * now correctly falls through to captureAndLock.
 *
 * COS-351 Face-ID-flicker preservation:
 * wasLocked=true && onLockScreen=true → skip re-lock (user is on PIN screen).
 * This is the only case that should be suppressed, and it still is.
 */

/**
 * Inputs for the warm-resume lock guard decision.
 */
export interface ResumeLockInput {
  /**
   * The lock state captured SYNCHRONOUSLY before any await — the real prior
   * state before the security-store could update it again. In use-app-lock.ts
   * this is `const wasLocked = isAppLocked()` captured before getLockTimeout().
   */
  wasLocked: boolean;
  /**
   * The current pathname from usePathname(). Used to detect if the user is
   * already on the lock screen (Face-ID dismiss race / COS-351 fix).
   */
  pathname: string | null | undefined;
}

/**
 * Decision result for the warm-resume lock guard.
 */
export type ResumeLockDecision =
  | { alreadyLocked: true }   // skip captureAndLock — user is mid-unlock
  | { alreadyLocked: false };  // proceed to check elapsed time + captureAndLock

/**
 * Compute whether the warm-resume handler should skip re-locking because the
 * user is already genuinely mid-unlock (on the lock screen).
 *
 * Pure function — no side effects, no React, no router.
 */
export function computeResumeLockDecision(input: ResumeLockInput): ResumeLockDecision {
  const onLockScreen = (input.pathname ?? '').startsWith('/(security)/lock-screen');
  // AND: only skip if BOTH (a) the user was already locked AND (b) they are
  // currently on the lock screen. This preserves the COS-351 Face-ID-flicker
  // fix while fixing the SCRUM-520 warm-resume regression.
  const alreadyLocked = input.wasLocked && onLockScreen;
  return { alreadyLocked };
}
