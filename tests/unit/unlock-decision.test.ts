import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUnlockAction } from '../../lib/unlock-decision.ts';

test('local-first: no deferred reason → enter the app immediately (no network gate)', () => {
  // THE core regression guard. Old code awaited checkSession() here and wiped
  // a valid session on any transient failure. Local-first must enter the app.
  const action = resolveUnlockAction({ pendingReason: null, localFirst: true });
  assert.deepEqual(action, { type: 'enter-app' });
});

test('a deferred sign-in reason always wins, even in local-first (confirmed-dead session)', () => {
  // Security: if the interceptor/SplashGate already proved the session is
  // dead, we must route to sign-in and never render PHI — local-first or not.
  const action = resolveUnlockAction({ pendingReason: 'refresh_failed', localFirst: true });
  assert.deepEqual(action, { type: 'sign-in', reason: 'refresh_failed' });
});

test('deferred reason wins with the kill-switch off too', () => {
  const action = resolveUnlockAction({ pendingReason: 'session_expired', localFirst: false });
  assert.deepEqual(action, { type: 'sign-in', reason: 'session_expired' });
});

test('kill-switch off + no deferred reason → legacy validate-then-enter', () => {
  const action = resolveUnlockAction({ pendingReason: null, localFirst: false });
  assert.deepEqual(action, { type: 'validate-then-enter' });
});
