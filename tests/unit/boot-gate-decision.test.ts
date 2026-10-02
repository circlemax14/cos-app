/**
 * COS-1226 — the boot gate's branches, and who lifts the native splash.
 *
 * Every one of these states shipped. None of them could be seen, because the
 * splash was held at module load in app/_layout.tsx and hidden only by
 * app/index.tsx — a route inside the Stack that PlanBootGate wraps. So the
 * loader and the retry screen were drawn underneath it.
 *
 * Two of these arms are one boolean away from a worse bug than the one they
 * fix, which is why the table is pure and tested here rather than pinned by
 * regexes over a component node cannot load:
 *
 *   • 'indeterminate' + a failure must NOT show "we couldn't load your
 *     account", because we never established that there IS an account to load.
 *   • an in-flight retry must NOT keep showing the error it is retrying.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideBootGate,
  splashHandover,
  type BootDecision,
  type BootGateState,
} from '../../lib/boot-gate-decision.ts';

/** Signed in, cache hydrated and empty, nothing answered yet: the first frame. */
const HOLDING: BootGateState = {
  presence: 'present',
  hasPlan: false,
  hasCachedPlan: false,
  cacheReady: true,
  mayUseCache: false,
  isError: false,
  isFetching: false,
  isLoading: false,
  timedOut: false,
};

const at = (over: Partial<BootGateState>) => decideBootGate({ ...HOLDING, ...over });

describe('COS-1226 — the splash is handed over on the HOLDING path, not only on success', () => {
  test('THE POINT: every decision that does not render the app hides the splash', () => {
    const held: BootDecision[] = ['loading', 'error'];
    for (const d of held) {
      assert.notEqual(
        splashHandover(d),
        'route',
        `${d} leaves the splash to app/index.tsx, which cannot run while the gate holds`,
      );
    }
  });

  test('the loader hands over on PAINT — a commit-time hide shows a bare frame', () => {
    assert.equal(splashHandover('loading'), 'paint');
  });

  test('the error screen hands over immediately — it has nothing to decode', () => {
    assert.equal(splashHandover('error'), 'now');
  });

  test('the healthy path is untouched: the first real screen still owns it', () => {
    assert.equal(splashHandover('app'), 'route');
  });
});

describe('COS-1226 — holding', () => {
  test('signed in with no answer yet holds the app', () => {
    assert.equal(at({}), 'loading');
  });

  test('a Keychain read that has not answered holds — it is not a sign-out', () => {
    assert.equal(at({ presence: null }), 'loading');
  });

  test('an unwoken Keychain holds rather than opening the app wide', () => {
    // COS-874 / COS-890: the whole reason `expectSession` had to be passed.
    assert.equal(at({ presence: 'indeterminate' }), 'loading');
  });

  test('the cache cannot answer before the fallback window', () => {
    assert.equal(at({ hasCachedPlan: true, mayUseCache: false }), 'loading');
  });

  test('a hydrating cache is not an empty cache', () => {
    assert.equal(at({ cacheReady: false, mayUseCache: true, hasCachedPlan: true }), 'loading');
  });
});

describe('COS-1226 — opening the app', () => {
  test('THE POINT: a signed-out patient is never held behind a plan fetch', () => {
    assert.equal(at({ presence: 'absent' }), 'app');
    assert.equal(at({ presence: 'absent', isLoading: true }), 'app');
    assert.equal(at({ presence: 'absent', isError: true, timedOut: true }), 'app');
  });

  test('a live answer opens immediately, with no artificial delay', () => {
    assert.equal(at({ hasPlan: true }), 'app');
    assert.equal(at({ hasPlan: true, isFetching: true }), 'app');
  });

  test('COS-1069: the cached map is a bounded fallback', () => {
    assert.equal(at({ mayUseCache: true, cacheReady: true, hasCachedPlan: true }), 'app');
  });

  test('a cached map beats an error — a patient on a train is not stranded', () => {
    assert.equal(
      at({ mayUseCache: true, cacheReady: true, hasCachedPlan: true, isError: true }),
      'app',
    );
  });

  test('settled with nothing to wait for renders rather than spinning forever', () => {
    assert.equal(at({ isLoading: false, cacheReady: true, mayUseCache: true }), 'app');
  });
});

describe('COS-1226 — failing', () => {
  test('a confirmed session that could not load its plan gets the retry screen', () => {
    assert.equal(at({ isError: true }), 'error');
    assert.equal(at({ timedOut: true }), 'error');
  });

  test('THE POINT: a retry in flight shows the loader, not the error it is retrying', () => {
    /*
     * react-query keeps status 'error' until the refetch resolves, so deciding
     * on `isError` alone meant tapping Retry changed nothing on screen — the
     * one thing a retry button must never do.
     */
    assert.equal(at({ isError: true, isFetching: true }), 'loading');
    assert.equal(at({ timedOut: true, isFetching: true }), 'loading');
  });

  test('THE POINT: a session we never confirmed is not told its account failed', () => {
    /*
     * Sign-out clears the cached profile but NOT the PIN, so a signed-out
     * device reads 'indeterminate' — and `expectSession` is what makes that
     * arm reachable. Holding such a person on "we couldn't load your account,
     * tap retry" forever, instead of handing them to the splash gate and its
     * sign-in / lock-screen routing, would be worse than the flash being fixed.
     */
    assert.equal(at({ presence: 'indeterminate', isError: true }), 'app');
    assert.equal(at({ presence: 'indeterminate', timedOut: true }), 'app');
  });
});
