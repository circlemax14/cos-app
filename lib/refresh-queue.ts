/**
 * COS-362: pending-request settle helpers for the api-client's 401 → token-
 * refresh path.
 *
 * Pure + framework-free (no axios / RN / expo imports) so the one invariant
 * that matters is unit-testable: EVERY queued waiter is settled exactly once.
 * The impure part — re-issuing the original axios request with the fresh
 * token — is injected as the `retry` callback, so this module stays testable
 * under the repo's `node --test` runner (see tests/unit/refresh-queue.test.ts).
 *
 * THE BUG THIS FIXES (build 57, "stuck on Health Plan after unlock"):
 * while a refresh was in flight, concurrent 401s were parked in a queue. When
 * the refresh SUCCEEDED, each waiter was settled only `if (originalRequest)`.
 * A waiter whose request had no `config` (originalRequest undefined) settled
 * NEITHER resolve nor reject — its promise hung forever, wedging the caller's
 * `Promise.all` and leaving the screen spinning indefinitely. Health Plan was
 * worst-hit because it fans out the most simultaneous first-requests on
 * resume, so it was the most likely to pile multiple 401s into the queue.
 *
 * (The symmetric reject-on-refresh-FAILURE dangle was already fixed in
 * SCRUM-279; this module closes the resolve-on-SUCCESS dangle they missed and
 * keeps both fan-outs in one tested place.)
 *
 * INVARIANT: for every waiter passed to a settle helper, exactly one of its
 * resolve/reject is called — on success via retry() (or reject when there is
 * no request to retry), on failure via reject. No waiter can dangle.
 */

export interface QueuedWaiter {
  /** Resolve the parked request's outer promise (adopts the retry result). */
  resolve: (value: unknown) => void;
  /** Reject the parked request's outer promise. */
  reject: (err: Error) => void;
  /**
   * Re-issue the original request with the fresh token, returning the retry
   * promise — or `null` when the failed request had no `config` to retry.
   * When `null`, the waiter is REJECTED rather than left hanging. That is the
   * COS-362 fix.
   */
  retry: ((token: string) => Promise<unknown>) | null;
}

/** Message used when a parked request cannot be retried (no request config). */
export const NO_RETRY_MESSAGE =
  'Request could not be retried after token refresh (no request config)';

/**
 * Settle every waiter after a SUCCESSFUL refresh. A waiter with a `retry`
 * re-issues its request with the new token and adopts that promise's outcome;
 * a waiter with no `retry` is rejected so it can never hang.
 *
 * Callers pass a snapshot of the queue (and clear the live queue first) so a
 * waiter re-queued by a retry lands in the next cycle, not this one.
 */
export function settleWaitersWithToken(waiters: QueuedWaiter[], token: string): void {
  for (const w of waiters) {
    if (w.retry) {
      // Adopt the retried request's outcome: resolve on success, reject on
      // failure. Equivalent to the previous `resolve(apiClient(req))`.
      w.retry(token).then(w.resolve, w.reject);
    } else {
      w.reject(new Error(NO_RETRY_MESSAGE));
    }
  }
}

/**
 * Settle every waiter after a FAILED refresh — all rejected with the refresh
 * error (transient or genuine auth rejection). Mirrors the SCRUM-279 reject
 * fan-out; centralised here so success and failure share one tested path.
 */
export function settleWaitersWithError(waiters: QueuedWaiter[], error: Error): void {
  for (const w of waiters) {
    w.reject(error);
  }
}
