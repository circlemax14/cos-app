/**
 * COS-940 — the lock path asks before it dismisses.
 *
 * `router.dismissAll()` does NOT throw when the modal stack is empty. It
 * dispatches POP_TO_TOP, the navigator declines it, and react-navigation logs
 * "The action 'POP_TO_TOP' was not handled by any navigator". So a bare
 * try/catch around it — which is what was there — catches nothing, and the
 * message fires on every lock from a tab screen, i.e. the common case.
 *
 * Invisible in release (the warning is compiled out) but a full-width red
 * error toast in debug, sitting across the bottom of every screenshot.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../../hooks/use-app-lock.ts', import.meta.url), 'utf8');
/** Comments describe the bug at length; assertions must not match prose. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('THE POINT: dismissAll is only called when there is something to dismiss', () => {
  assert.match(
    code,
    /if\s*\(\s*router\.canDismiss\(\)\s*\)\s*\{\s*router\.dismissAll\(\)/,
    'dismissAll must be guarded by canDismiss(), not by a catch that never fires',
  );
});

test('no unguarded dismissAll survives anywhere in the lock path', () => {
  // A second call site added later would reintroduce the toast, and it would
  // look exactly like the first one did: silent in prod, noisy in debug.
  const calls = [...code.matchAll(/router\.dismissAll\(\)/g)];
  assert.equal(calls.length, 1, 'expected exactly one dismissAll call site');
  const before = code.slice(0, calls[0].index);
  assert.match(before.slice(-80), /canDismiss\(\)\s*\)\s*\{\s*$/, 'the call site must sit inside the canDismiss guard');
});

test('the try/catch is KEPT — canDismiss itself can throw', () => {
  /*
   * canDismiss() reads navigation state and throws if the router is not
   * mounted. This runs in the resume path that produced the triple-Face-ID
   * prompt; an unhandled throw leaves _appLocked=true with no lock screen
   * showing, which is worse than the bypass the dismiss exists to close.
   */
  const guard = /try\s*\{\s*if\s*\(\s*router\.canDismiss\(\)[\s\S]{0,120}?\}\s*catch\s*\{/;
  assert.match(code, guard, 'canDismiss must sit inside try/catch');
});

test('replace() still runs after the guard, whatever happened above', () => {
  // Falling through to replace() is what actually shows the lock screen. If a
  // throw skipped it, the app would be flagged locked with no lock visible.
  const idx = code.indexOf('router.dismissAll()');
  assert.ok(idx > 0);
  assert.match(
    code.slice(idx),
    /catch\s*\{[\s\S]*?\}\s*router\.replace\('\/\(security\)\/lock-screen'/,
    'replace must follow the catch, not sit inside the try',
  );
});
