import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  settleWaitersWithToken,
  settleWaitersWithError,
  NO_RETRY_MESSAGE,
  type QueuedWaiter,
} from '../../lib/refresh-queue.ts';

// COS-362 regression suite for the api-client 401→refresh queue. The invariant
// under test is the one that broke build 57 ("stuck on Health Plan after
// unlock"): EVERY parked waiter must settle exactly once. A waiter that never
// settles would hang the caller's Promise.all and spin the screen forever — so
// here a hang shows up as a test TIMEOUT, and "settled" is proven by the
// awaited promise resolving/rejecting.

/** Build a waiter backed by a real promise, counting how many times it settles. */
function makeWaiter(retry: QueuedWaiter['retry']) {
  let resolveFn!: (v: unknown) => void;
  let rejectFn!: (e: Error) => void;
  let settles = 0;
  const promise = new Promise<unknown>((res, rej) => {
    resolveFn = (v) => {
      settles += 1;
      res(v);
    };
    rejectFn = (e) => {
      settles += 1;
      rej(e);
    };
  });
  const waiter: QueuedWaiter = { resolve: resolveFn, reject: rejectFn, retry };
  return { waiter, promise, settles: () => settles };
}

test('success: a waiter WITH a retry re-issues with the new token and resolves with the retry result', async () => {
  let sawToken: string | null = null;
  const { waiter, promise } = makeWaiter(async (token) => {
    sawToken = token;
    return { ok: true };
  });
  settleWaitersWithToken([waiter], 'NEW_TOKEN');
  const value = await promise;
  assert.equal(sawToken, 'NEW_TOKEN');
  assert.deepEqual(value, { ok: true });
});

test('BUG FIX: on refresh SUCCESS, a waiter with NO retry (undefined request config) REJECTS instead of hanging forever', async () => {
  const { waiter, promise } = makeWaiter(null);
  settleWaitersWithToken([waiter], 'NEW_TOKEN');
  // If the waiter dangled (the build-57 bug) this await would never resolve and
  // the test would time out. It must reject deterministically.
  await assert.rejects(promise, (err: Error) => {
    assert.equal(err.message, NO_RETRY_MESSAGE);
    return true;
  });
});

test('two concurrent 401s, refresh succeeds with one undefined config → first resolves, second rejects, BOTH settle', async () => {
  const a = makeWaiter(async () => 'A-RETRIED');
  const b = makeWaiter(null); // the request whose error.config was undefined
  settleWaitersWithToken([a.waiter, b.waiter], 'T');
  const [aRes, bRes] = await Promise.allSettled([a.promise, b.promise]);
  assert.equal(aRes.status, 'fulfilled');
  assert.equal((aRes as PromiseFulfilledResult<unknown>).value, 'A-RETRIED');
  assert.equal(bRes.status, 'rejected');
  assert.equal(a.settles(), 1);
  assert.equal(b.settles(), 1);
});

test('success: a retry that itself rejects propagates that rejection to the waiter', async () => {
  const boom = new Error('retried request failed');
  const { waiter, promise } = makeWaiter(async () => {
    throw boom;
  });
  settleWaitersWithToken([waiter], 'T');
  await assert.rejects(promise, (e) => e === boom);
});

test('failure (refresh threw transient): every queued waiter rejects with the refresh error', async () => {
  const err = new Error('Network request timed out');
  const a = makeWaiter(async () => 'should-not-run');
  const b = makeWaiter(null);
  settleWaitersWithError([a.waiter, b.waiter], err);
  const results = await Promise.allSettled([a.promise, b.promise]);
  for (const r of results) {
    assert.equal(r.status, 'rejected');
    assert.equal((r as PromiseRejectedResult).reason, err);
  }
  assert.equal(a.settles(), 1);
  assert.equal(b.settles(), 1);
});

test('exactly-once: a successful retry settles the waiter exactly once', async () => {
  const w = makeWaiter(async () => 'v');
  settleWaitersWithToken([w.waiter], 'T');
  await w.promise;
  await Promise.resolve(); // flush microtasks
  assert.equal(w.settles(), 1);
});

test('empty queue is a no-op (never throws)', () => {
  assert.doesNotThrow(() => settleWaitersWithToken([], 'T'));
  assert.doesNotThrow(() => settleWaitersWithError([], new Error('x')));
});
