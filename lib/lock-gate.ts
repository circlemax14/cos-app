/**
 * SCRUM-279 (2026-06-11 build 44): deferred sign-in queue for the lock screen.
 *
 * ⚠️ NAME CORRECTION (COS-724, 2026-08-19). This file used to call itself a
 * "centralised lock-screen gate". It is not one, and that wording cost real
 * time: it reads as though the lock is enforced here, so nobody looked for the
 * enforcement that was missing. What this module actually holds is one boolean
 * (`_appLocked`) and one deferred sign-in reason. `_appLocked` is consumed by
 * exactly two things — `requestSignIn()` below, and `isAppLocked()` in
 * hooks/use-app-lock.ts. It therefore gates the ORDERING of sign-in redirects
 * and nothing else: not a single API request, not a single render.
 *
 * The claim further down that "PHI is never shown in the gap" was true only of
 * the specific race it describes. It is NOT a general property, and it was read
 * as one. As of COS-724 there are four confirmed ways to put PHI on screen while
 * `_appLocked` is true — iOS swipe-back, Android hardware back, notification
 * tap, and deep link — because `isLocked` has never been a render gate and
 * locking is only a `router.replace`. See lib/lock-render-gate.ts.
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
  /*
   * COS-1149 — never replace the sign-in screen with the sign-in screen.
   *
   * Vishal, on the dev build: "if I try to use the password from this saved
   * password and the input box are filled with the email ID and password ...
   * after they are filled in few seconds sign in screen is reloaded again ...
   * I have to type it again."
   *
   * `router.replace` to the route you are ALREADY on remounts it, and a
   * remount resets the screen's useState — which is where the autofilled
   * username and password live. So the navigation looks like a no-op and is
   * in fact the thing wiping the form.
   *
   * It fires because iOS Password AutoFill briefly backgrounds the app. On
   * return, the root-level sync hooks re-run on AppState 'active'; any of them
   * hitting an authed endpoint while signed out gets a 401, the refresh fails,
   * and forceSignOut lands here — several seconds later, which is exactly the
   * delay he described.
   *
   * Guarding here rather than in the hooks is deliberate: this is the single
   * choke point every path to sign-in funnels through (see the header), so one
   * guard covers the 401 interceptor, the splash gate and the lock screen
   * alike. Fixing it at one caller would leave the others.
   */
  if (isOnSignInScreen()) return;
  router.replace('/(auth)/sign-in' as never);
}

/*
 * COS-1149 — the current route, mirrored for a module that cannot use hooks.
 *
 * SEGMENTS, not pathname, and COS-942 is the reason: usePathname() strips
 * group segments, so it returns '/sign-in' and never '/(auth)/sign-in'. That
 * exact confusion made every group-prefixed guard in use-app-lock silently
 * dead and produced a sign-in loop. Anything comparing routes in this codebase
 * compares segments.
 */
let _currentSegments: readonly string[] = [];

/** Called from the root-mounted useAppLock, which already has useSegments(). */
export function setCurrentSegments(segments: readonly string[]): void {
  _currentSegments = segments;
}

function isOnSignInScreen(): boolean {
  return _currentSegments.includes('(auth)') && _currentSegments.includes('sign-in');
}

/**
 * COS-1166 — has the router left the splash gate yet?
 *
 * `app/index.tsx` is the root index route, so while the splash pipeline is
 * still deciding a destination `useSegments()` is EMPTY. The moment it routes
 * — '/Home', '/(auth)/sign-in', '/(security)/lock-screen', onboarding —
 * there is at least one segment.
 *
 * Used by the push handler to refuse to navigate before splash has settled,
 * because a push that lands first is silently wiped by splash's
 * `router.replace` (COS-437), and the old code had already marked the tap
 * handled by then.
 */
export function hasSettledRoute(): boolean {
  return _currentSegments.length > 0;
}

/** Test seam — reset the mirror between cases. */
export function __resetCurrentSegmentsForTests(): void {
  _currentSegments = [];
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

/**
 * SCRUM-520 (COS-379): non-consuming peek at the deferred sign-in queue.
 *
 * Returns `true` if a sign-in was deferred while the app was locked —
 * meaning the Cognito session is genuinely dead. Used by the
 * background→active handler in use-app-lock.ts to decide whether it is
 * safe to release a temporarily-forced lock mirror or whether it must
 * route through the PIN screen first (local-first security model).
 *
 * Intentionally a simple boolean peek: callers that need the reason
 * should use `consumePendingSignIn()` AFTER the lock-screen is showing.
 */
export function hasPendingSignIn(): boolean {
  return _pendingReason !== null;
}
