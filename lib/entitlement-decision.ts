/**
 * COS-727 — what a gate does when it does not have a live answer.
 *
 * ─── THE MODEL ───────────────────────────────────────────────────────
 *
 * Pricing lives on the PLAN. A plan carries a price and a set of permission
 * keys, and a patient holds one plan. So "is this feature paid?" is not a
 * property of the feature — it is answered by whether the patient's plan
 * contains the key. A gate therefore never needs to know whether what it is
 * guarding is billable, and no call site has to choose between two hooks.
 *
 * ─── THE PROBLEM ─────────────────────────────────────────────────────
 *
 * Every gate used to fail OPEN: loading, error, missing field and empty array
 * all rendered the content, and only an affirmative deny hid anything. The
 * reasoning was clinical and it was sound — hiding a patient's own medication
 * list because /v1/auth/me timed out on a train is a safety problem that looks
 * identical to a correct deny, so nobody would ever report it.
 *
 * But that rule cannot carry billing. Under it the paywall is advisory: the
 * profile query is memory-only (gcTime 10 min, nothing on disk), so a cold
 * offline launch has no entitlements at all. Force-quit, airplane mode,
 * relaunch, everything free.
 *
 * ─── THE RESOLUTION ──────────────────────────────────────────────────
 *
 * "Fail closed for paid features" is the obvious fix and it is worse: it
 * punishes exactly the people who paid. A subscriber on a plane watches what
 * they bought disappear and asks for a refund. Falsely denying a payer costs
 * support, a refund and a review; briefly granting a non-payer costs pennies.
 *
 * So the gate REMEMBERS instead:
 *
 *   live array      → authoritative, exact match
 *   no live, cached → the device's last-known array
 *   neither         → open, and say so
 *
 * That single rule serves the clinical case too, which is why there are not two
 * of them. An entitled patient's cached array says granted, so their data
 * survives the timeout; the only thing a cached deny hides is something they
 * genuinely do not have. The clinical worry was never about hiding things
 * people lack — it was about hiding things they HAVE because we could not
 * confirm it, and the cache is precisely that confirmation.
 *
 * ─── EMPTY ARRAY IS NOT A DENY ───────────────────────────────────────
 *
 * An empty array reaches us when the resolver finds no plan assignment. That is
 * a PROVISIONING GAP — our bug, not a statement about the patient — so it stays
 * open and is flagged provisional. Paywalling someone because we failed to
 * assign them a plan would be indistinguishable, to them, from being robbed.
 * Alert on it server-side rather than enforcing it client-side.
 *
 * This module is pure so the whole table can be tested without a renderer, a
 * network, or a device. See tests/unit/entitlement-decision.test.ts.
 */

/**
 * Which rule set applies.
 *
 * `standard` is the answer for essentially every screen. It is named for what it
 * DOES rather than for a category of feature, because "is this paid?" is not a
 * property of a feature at all — it is answered by whether the patient's PLAN
 * contains the key, and the plan is where pricing lives. A gate therefore never
 * needs to know whether it is guarding something billable.
 *
 * `safety-critical` is a deliberate escape hatch, not the other half of a pair.
 * Use it only where showing something the patient has not been granted is
 * clearly better than hiding it during uncertainty — allergies and emergency
 * contacts are the shape of it. Everything else, including every clinical
 * screen, wants `standard`: an entitled patient's cached array says granted, so
 * their data survives a timeout anyway.
 */
export type GateMode = 'standard' | 'safety-critical';

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

  // ── No live answer. Safety-critical surfaces never wait to find out. ──
  if (mode === 'safety-critical') {
    return { allowed: true, source: 'unknown', provisional: true };
  }

  // ── Standard: fall back to what this device last knew. ─────────────
  if (usable(cached)) {
    if (cached.includes(WILDCARD)) return { allowed: true, source: 'wildcard', provisional: true };
    return { allowed: evaluate(cached, key), source: 'cached', provisional: true };
  }

  // ── Nothing has ever been known. Open, deliberately. ───────────────
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
