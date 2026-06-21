import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, TimeoutError } from '../../lib/with-timeout.ts';

const defer = <T>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const rejectAfter = (err: Error, ms: number) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(err), ms));

test('resolves with the inner value when inner settles before the timeout', async () => {
  const result = await withTimeout(defer('ok', 5), 200);
  assert.equal(result, 'ok');
});

test('rejects with TimeoutError when inner exceeds the timeout', async () => {
  await assert.rejects(
    () => withTimeout(defer('too-late', 100), 10, 'refresh timed out'),
    (err: unknown) => {
      assert.ok(err instanceof TimeoutError);
      // name must NOT be an auth-rejection name, so the interceptor treats it
      // as transient and preserves the session (the whole point of COS-351).
      assert.equal((err as Error).name, 'TimeoutError');
      assert.notEqual((err as Error).name, 'NotAuthorizedException');
      return true;
    },
  );
});

test('propagates a non-timeout inner rejection unchanged', async () => {
  const boom = new Error('network down');
  await assert.rejects(
    () => withTimeout(rejectAfter(boom, 5), 200),
    (err: unknown) => err === boom,
  );
});

test('does not double-settle: a fast resolve wins, late timer is a no-op', async () => {
  // If the timer fired after resolution this would throw "resolve after
  // settle"; we just assert it resolves cleanly and stays resolved.
  const result = await withTimeout(defer(42, 1), 50);
  assert.equal(result, 42);
  await defer(null, 60); // let the (cleared) timer window pass — no crash
});
