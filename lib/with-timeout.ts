/**
 * Wrap a promise with a timeout.
 *
 * If `inner` doesn't settle within `ms`, the returned promise rejects with a
 * `TimeoutError` whose `name` is deliberately NOT one of the auth-rejection
 * names the api-client refresh interceptor checks for
 * (NotAuthorizedException / UserNotFoundException / InvalidGrantException).
 * That way a timeout is classified as a TRANSIENT failure and the session is
 * preserved — never force-signed-out.
 *
 * Why this exists (COS-351): amazon-cognito-identity-js `refreshSession()`
 * has no built-in timeout. It is awaited inside the api-client's refresh
 * critical section while `isRefreshing` is held. On a flaky network right
 * after the app resumes from background, that call could hang indefinitely —
 * its `finally` never ran, so `isRefreshing` stayed `true` forever, every
 * queued 401 hung behind it, and the app froze on resume / after PIN entry.
 * Bounding the call guarantees the critical section always settles and the
 * mutex always releases.
 */
export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(inner: Promise<T>, ms: number, message?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError(message));
    }, ms);

    inner.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
