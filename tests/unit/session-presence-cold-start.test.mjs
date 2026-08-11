/**
 * Bug #17 — "sign-in screen on open" — attempt 3.
 *
 * Ken 2026-08-11: "when i opened app i was taken to sign in screen and when i
 * force close and open app again then i was taken to pin screen."
 *
 * That second clause is the diagnosis. The token EXISTS — the second launch
 * found it. So this was never about WHICH token we read (attempt 2, which
 * swapped access for refresh) nor about the network (attempt 1). The read
 * itself returns empty on a cold start and we believe it.
 *
 * Root cause: `readSecureWithRetry` only retries when getItemAsync THROWS.
 * On iOS the Keychain-not-yet-available case commonly returns nil instead —
 * expo-secure-store surfaces that as a plain null, no error — so the retry
 * never engages, and `hasStoredSession(): boolean` collapses "no token" and
 * "could not read the token" into the same `false`.
 *
 * These are source-reading contract tests: the behaviour lives in a cold-start
 * race against the iOS Keychain, which cannot be reproduced in node. What CAN
 * be pinned is the shape of the decision.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKENS = readFileSync(join(ROOT, 'lib/auth-tokens.ts'), 'utf8');
const SPLASH = readFileSync(join(ROOT, 'app/index.tsx'), 'utf8');

/** Comments legitimately discuss what must NOT happen; strip them first. */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('session presence has an explicit "could not tell" arm', () => {
  // A boolean cannot express it, which is the entire bug.
  assert.match(TOKENS, /export type SessionPresence =\s*'present' \| 'absent' \| 'indeterminate'/);
  assert.match(TOKENS, /export async function readSessionPresence/);
});

test('an empty read retries when a session is expected', () => {
  // The pre-existing retry only caught throws. Null is the case that fires.
  assert.match(TOKENS, /readSecureExpectingValue/);
  const fn = TOKENS.slice(TOKENS.indexOf('async function readSecureExpectingValue'));
  assert.match(fn, /value !== null && value\.length > 0/, 'must treat empty as retryable');
  assert.match(fn, /setTimeout/, 'must back off between attempts');
});

test('a signed-out launch does NOT pay the retry cost', () => {
  // Retrying on null unconditionally would add backoff to every genuine
  // sign-out. The retry is gated on corroborating evidence.
  assert.match(codeOnly(TOKENS), /opts\.expectSession \? readSecureExpectingValue/);
  assert.match(codeOnly(TOKENS), /return opts\.expectSession \? 'indeterminate' : 'absent'/);
});

test('indeterminate NEVER routes to sign-in', () => {
  // This is the whole fix. The network path already refuses to sign out on an
  // indeterminate result; the local-read path now matches it.
  const code = codeOnly(SPLASH);
  const branch = code.slice(
    code.indexOf("if (presence === 'indeterminate')"),
    code.indexOf("if (presence === 'absent')"),
  );
  assert.ok(branch.length > 0, 'expected an indeterminate branch before the absent branch');
  assert.doesNotMatch(branch, /requestSignIn/, 'indeterminate must not force a sign-in');
  assert.match(branch, /lock-screen/, 'a PIN user goes to the lock screen');
});

test('only a definite absence signs the user out', () => {
  assert.match(codeOnly(SPLASH), /if \(presence === 'absent'\)[\s\S]{0,120}requestSignIn\('splash_no_session'\)/);
});

test('the splash corroborates before concluding "no session"', () => {
  // A PIN on disk or a cached profile means this device has signed in before.
  assert.match(codeOnly(SPLASH), /expectSession: pinConfigured \|\| cachedProfile !== null/);
});

test('a confirmed read warms the cache so the next call is free', () => {
  // checkSession() calls hasStoredSession() moments later; without warming,
  // that read races the Keychain all over again.
  const fn = TOKENS.slice(TOKENS.indexOf('export async function readSessionPresence'));
  assert.match(fn, /cachedRefreshToken = refresh/);
  assert.match(fn, /cachedAccessToken = access/);
});

test('the thrown-read path (COS-353) is still handled', () => {
  // The earlier fix covered exceptions and is still needed — this attempt
  // adds the silent-null case beside it, it does not replace it.
  assert.match(SPLASH, /COS-353/);
  assert.match(codeOnly(SPLASH), /pinConfigured[\s\S]{0,200}lock-screen/);
});
