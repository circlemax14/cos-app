/**
 * COS-942 — the lock guards must see GROUP-PREFIXED paths.
 *
 * ─── THE BUG ─────────────────────────────────────────────────────────
 *
 * Three guards in hooks/use-app-lock.ts compare against group-prefixed
 * constants:
 *
 *   RESTORE_BLOCKLIST = ['/(security)/lock-screen', '/(auth)', ...]
 *   startsWith('/(security)/lock-screen')            // re-entrancy guard
 *   computeResumeLockDecision(...)                    // same string again
 *
 * They were fed usePathname(), which STRIPS group segments — from
 * expo-router's own source (build/global-state/routeInfo.js):
 *
 *     const pathname = '/' + segments
 *       .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
 *
 * so the value was '/sign-in', never '/(auth)/sign-in'. All three comparisons
 * were dead. shouldRestore() returned true for EVERY route, so the pre-lock
 * route could be the sign-in screen itself, and resumeAfterUnlock replayed it:
 * unlock -> /sign-in -> lock -> unlock -> /sign-in, with a valid session.
 *
 * The existing tests in resume-lock-guard.test.ts were not wrong about intent —
 * they assert '/(security)/lock-screen', which is what the guard is FOR. They
 * were green because they fed the shape production never produced. This file
 * pins the missing half: that the hook actually derives that shape.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../../hooks/use-app-lock.ts', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('THE POINT: the path comes from useSegments, which keeps (group) segments', () => {
  assert.match(code, /useSegments\(\)/, 'must derive the path from useSegments()');
  assert.match(
    code,
    /const pathname = '\/' \+ segments\.join\('\/'\)/,
    'must rebuild the group-prefixed path',
  );
});

test('THE POINT: usePathname must never come back — it strips the groups', () => {
  assert.doesNotMatch(code, /usePathname/, 'usePathname strips (group); every guard here needs them');
});

test('expo-router really does strip groups — the assumption is checked, not assumed', () => {
  /*
   * If a future expo-router stopped stripping, usePathname would become
   * correct and this whole fix would look like noise. Pin the actual behaviour
   * of the INSTALLED version so that change is visible rather than silent.
   */
  const routeInfo = readFileSync(
    new URL('../../node_modules/expo-router/build/global-state/routeInfo.js', import.meta.url),
    'utf8',
  );
  assert.match(
    routeInfo,
    /filter\(\(segment\) => \{\s*return !\(segment\.startsWith\('\('\) && segment\.endsWith\('\)'\)\);/,
    'expo-router no longer strips (group) from pathname — re-check use-app-lock',
  );
});

test('the blocklist still names the routes we must never restore to', () => {
  // The loop was "restore to /sign-in". If these entries are dropped, the
  // fix above silently stops mattering.
  for (const route of ['/(security)/lock-screen', '/(auth)', '/(onboarding)']) {
    assert.ok(code.includes(`'${route}'`), `RESTORE_BLOCKLIST must still contain ${route}`);
  }
});

test('shouldRestore blocks auth/lock routes for the shape the hook now produces', () => {
  // Re-implement the predicate exactly as the source defines it, then feed it
  // the group-prefixed values useSegments now yields.
  const m = /const RESTORE_BLOCKLIST = \[([^\]]*)\]/.exec(code);
  assert.ok(m, 'could not read RESTORE_BLOCKLIST');
  const blocklist = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const shouldRestore = (p) => (!p ? false : !blocklist.some((b) => p.startsWith(b)));

  // The routes that caused the loop — all must now be refused.
  assert.equal(shouldRestore('/(auth)/sign-in'), false);
  assert.equal(shouldRestore('/(security)/lock-screen'), false);
  assert.equal(shouldRestore('/(onboarding)/permissions'), false);
  // A real destination still restores.
  assert.equal(shouldRestore('/Home'), true);

  // And the proof of the original bug: the stripped forms slip straight through.
  assert.equal(shouldRestore('/sign-in'), true, 'stripped form was the bug');
  assert.equal(shouldRestore('/lock-screen'), true, 'stripped form was the bug');
});
