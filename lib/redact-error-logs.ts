/**
 * Production-only wrapper for console.error that strips PHI from
 * Error / axios-shaped objects before logging.
 *
 * Why:
 *   - cos-app's production console silences log/warn/debug to keep PHI
 *     off device logs (see app/_layout.tsx). console.error is preserved
 *     because some crash-reporting paths hook into it.
 *   - But error objects from axios / fetch routinely carry the full
 *     response body in `error.response.data`, plus auth headers in
 *     `error.config.headers`. Those frequently contain patient names,
 *     DOB, MRN, FHIR resource fragments. Logging the raw error object
 *     persists PHI to local device logs.
 *   - We replace Error instances with `{ name, message }` and axios-
 *     shaped objects with a `{ kind, code?, message? }` stub. Primitives
 *     pass through unchanged.
 *
 * Security audit COS-331.
 */

export function redactErrorArg(a: unknown): unknown {
  if (a instanceof Error) {
    return { name: a.name, message: a.message };
  }
  if (
    a !== null &&
    typeof a === 'object' &&
    ('response' in a || 'config' in a || 'request' in a)
  ) {
    const stub: Record<string, unknown> = { kind: 'axios-error' };
    const code = (a as { code?: unknown }).code;
    const message = (a as { message?: unknown }).message;
    if (typeof code === 'string') stub.code = code;
    if (typeof message === 'string') stub.message = message;
    return stub;
  }
  return a;
}

/**
 * Install the wrapper. Idempotent — calling twice has no effect.
 * Returns the original console.error so the caller can restore it
 * (used in tests).
 */
let installed = false;
let original: ((...args: unknown[]) => void) | null = null;

export function installRedactedConsoleError(): (
  ...args: unknown[]
) => void {
  if (installed && original) return original;
  original = console.error.bind(console) as (...args: unknown[]) => void;
  installed = true;
  console.error = (...args: unknown[]): void => {
    original!(...args.map(redactErrorArg));
  };
  return original;
}
