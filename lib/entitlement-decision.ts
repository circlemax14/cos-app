/**
 * COS-727 — the two kinds of gate, and why one set of semantics cannot serve both.
 *
 * ─── THE PROBLEM ─────────────────────────────────────────────────────
 *
 * Today every gate fails OPEN: loading, error, missing field, empty array and
 * wildcard all render the content, and only an affirmative deny hides anything.
 * For CLINICAL gating that is unambiguously right, and hooks/use-entitlement.ts
 * argues it well: hiding a patient's own medication list because /v1/auth/me
 * timed out on a train is a safety problem that looks exactly like a correct
 * deny, so nobody would report it.
 *
 * That same rule cannot carry BILLING. Fail-open means the paywall is advisory:
 * force-quit the app, turn off wifi, relaunch, and every paid feature is free.
 * That is not a hypothetical here — the profile query is memory-only
 * (gcTime 10 min, no disk persistence), so a cold offline launch genuinely has
 * no entitlements at all.
 *
 * ─── THE FIX, AND WHAT IT IS NOT ─────────────────────────────────────
 *
 * The naive answer is "fail closed for paid features". That is also wrong, and
 * in a more expensive direction: it punishes exactly the people who paid. A
 * subscriber on a plane would watch the features they are paying for vanish,
 * and would reasonably ask for a refund. Falsely denying a paying customer
 * costs support time, refunds and a review; briefly granting a non-payer costs
 * a few cents of inference.
 *
 * So the paid gate is neither open nor closed by default — it REMEMBERS.
 *
 *   live entitlements present   → exact match, authoritative
 *   no live, cached present     → use the cache (a subscriber offline keeps
 *                                 what they paid for)
 *   neither                     → open, and say so, so the caller can decide
 *
 * The cache is written whenever a real array arrives, so the only window where
 * a paid feature is free is a device that has never once successfully loaded a
 * profile. That is a fresh install with no network — rare, self-correcting, and
 * far cheaper than the alternative.
 *
 * ─── EMPTY ARRAY IS NOT A DENY ───────────────────────────────────────
 *
 * An empty array reaches us when the resolver finds no plan assignment. That is
 * a PROVISIONING GAP — our bug, not a statement about the patient — so it stays
 * open in both modes. Paywalling someone because we failed to assign them a
 * plan would be indistinguishable, to them, from being robbed. Worth alerting
 * on server-side rather than enforcing client-side.
 *
 * This module is pure so the whole table can be tested without a renderer, a
 * network, or a device. See tests/unit/entitlement-decision.test.ts.
 */

/** Which rule set applies. Clinical never hides on uncertainty; paid remembers. */
export type GateMode = 'clinical' | 'paid';

/** Where the answer came from — surfaced so callers can log or explain. */
export type DecisionSource =
  | 'live'          // a fresh entitlements array from the API
  | 'cached'        // the last array we successfully saw on this device
  | 'wildcard'      // kill switch off, or SUPER_ADMIN
  | 'unprovisioned' // real response, but no plan assigned (empty array)
  | 'unknown';      // loading, error, or never fetched

export interface DecisionInput {
  mode: GateMode;
  /** Dotted catalog key, e.g. 'plan.current-conditions'. */
  key: string;
  /** Entitlements from the live query, if it has resolved. */
  live: readonly string[] | null | undefined;
  /** Last array persisted on this device, if any. */
  cached: readonly string[] | null | undefined;
  isLoading: boolean;
  isError: boolean;
}

export interface Decision {
  /** Render the thing? */
  allowed: boolean;
  source: DecisionSource;
  /**
   * True when `allowed` is a fallback rather than an authoritative answer.
   * A paid surface may want to show an upgrade prompt instead of silently
   * granting; a clinical one should ignore this entirely.
   */
  provisional: boolean;
}

const WILDCARD = '*';

function evaluate(list: readonly string[], key: string): boolean {
  if (list.includes(WILDCARD)) return true;
  return list.includes(key);
}

/** Non-empty, usable entitlement array? */
function usable(list: readonly string[] | null | undefined): list is readonly string[] {
  return Array.isArray(list) && list.length > 0;
}

/**
 * The whole decision table, in one pure function.
 *
 * Deliberately takes `isLoading`/`isError` rather than reading a hook, so every
 * branch below is reachable from a test.
 */
export function decideEntitlement(input: DecisionInput): Decision {
  const { mode, key, live, cached, isLoading, isError } = input;

  // ── Authoritative: a real live array ───────────────────────────────
  if (!isLoading && !isError && usable(live)) {
    if (live.includes(WILDCARD)) return { allowed: true, source: 'wildcard', provisional: false };
    return { allowed: evaluate(live, key), source: 'live', provisional: false };
  }

  // ── A real response with an EMPTY array: no plan assigned ──────────
  // Provisioning gap, not a decision. Open in both modes — see the header.
  if (!isLoading && !isError && Array.isArray(live) && live.length === 0) {
    return { allowed: true, source: 'unprovisioned', provisional: true };
  }

  // ── No live answer. Clinical never waits to find out. ──────────────
  if (mode === 'clinical') {
    return { allowed: true, source: 'unknown', provisional: true };
  }

  // ── Paid: fall back to what this device last knew. ─────────────────
  if (usable(cached)) {
    if (cached.includes(WILDCARD)) return { allowed: true, source: 'wildcard', provisional: true };
    return { allowed: evaluate(cached, key), source: 'cached', provisional: true };
  }

  // ── Paid, and we have never known anything. Open, deliberately. ────
  // A device that has never loaded a profile is a fresh install with no
  // network. Denying here would also deny a brand-new SUBSCRIBER, and that is
  // the more expensive mistake.
  return { allowed: true, source: 'unknown', provisional: true };
}

/**
 * Should this array be persisted as the device's last-known state?
 *
 * Only real, non-empty arrays. Persisting an empty array would cache a
 * provisioning gap and turn a transient server-side bug into a durable
 * client-side one — the cache would then confidently deny paid features long
 * after the gap was fixed.
 */
export function isPersistableEntitlements(
  list: readonly string[] | null | undefined,
): list is readonly string[] {
  return usable(list);
}
