/**
 * COS-366 / SCRUM-509: bounded retry-with-backoff for transient API failures.
 *
 * WHY: the app fires a burst of ~8 parallel requests on launch. The AWS Lambda
 * account concurrency ceiling (currently 10) throttles some of them (HTTP 429 /
 * dropped connection), and UI that treats "request failed" the same as "no
 * data" then renders blank — most visibly the circle of providers, which loads
 * /v1/auth/selected-providers on cold launch and showed an empty ring whenever
 * that one request was throttled. These throttles are TRANSIENT (the
 * concurrency frees up within a second or two), so a short bounded retry turns
 * a blank screen into a brief delay.
 *
 * Pure + framework-free (sleep is injectable) so it is unit-testable under the
 * repo's `node --test` runner — same pattern as lib/with-timeout.ts and
 * lib/refresh-queue.ts. Retries ONLY transient errors and is bounded, so the
 * worst case is a failing request settling ~1s later than before — no contract
 * or UX change on the success path.
 */

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 400;
const DEFAULT_MAX_DELAY_MS = 4_000;

export interface RetryOptions {
  /** Total attempts including the first (default 3). */
  attempts?: number;
  /** Base backoff ms; delay = baseDelayMs * 2^(attempt-1), capped at maxDelayMs. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide whether an error is worth retrying. Default: isTransientApiError. */
  shouldRetry?: (err: unknown) => boolean;
  /** Injectable sleep (default real setTimeout); tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP status of an axios-style error, if present. */
function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const resp = (err as { response?: unknown }).response;
    if (resp && typeof resp === 'object') {
      const s = (resp as { status?: unknown }).status;
      if (typeof s === 'number') return s;
    }
  }
  return undefined;
}

/**
 * Transient = worth retrying: no HTTP response at all (network/timeout/dropped),
 * HTTP 429 (throttled), or any 5xx. A 4xx other than 429 (401/403/404/422…) is
 * NOT retried — it won't change on a retry and auth (401) is handled by the
 * api-client interceptor.
 */
export function isTransientApiError(err: unknown): boolean {
  const s = statusOf(err);
  if (s === undefined) return true; // network / timeout / dropped connection
  if (s === 429) return true; // throttled (Lambda concurrency / HealthLake)
  return s >= 500 && s <= 599; // server error
}

/**
 * Run `fn`, retrying on transient failures with exponential backoff. Resolves
 * with the first success; rejects with the last error once attempts are
 * exhausted or a non-retryable error is hit. The first attempt is immediate.
 */
export async function retryAsync<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.floor(opts.attempts ?? DEFAULT_ATTEMPTS));
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? isTransientApiError;
  const sleep = opts.sleep ?? realSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  // Unreachable — the loop always returns or throws — but satisfies the type.
  throw lastErr;
}
