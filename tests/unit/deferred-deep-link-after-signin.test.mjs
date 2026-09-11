/**
 * COS-947 — a notification tapped while signed out survives the sign-in.
 *
 * Vishal: "due to session expiry my app signed out, and I got a notification
 * for help and support. When I clicked the notification I went to the sign in
 * screen, and after signing in it took me to the HOME screen. Ideally it should
 * take me to the SUPPORT screen."
 *
 * The intent was already being captured. security-store starts isLocked=true
 * whenever a PIN exists, so while signed out isAppLocked() is true and
 * use-notifications defers the route instead of pushing it. What was missing
 * was a READER: consumeDeferredNavigation() had exactly one caller — the lock
 * screen's resumeAfterUnlock — and someone signing in with a password never
 * passes through it.
 *
 * Source-level assertions, because the value of these fixes is WHERE the calls
 * sit relative to the onboarding gates, which a behavioural test of the module
 * cannot see.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const signIn = strip(read('app/(auth)/sign-in.tsx'));
const tokens = strip(read('lib/auth-tokens.ts'));

test('THE POINT: sign-in consumes the deferred route and navigates to it', () => {
  assert.match(signIn, /consumeDeferredNavigation\(\)/, 'sign-in must read the queue');
  assert.match(
    signIn,
    /router\.replace\(\(deferredAfterSignIn \?\? '\/Home'\) as never\)/,
    'the terminal branch must prefer the deferred route over Home',
  );
});

test('THE POINT: it is consumed BEFORE the onboarding gates, and used only AFTER them', () => {
  /*
   * Ordering is the whole safety argument. Consuming early means a diverted
   * patient's stale intent is dropped rather than replayed hours later out of
   * context; using it only on the terminal branch means a deep link can never
   * jump someone over terms acceptance or device permissions onto a PHI screen.
   */
  const consumedAt = signIn.indexOf('consumeDeferredNavigation()');
  const termsGate = signIn.indexOf("'/(onboarding)/usage-guidelines'");
  const usedAt = signIn.indexOf('deferredAfterSignIn ??');
  assert.ok(consumedAt > 0 && termsGate > 0 && usedAt > 0, 'all three anchors must exist');
  assert.ok(consumedAt < termsGate, 'must be consumed before the terms gate');
  assert.ok(usedAt > termsGate, 'must only be USED after every onboarding gate');
});

test('THE POINT: signing out drops the queue — the PHI leak its own header names', () => {
  /*
   * locked-nav-queue's header: "CLEARED ON SIGN-OUT. Without that, signing out
   * and back in as a different account could navigate the new session to the
   * previous user's screen. That is a PHI leak wearing the costume of a
   * convenience feature." The function existed, exported, with zero callers.
   *
   * It matters more now: COS-947 added a second reader on the sign-in path, so
   * user A taps, the session drops, user B signs in within the 5-minute TTL and
   * lands on A's screen.
   */
  assert.match(tokens, /clearDeferredNavigation\(\)/, 'clearTokens must drop the queue');
});

test('it is cleared in clearTokens, the funnel every credential path uses', () => {
  // Not in signOut(): the 401-refresh failure, the lock screen's five-attempt
  // bailout and Forgot-PIN all clear credentials without calling signOut.
  // The entitlement cache is cleared here for exactly the same reason.
  assert.match(
    tokens,
    /export async function clearTokens[\s\S]*?clearDeferredNavigation\(\)/,
    'the call must be inside clearTokens',
  );
});

test('the queue still refuses anything that is not an absolute path', () => {
  // The reader trusts the writer's validation; if that guard were dropped, a
  // crafted payload could steer post-sign-in navigation.
  const queue = strip(read('lib/locked-nav-queue.ts'));
  assert.match(queue, /!route\.startsWith\('\/'\)\) return/);
});
