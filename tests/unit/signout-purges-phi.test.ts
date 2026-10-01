/**
 * COS-1152 — every path that ends a session forgets the account's health data.
 *
 * There are three, and only one of them was cleaning up:
 *
 *   services/auth.ts signOut()        the user taps Sign out          — purged
 *   lib/api-client.ts forceSignOut()  a 401 whose refresh failed      — did NOT
 *   services/auth.ts 401/403 verdict  the auth check says unauth'd    — partial
 *
 * The second is the common one: an expired session, a revoked refresh token, a
 * password change on another device. The patient hooks run a 10-minute
 * staleTime against a 10-minute gcTime, so on a shared device the next
 * account's mount is served the previous account's records FROM CACHE — no
 * HTTP request to fail, nothing on screen to hint at it.
 *
 * Source-text assertions because the defect is an ABSENT call. No mock can
 * fail on a function that was never invoked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const API = readFileSync(new URL('../../lib/api-client.ts', import.meta.url), 'utf8');
const AUTH = readFileSync(new URL('../../services/auth.ts', import.meta.url), 'utf8');
const PURGE = readFileSync(new URL('../../lib/purge-local-phi.ts', import.meta.url), 'utf8');

const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const API_CODE = strip(API);
const AUTH_CODE = strip(AUTH);
const PURGE_CODE = strip(PURGE);

test('the involuntary sign-out purges, not just clears tokens', () => {
  const i = API_CODE.indexOf('async function forceSignOut');
  assert.ok(i > -1);
  const body = API_CODE.slice(i, API_CODE.indexOf('\n}', i));
  assert.match(body, /await purgeLocalPhi\(\)/);
});

test('it purges BEFORE navigating to sign-in', () => {
  /*
   * Otherwise the sign-in screen can mount over a cache that is still being
   * emptied, and a racing refetch repopulates it from the outgoing session.
   */
  const i = API_CODE.indexOf('async function forceSignOut');
  const body = API_CODE.slice(i, API_CODE.indexOf('\n}', i));
  const purge = body.indexOf('purgeLocalPhi()');
  const nav = body.indexOf('requestSignIn(');
  assert.ok(purge > -1 && nav > -1);
  assert.ok(purge < nav, 'purge runs before the navigation');
});

test('the deliberate sign-out uses the SAME function, not its own copy', () => {
  // One cleanup for both paths is what stops them drifting apart again.
  assert.match(AUTH_CODE, /await purgeLocalPhi\(\)/);
  assert.ok(!AUTH_CODE.includes('queryClient.clear()'), 'no second inline copy');
  assert.ok(
    !AUTH_CODE.includes('export async function purgePhiAsyncStorageKeys'),
    'the purge no longer lives in auth.ts',
  );
});

test('the 401/403 auth verdict purges too', () => {
  // It used to clear the cached profile alone and leave the query cache whole.
  const i = AUTH_CODE.indexOf('status === 401 || status === 403');
  assert.ok(i > -1);
  const body = AUTH_CODE.slice(i, i + 400);
  assert.match(body, /await purgeLocalPhi\(\)/);
});

test('the purge empties the React Query cache', () => {
  // The cache is the leak: a 10-minute staleTime means the next mount need
  // make no request at all.
  assert.match(PURGE_CODE, /queryClient\.clear\(\)/);
});

test('it also drops the cached profile, user summary and PHI storage keys', () => {
  assert.match(PURGE_CODE, /clearCachedProfile\(\)/);
  assert.match(PURGE_CODE, /clearCachedUserSummary\(\)/);
  assert.match(PURGE_CODE, /purgePhiAsyncStorageKeys\(\)/);
  for (const prefix of ['doctor_data_', 'assessment-draft:', 'assessment_']) {
    assert.ok(PURGE_CODE.includes(`'${prefix}'`), `${prefix} still swept`);
  }
});

test('one failing step does not abort the rest of the purge', () => {
  /*
   * A purge that stops at the first error leaves strictly more behind than
   * one that continues. Each step is guarded independently.
   */
  const i = PURGE_CODE.indexOf('export async function purgeLocalPhi');
  const body = PURGE_CODE.slice(i);
  const tries = (body.match(/try \{/g) ?? []).length;
  assert.ok(tries >= 3, `expected each step guarded, found ${tries} try blocks`);
});

test('purge-local-phi does not import auth.ts', () => {
  // auth.ts imports api-client, so api-client cannot import auth.ts back.
  // This module is the shared third party; an import here would restore the cycle.
  assert.ok(!PURGE_CODE.includes("from '@/services/auth'"));
  assert.ok(!PURGE_CODE.includes("from '../services/auth'"));
});
