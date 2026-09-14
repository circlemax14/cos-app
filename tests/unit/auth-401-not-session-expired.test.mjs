/**
 * COS-942 — a 401 from the LOGIN endpoint must not be read as "session expired".
 *
 * services/auth.ts posts /v1/auth/login on the same axios instance that
 * carries the 401 response interceptor. A mistyped password therefore entered
 * the token-refresh path; with no refresh token stored (you are signed out by
 * definition) it reached forceSignOut('session_expired'), which:
 *
 *   - deletes cos_access_token / cos_refresh_token / cos_id_token
 *   - deletes cos_username
 *   - and, because security-store starts isLocked=true whenever a PIN exists,
 *     DEFERS the sign-out instead of performing it — arming _pendingReason.
 *
 * The user then typed the right password. Tokens were stored. The armed reason
 * survived, and the next unlock consumed it, wiped the NEW tokens and showed
 * "Session expired". Observed on a Galaxy S26 as an endless
 * sign-in -> PIN -> sign-in loop.
 *
 * The device evidence was decisive: tokens and cos_username gone while
 * cos_cached_user_profile_v1 survived — the exact signature of forceSignOut,
 * which (unlike signOut and checkSession) leaves the profile cache alone.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../../lib/api-client.ts', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('THE POINT: the refresh path is skipped for unauthenticated auth endpoints', () => {
  assert.match(
    code,
    /if \(error\.response\.status === 401 && !originalRequest\?\._retry && !isUnauthenticatedAuthCall\)/,
    'the 401 refresh branch must exclude the auth endpoints',
  );
});

test('login, refresh and social are all excluded', () => {
  /*
   * /v1/auth/refresh matters for a second reason: a 401 from the refresh call
   * itself, retried through the refresh path, is how a loop forms.
   */
  const m = /const AUTH_ENDPOINTS = \[([^\]]*)\]/.exec(code);
  assert.ok(m, 'AUTH_ENDPOINTS must exist');
  for (const p of ['/v1/auth/login', '/v1/auth/refresh', '/v1/auth/social']) {
    assert.ok(m[1].includes(p), `${p} must be excluded from the refresh path`);
  }
});

test('the exclusion is computed from the request URL, not from a flag a caller sets', () => {
  // A caller-supplied opt-out would have to be remembered at every call site.
  // Deriving it from the URL means a new sign-in path cannot forget it.
  assert.match(code, /const url = originalRequest\?\.url \?\? ''/);
  assert.match(code, /AUTH_ENDPOINTS\.some\(\(p\) => url\.includes\(p\)\)/);
});

test('forceSignOut still exists for genuinely expired sessions', () => {
  // The fix must narrow the trigger, not remove the mechanism: a real 401 on
  // an authenticated call must still be able to sign the user out.
  assert.match(code, /forceSignOut\('session_expired'\)/);
  assert.match(code, /async function forceSignOut/);
});
