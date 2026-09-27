/**
 * COS-1149 — never replace the sign-in screen with the sign-in screen.
 *
 * Vishal, on the dev build: "if I try to use the password from this saved
 * password and the input box are filled with the email ID and password ...
 * after they are filled in few seconds sign in screen is reloaded again ...
 * I have to type it again."
 *
 * `router.replace` to the route you are ALREADY on remounts it, and a remount
 * resets the screen's useState — which is where the autofilled username and
 * password live. The navigation looks like a no-op and is in fact the thing
 * wiping the form.
 *
 * It fires because iOS Password AutoFill briefly backgrounds the app. On
 * return the root-level sync hooks re-run on AppState 'active'; one of them
 * hitting an authed endpoint while signed out gets a 401, the refresh fails,
 * and forceSignOut lands in requestSignIn — several seconds later, which is
 * the delay he described.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const GATE = readFileSync(new URL('../../lib/lock-gate.ts', import.meta.url), 'utf8');
const HOOK = readFileSync(new URL('../../hooks/use-app-lock.ts', import.meta.url), 'utf8');

/* Comments quote the bug, so match code only. */
const CODE = GATE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HOOK_CODE = HOOK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('requestSignIn bails before navigating when already on sign-in', () => {
  const i = CODE.indexOf('export async function requestSignIn');
  assert.ok(i > -1);
  const body = CODE.slice(i, CODE.indexOf('\n}', i));
  const guard = body.indexOf('isOnSignInScreen()');
  const nav = body.indexOf("router.replace('/(auth)/sign-in'");
  assert.ok(guard > -1, 'the guard exists');
  assert.ok(nav > -1, 'the navigation still exists for every other route');
  assert.ok(guard < nav, 'the guard runs BEFORE the navigation');
});

test('the route check uses SEGMENTS, not pathname', () => {
  /*
   * COS-942 is the reason, and it is not a style preference: usePathname()
   * strips group segments, so it returns '/sign-in' and never
   * '/(auth)/sign-in'. That confusion made every group-prefixed guard in
   * use-app-lock silently dead and produced a sign-in loop. A guard written
   * against pathname here would be false forever and this bug would look
   * fixed while doing nothing.
   */
  assert.match(CODE, /_currentSegments\.includes\('\(auth\)'\)/);
  assert.match(CODE, /_currentSegments\.includes\('sign-in'\)/);
  assert.ok(!CODE.includes('usePathname'), 'lock-gate must not reach for pathname');
});

test('the mirror is published from the root-mounted hook', () => {
  // useAppLock is mounted at the root layout for the lifetime of the app
  // process (SCRUM-235), which is what makes it the right owner.
  assert.match(HOOK_CODE, /setCurrentSegments\(segments as readonly string\[\]\)/);
  assert.match(HOOK_CODE, /setCurrentSegments/);
});

test('the mirror follows useSegments, not the pathname ref', () => {
  /*
   * Matched on the effect's closing deps rather than by slicing to the next
   * ']' — `readonly string[]` inside the body carries one, which is exactly
   * the kind of near-miss that makes a guard test pass against broken code.
   */
  assert.match(
    HOOK_CODE,
    /setCurrentSegments\(segments as readonly string\[\]\);\s*\n\s*\}, \[segments\]\);/,
  );
});

test('the guard is at the choke point, not at one caller', () => {
  /*
   * Every path to sign-in funnels through requestSignIn — the 401 interceptor,
   * the splash gate and the lock screen alike. Guarding one caller would leave
   * the others, and the next one added would reintroduce the bug.
   */
  assert.match(CODE, /export async function requestSignIn/);
  const navs = CODE.match(/router\.replace\('\/\(auth\)\/sign-in'/g) ?? [];
  assert.equal(navs.length, 1, 'exactly one navigation to sign-in in this module');
});
