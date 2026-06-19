/**
 * SCRUM-279 (2026-06-11 build 44): centralised lock-screen gate.
 *
 * THE BUG THIS REPLACES
 * Two parallel flows could race during the cold-launch PIN entry:
 *
 *   • SplashGate routed the user to /(security)/lock-screen, then
 *     fired revalidateInBackground → /v1/auth/me. If the access token
 *     had expired and refresh failed (network, refresh-token TTL,
 *     etc.) forceSignOut() ran router.replace('/(auth)/sign-in'),
 *     yanking the user off the lock screen mid-PIN-entry.
 *   • The /(security)/lock-screen → /Home transition didn't validate
 *     the session before showing PHI, opening a brief window where
 *     stale data could be rendered.
 *
 * THE NEW ARCHITECTURE
 * Every code path that wants to send the user to sign-in (token
 * refresh failure, explicit sign-out, splash-gate detection) now goes
 * through `requestSignIn()`. If the app is currently locked OR is
 * about to show the lock screen, the request is DEFERRED — stashed
 * into module state and only acted on after the user has successfully
 * unlocked. The lock screen drains the queue via
 * `consumePendingSignIn()` and shows a "Session expired" message
 * before routing — so the user knows WHY they're being asked to
 * re-authenticate rather than just being dumped on sign-in.
 *
 * SECURITY POSTURE
 * The PIN gate is a device-local secret; it does NOT authorise any
 * backend call. The Cognito tokens (or app-signed social tokens) do.
 * So when the backend session is genuinely gone (refresh expired,
 * password rotated, account locked) we still must require a real
 * re-sign-in before showing any PHI. The deferred-sign-in pattern
 * preserves that: the user enters PIN → the gate confirms a real
 * session is required → routes them to sign-in. PHI is never shown
 * in the gap.
 *
 * Module-scoped so api-client.ts / SplashGate / SecurityProvider can
 * share state without threading refs through the tree. No React
 * required — works in any axios interceptor or async context.
 */

import { router } from 'expo-router';

// ── Lock state ───────────────────────────────────────────────────────

let _appLocked = false;

/** Called by SecurityProvider whenever isLocked transitions. */
export function setAppLocked(locked: boolean): void {
  _appLocked = locked;
}

export function isAppLocked(): boolean {
  return _appLocked;
}

// ── Deferred sign-in queue ──────────────────────────────────────────
//
// Reasons we might want the user to re-authenticate. The lock-screen
// surfaces these on unlock so the user understands what happened.

export type SignInReason =
  | 'session_expired'   // refresh token expired or backend rejected
  | 'refresh_failed'    // refresh call errored (network, malformed, …)
  | 'manual_sign_out'   // user pressed sign-out in profile menu
  | 'splash_no_session' // splash gate found no stored tokens
  | 'splash_revalidate_failed' // splash background revalidate failed
  | 'unrecoverable';    // generic catch-all

let _pendingReason: SignInReason | null = null;

/**
 * Reasons that originate from the cold-launch SplashGate and therefore
 * mean "this user has no valid session and there is nothing for the
 * lock-screen to protect". These MUST navigate immediately even if
 * `_appLocked` is true — the lock-gate's deferral logic is designed to
 * protect users mid-PIN-entry, not to trap users with no tokens on
 * the splash screen forever (COS-348, Ken's 2026-06-18 user report).
 *
 * The bug shape: SecurityProvider persists `isLocked` across launches,
 * so a previously-locked user who later signed out (or whose tokens
 * were cleared) would arrive at SplashGate with `_appLocked === true`
 * AND no session. The splash gate would call `requestSignIn`, the
 * deferral branch would queue the request, no lock-screen would mount
 * (because no profile → no destination), and the splash spinner would
 * render indefinitely. Only "clear app data" recovered it.
 */
const BYPASS_LOCK_REASONS: ReadonlySet<SignInReason> = new Set([
  'splash_no_session',
  'splash_revalidate_failed',
  'unrecoverable',
]);

/**
 * Request that the user be routed to /(auth)/sign-in. If the app is
 * currently locked the request is deferred — the lock-screen will
 * drain it after successful PIN entry. Otherwise the navigation
 * happens immediately.
 *
 * Splash-originated reasons bypass the lock gate (see BYPASS_LOCK_REASONS
 * above) because there is no PHI to protect when there is no session.
 */
export async function requestSignIn(reason: SignInReason): Promise<void> {
  if (_appLocked && !BYPASS_LOCK_REASONS.has(reason)) {
    // Don't clobber a more-specific earlier reason.
    if (!_pendingReason) _pendingReason = reason;
    return;
  }
  router.replace('/(auth)/sign-in' as never);
}

/**
 * Called by the lock-screen AFTER setIsLocked(false) but BEFORE
 * resumeAfterUnlock. Returns the deferred reason (if any) and clears
 * the queue. The caller is responsible for surfacing a friendly
 * "Session expired — please sign in again" message before routing.
 */
export function consumePendingSignIn(): SignInReason | null {
  const reason = _pendingReason;
  _pendingReason = null;
  return reason;
}

/**
 * Test/utility helper: clear the queue without consuming it.
 * Used by sign-in success handlers so a stale deferred reason from
 * a previous lifetime doesn't persist across re-sign-in.
 */
export function clearPendingSignIn(): void {
  _pendingReason = null;
}
