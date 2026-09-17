/**
 * COS-1032 — the sign-in loop, fourth attempt, and the first one at the
 * interceptor.
 *
 * Vishal, on Android: "I'm keep on coming back to the sign in screen even
 * after entering the PIN."
 *
 * COS-942 fixed two real defects on this screen and both are still in place:
 * /v1/auth/login is exempt from the refresh path (AUTH_ENDPOINTS), and
 * clearPendingSignIn() runs on a successful sign-in. This is a THIRD cause.
 *
 * getRefreshToken() returns `string | null`, and that null collapses two
 * different facts: genuinely signed out, or the secure store did not answer.
 * On Android that store is the Keystore, and a read shortly after launch or
 * device unlock can come back empty while the token is sitting there.
 *
 * Treating it as a sign-out produces exactly the loop: forceSignOut arms a
 * DEFERRED sign-in (he has a PIN, so it cannot run now), he enters the PIN,
 * and postUnlockNavigate consumes the pending reason and sends him back to
 * sign-in. The password was never wrong; the session was never dead.
 *
 * auth-tokens.ts had already solved this for the SPLASH. Its own comment says
 * the local-read path "never got the equivalent" of checkSession's
 * indeterminate arm — readSessionPresence was wired into app/index.tsx and
 * nowhere else. My own notes on COS-890 say the same thing: three prior
 * attempts all fixed the splash read, never the interceptor's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CLIENT = stripComments(read('lib/api-client.ts'));
const TOKENS = read('lib/auth-tokens.ts');

test('THE POINT: an unreadable store no longer signs the user out', () => {
  const block = CLIENT.slice(CLIENT.indexOf('const refreshToken = await getRefreshToken()'));
  const guard = block.slice(0, block.indexOf('forceSignOut'));
  assert.match(guard, /readSessionPresence\(\{ expectSession: true \}\)/);
  assert.match(guard, /presence === 'indeterminate'/);
});

test('an indeterminate read fails the REQUEST, not the session', () => {
  const block = CLIENT.slice(CLIENT.indexOf("presence === 'indeterminate'"));
  const arm = block.slice(0, block.indexOf('forceSignOut'));
  assert.match(arm, /throw error/);
  // It must not clear tokens or arm a deferred sign-in on the way out.
  assert.doesNotMatch(arm, /clearTokens|requestSignIn/);
});

test('a genuine sign-out STILL signs out — this is not a blanket suppression', () => {
  // 'absent' must keep reaching forceSignOut, or a truly dead session lingers.
  const block = CLIENT.slice(CLIENT.indexOf('const refreshToken = await getRefreshToken()'));
  assert.match(block, /await forceSignOut\('session_expired'\)/);
});

test('the three-state read exists and reports indeterminate', () => {
  assert.match(TOKENS, /SessionPresence = 'present' \| 'absent' \| 'indeterminate'/);
  assert.match(TOKENS, /return opts\.expectSession \? 'indeterminate' : 'absent'/);
});

test('COS-942 is untouched — both its fixes must survive', () => {
  // Regressing either would reopen the loop by a different door.
  assert.match(CLIENT, /AUTH_ENDPOINTS = \['\/v1\/auth\/login'/);
  assert.match(CLIENT, /isUnauthenticatedAuthCall/);
  const signIn = read('app/(auth)/sign-in.tsx');
  assert.match(signIn, /clearPendingSignIn\(\)/);
});
