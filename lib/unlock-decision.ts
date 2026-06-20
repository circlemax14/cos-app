import type { SignInReason } from './lock-gate';

/**
 * Kill-switch for local-first unlock (COS-351).
 *
 * When `true` (default), a successful PIN/biometric unlock enters the app
 * IMMEDIATELY on cached data and revalidates the backend session in the
 * BACKGROUND — the same trust model SplashGate already uses for its
 * optimistic cached-profile route on cold launch. The api-client interceptor
 * still force-signs-out on a GENUINE auth rejection (NotAuthorized /
 * invalid_grant / 401 after a valid refresh), so a truly-dead session still
 * bounces to sign-in within a second or two — but a transient network error
 * on resume no longer freezes the unlock or discards a valid 30-day session.
 *
 * Flip to `false` and ship an OTA to instantly revert to the legacy behavior
 * (block the unlock on a `checkSession()` round-trip) if the new flow ever
 * misbehaves. This is the canary kill-switch — no remote fetch on the unlock
 * path (that network dependency is exactly what we're removing).
 */
export const LOCAL_FIRST_UNLOCK = true;

export type UnlockAction =
  | { type: 'sign-in'; reason: SignInReason }
  | { type: 'enter-app' }
  | { type: 'validate-then-enter' };

/**
 * Pure decision for what a successful local unlock should do.
 *
 *  - A `pendingReason` means a GENUINE bad session was already detected and
 *    deferred while the user was locked (set by the api-client interceptor's
 *    `forceSignOut`, or by SplashGate's background revalidation). That always
 *    wins → route to sign-in (after wiping tokens so no PHI renders).
 *  - Otherwise, local-first enters the app immediately; the legacy path
 *    validates against the backend before entering.
 *
 * Extracted as a pure function so the freeze / spurious-sign-out regression
 * is covered by a unit test without needing the React Native runtime.
 */
export function resolveUnlockAction(opts: {
  pendingReason: SignInReason | null;
  localFirst: boolean;
}): UnlockAction {
  if (opts.pendingReason) return { type: 'sign-in', reason: opts.pendingReason };
  return opts.localFirst ? { type: 'enter-app' } : { type: 'validate-then-enter' };
}
