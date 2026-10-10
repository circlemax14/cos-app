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
import { jwtExpiryMs } from '../../lib/jwt-expiry.ts';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LOCK = strip(read('app/(security)/lock-screen.tsx'));
const PURGE = strip(read('lib/purge-local-phi.ts'));
const PLAN = strip(read('services/plan-task-notifications.ts'));
const AUTH = strip(read('services/auth.ts'));
const VITALS = strip(read('services/vitals-recheck-notifications.ts'));

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

test('MOB-03: the vitals-recheck dedupe key is purged with the cancel, or the alert is lost for good', () => {
  // The cancel removes today's amber/red recheck; if `csh-vitals-recheck:<metric>:<day>`
  // survived, the next sign-in's reconcile would read "already scheduled today"
  // and never re-create it (services/calendar-notifications.ts documents this loss).
  const prefix = VITALS.match(/dedupeKey = \([^)]*\) => `([a-z-]+:)/)?.[1];
  assert.equal(prefix, 'csh-vitals-recheck:', 'dedupe key format found');
  const list = PURGE.slice(PURGE.indexOf('PHI_KEY_PREFIXES = ['), PURGE.indexOf('] as const'));
  assert.ok(list.includes(`'${prefix}'`), 'PHI_KEY_PREFIXES sweeps the vitals dedupe key');
});

const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

test('jwtExpiryMs reads exp (base64url-safe) and is null for anything else', () => {
  assert.equal(jwtExpiryMs(jwt({ exp: 1700000000, n: '~~~>>>' })), 1700000000 * 1000);
  for (const t of ['', 'opaque', 'a.b.c', jwt({}), jwt({ exp: 'soon' })]) {
    assert.equal(jwtExpiryMs(t), null, t);
  }
});

test('MOB-05: sign-out refreshes an expired bearer for the push unregister, with a refresh token read BEFORE the wipe', () => {
  const so = AUTH.slice(AUTH.indexOf('export async function signOut'));
  const readRefresh = so.indexOf('getRefreshToken()');
  const wipe = so.indexOf('clearTokens()');
  const bearer = so.indexOf('outgoingBearer(token, refreshToken)');
  assert.ok(readRefresh > -1 && readRefresh < wipe, 'refresh token captured before clearTokens');
  assert.ok(wipe < bearer, 'COS-1250 ordering kept: wipe first, network after');
  assert.ok(bearer < so.indexOf("'/v1/auth/me'") && bearer < so.indexOf('unregisterPushToken('),
    'both cleanup calls carry the refreshed bearer');
  const ob = AUTH.slice(AUTH.indexOf('async function outgoingBearer'), AUTH.indexOf('export async function signOut'));
  assert.match(ob, /jwtExpiryMs\(access\)/);
  assert.match(ob, /'\/v1\/auth\/refresh',\s*\{ refreshToken: refresh \}/);
  assert.ok(!ob.includes('storeTokens'), 'refreshed tokens are never persisted');
});
