import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryAsync, isTransientApiError } from '../../lib/retry-async.ts';

// COS-366 regression suite. The bug: a single throttled launch request (HTTP
// 429 from the Lambda concurrency ceiling) blanked the circle of providers
// because the client never retried. retryAsync turns a transient throttle into
// a brief delay. Tests inject a no-op sleep so they're deterministic + fast.

const noSleep = async (): Promise<void> => {};

/** An axios-style error carrying an HTTP status. */
function httpError(status: number): Error & { response: { status: number } } {
  const e = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  e.response = { status };
  return e;
}

test('succeeds on the first attempt → fn called once, no retry', async () => {
  let calls = 0;
  const out = await retryAsync(async () => {
    calls += 1;
    return 'ok';
  }, { sleep: noSleep });
  assert.equal(out, 'ok');
  assert.equal(calls, 1);
});

test('retries a transient 429 and succeeds on the 2nd attempt', async () => {
  let calls = 0;
  let slept = 0;
  const out = await retryAsync(
    async () => {
      calls += 1;
      if (calls === 1) throw httpError(429);
      return 'recovered';
    },
    { sleep: async () => { slept += 1; } },
  );
  assert.equal(out, 'recovered');
  assert.equal(calls, 2);
  assert.equal(slept, 1); // one backoff between the two attempts
});

test('gives up after `attempts` on a persistent transient error, throwing the last error', async () => {
  let calls = 0;
  await assert.rejects(
    retryAsync(async () => { calls += 1; throw httpError(503); }, { attempts: 3, sleep: noSleep }),
    (e: Error & { response?: { status?: number } }) => e.response?.status === 503,
  );
  assert.equal(calls, 3); // exactly `attempts` tries, no more
});

test('does NOT retry a non-transient 4xx (e.g. 404) → fn called once', async () => {
  let calls = 0;
  await assert.rejects(
    retryAsync(async () => { calls += 1; throw httpError(404); }, { attempts: 5, sleep: noSleep }),
    (e: Error & { response?: { status?: number } }) => e.response?.status === 404,
  );
  assert.equal(calls, 1); // 404 won't change on retry — fail fast
});

test('treats a no-response (network/timeout) error as transient and retries', async () => {
  let calls = 0;
  const out = await retryAsync(
    async () => {
      calls += 1;
      if (calls < 2) throw new Error('Network request failed'); // no .response
      return 'ok';
    },
    { sleep: noSleep },
  );
  assert.equal(out, 'ok');
  assert.equal(calls, 2);
});

test('respects a custom shouldRetry predicate', async () => {
  let calls = 0;
  await assert.rejects(
    retryAsync(async () => { calls += 1; throw httpError(503); }, {
      attempts: 4,
      sleep: noSleep,
      shouldRetry: () => false, // never retry
    }),
  );
  assert.equal(calls, 1);
});

test('isTransientApiError classification', () => {
  assert.equal(isTransientApiError(httpError(429)), true);
  assert.equal(isTransientApiError(httpError(500)), true);
  assert.equal(isTransientApiError(httpError(503)), true);
  assert.equal(isTransientApiError(new Error('network')), true); // no response
  assert.equal(isTransientApiError(httpError(404)), false);
  assert.equal(isTransientApiError(httpError(401)), false);
  assert.equal(isTransientApiError(httpError(403)), false);
  assert.equal(isTransientApiError(httpError(400)), false);
});
