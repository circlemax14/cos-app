/**
 * COS-799 — show what the server actually said.
 *
 * The backend refuses with real sentences written for patients:
 *
 *   "You have an active paid subscription. Cancel it first — your plan stays
 *    until the end of the period you have paid for."
 *   "That plan is not available to you."
 *
 * An axios rejection's `.message` is "Request failed with status code 409".
 * So `err instanceof Error ? err.message : fallback` — which is what every
 * one of these handlers was doing — throws away the only useful part of the
 * response and shows the patient a status code instead of the reason.
 *
 * Deliberately does NOT surface a 500's body. A server error message is for
 * us, not for a patient, and may carry internals; those get the fallback.
 */
export function serverMessage(err: unknown, fallback: string): string {
  const res = (err as { response?: { status?: number; data?: { error?: unknown } } })?.response;
  const status = res?.status;
  // 4xx only: the server refused for a reason it wrote down for this reader.
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const message = res?.data?.error;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
