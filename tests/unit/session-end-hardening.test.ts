/**
 * MOB-03 / MOB-04 / MOB-05 — what happens when a session ends at the lock
 * screen, and what a session leaves behind.
 *
 *  MOB-05  "Too many attempts" and "Forgot PIN" only cleared the PIN and the
 *          tokens: no PHI purge, no Cognito sign-out, no username delete, no
 *          push-token unregister. They now go through services/auth signOut().
 *  MOB-04  The 5-attempt lockout lived only in the Alert's onPress. Force-quit
 *          at the alert kept PIN + tokens and every relaunch got a fresh guess.
 *          Now: the persisted counter is checked BEFORE verifyPin, and the wipe
 *          runs BEFORE the alert is shown.
 *  MOB-03  Local plan-task / calendar notifications outlived sign-out (up to 7
 *          days of the previous patient's reminders) and put the raw task title
 *          (e.g. a drug name) on the lock screen.
 *
 * Source-text assertions, as in signout-purges-phi.test.ts: the defects are
 * ABSENT calls and an ordering, which no mock can observe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LOCK = strip(read('app/(security)/lock-screen.tsx'));
const PURGE = strip(read('lib/purge-local-phi.ts'));
const PLAN = strip(read('services/plan-task-notifications.ts'));

const body = (src: string, start: string): string => {
  const i = src.indexOf(start);
  assert.ok(i > -1, `${start} exists`);
  return src.slice(i, src.indexOf('\n  };\n', i));
};

test('MOB-05: lock-screen sign-outs use the full signOut(), not a partial wipe', () => {
  assert.match(LOCK, /import \{[^}]*\bsignOut\b[^}]*\} from '@\/services\/auth'/);
  for (const fn of ['const handleForgotPin', 'const lockOut']) {
    const b = body(LOCK, fn);
    assert.match(b, /signOut\(\)/, `${fn} calls signOut()`);
    assert.ok(!b.includes('clearTokens()'), `${fn} has no partial wipe`);
  }
});

test('MOB-04: the persisted counter is checked BEFORE verifyPin', () => {
  const v = body(LOCK, 'const verifyAndUnlock');
  const gate = v.indexOf('getFailedAttempts()');
  const verify = v.indexOf('verifyPin(');
  assert.ok(gate > -1, 'reads the persisted counter');
  assert.ok(gate < verify, 'counter check precedes the PIN check');
});

test('MOB-04: the wipe runs BEFORE the alert, not inside its button', () => {
  const l = body(LOCK, 'const lockOut');
  const wipe = l.indexOf('signOut()');
  const alert = l.indexOf('Alert.alert(');
  assert.ok(wipe > -1 && alert > -1);
  assert.ok(wipe < alert, 'sign-out happens before the alert is shown');
  const v = body(LOCK, 'const verifyAndUnlock');
  assert.ok(!v.includes('Alert.alert('), 'verifyAndUnlock delegates to lockOut');
});

test('MOB-04: the counter is restored on mount, not reset to MAX', () => {
  assert.match(LOCK, /getFailedAttempts\(\)\.then/);
});

test('MOB-03: every session end cancels and dismisses local notifications', () => {
  assert.match(PURGE, /cancelAllScheduledNotificationsAsync\(\)/);
  assert.match(PURGE, /dismissAllNotificationsAsync\(\)/);
});

test('MOB-03: plan-task notifications carry no task title and use the PRIVATE Android channel', () => {
  assert.ok(!/title:\s*task\.title/.test(PLAN), 'raw task title not on the lock screen');
  assert.match(PLAN, /channelId:\s*categoryForPlanTask\(task\)/);
});
