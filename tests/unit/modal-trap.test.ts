/**
 * COS-1102 — the app must never open into a modal it cannot close.
 *
 * Reported 2026-09-24: the app reopened straight into the Supports modal, full
 * screen, with no way out.
 *
 * The chain, all six links verified in source:
 *   1. patient is on /modal when the app backgrounds
 *   2. use-app-lock saves '/modal' as the pre-lock route (it is not on
 *      RESTORE_BLOCKLIST)
 *   3. the app is killed
 *   4. on relaunch and unlock, resumeAfterUnlock replaces to the saved route
 *   5. replace on a fresh stack makes the modal the ONLY entry, so it fills
 *      the screen — a modal is drawn over something, and there is nothing
 *   6. its X calls router.back(), a no-op on a one-entry stack
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isRootModalRoute, restoreTarget, ROOT_MODAL_ROUTES } from '../../lib/root-modal-routes.ts';

describe('restoreTarget — stop creating the trap', () => {
  test('a modal is restored ON TOP of a base, never as the root', () => {
    assert.deepStrictEqual(restoreTarget('/modal'), { base: '/Home', push: '/modal' });
    assert.deepStrictEqual(restoreTarget('/appointments-modal'), {
      base: '/Home',
      push: '/appointments-modal',
    });
  });

  test('an ordinary route is restored as-is', () => {
    // The feature's whole point is landing back where you were. Only modals
    // need the extra entry underneath.
    assert.deepStrictEqual(restoreTarget('/Home/reports'), { base: '/Home/reports' });
    assert.deepStrictEqual(restoreTarget('/Home'), { base: '/Home' });
  });

  test('matches a modal carrying params, not just the bare path', () => {
    assert.ok(isRootModalRoute('/calendar-event-detail?id=abc'));
    assert.ok(isRootModalRoute('/modal'));
  });

  test('does not match a route that merely starts with the same letters', () => {
    // '/modal-history' is not '/modal'. A loose startsWith would send it
    // through the modal path and push it over a Home it does not want.
    assert.ok(!isRootModalRoute('/modal-history'));
    assert.ok(!isRootModalRoute('/Home'));
    assert.ok(!isRootModalRoute(null));
  });
});

describe('dismissTo — survive the trap if anything else creates it', () => {
  test('every root-level modal dismisses through the guarded helper', () => {
    /*
     * Two independent fixes on purpose. restoreTarget stops this cause;
     * dismissTo covers the next one. A notification tap, a deep link or a
     * future replace can all leave a modal as the only entry, and none of them
     * go anywhere near the lock screen.
     */
    for (const f of [
      'app/modal.tsx',
      'app/appointments-modal.tsx',
      'app/calendar-event-detail.tsx',
      'app/calendar-event-editor.tsx',
      'app/jenny-schedule.tsx',
    ]) {
      const src = readFileSync(f, 'utf8');
      assert.ok(!/router\.back\(\)/.test(src), `${f} must not call router.back() unguarded`);
      assert.ok(/dismissTo\(/.test(src), `${f} must dismiss through dismissTo`);
    }
  });

  test('the helper checks canGoBack and falls back with REPLACE', () => {
    const src = readFileSync('lib/dismiss-to.ts', 'utf8');
    assert.ok(/router\.canGoBack\(\)/.test(src), 'it must ask before going back');
    assert.ok(/router\.replace\(/.test(src), 'the fallback must replace');
    // A push would leave the modal on the stack with Home under it — the
    // patient would still be looking at the thing they tried to close.
    assert.ok(!/router\.push\(/.test(src), 'the fallback must not push');
  });

  test('the list of root modals covers every sibling of /Home that is one', () => {
    assert.deepStrictEqual([...ROOT_MODAL_ROUTES].sort(), [
      '/appointments-modal',
      '/calendar-event-detail',
      '/calendar-event-editor',
      '/jenny-schedule',
      '/modal',
    ]);
  });
});
