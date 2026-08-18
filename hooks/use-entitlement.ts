/**
 * Entitlement gates for screens and screen PARTS.
 *
 * ─── WHY NOT JUST USE useCan() ───────────────────────────────────────
 *
 * `useCan` (hooks/use-user.ts:62) is correct and is the underlying source of
 * truth. What it cannot express is WHY something is false, and at a gate that
 * distinction is the whole safety story:
 *
 *   const { data } = useUser();
 *   const ents = data?.entitlements;
 *   if (!ents || ents.length === 0) return true;   // ← unknown, or genuinely empty
 *   if (ents.includes('*')) return true;           // ← kill switch / super-admin
 *   return ents.includes(dottedKey);               // ← EXACT MATCH, closed
 *
 * The last line is the one to respect. Once a patient has a real, non-empty
 * entitlement array, every key not in it is DENIED. So the day
 * PLAN_TIER_ENABLED flips on, any key a plan does not list disappears — and a
 * plan written before that key existed cannot list it. That is not a bug in
 * useCan; it is what makes back-filling plans a prerequisite for shipping any
 * new gate (see cos-backend/scripts/backfill-split-entitlement-keys.ts).
 *
 * ─── THE RULE THIS FILE ENFORCES ─────────────────────────────────────
 *
 * A gate may hide something ONLY on an affirmative deny. Every other state —
 * still loading, request failed, user not hydrated, entitlements absent,
 * wildcard — renders the content.
 *
 * This is deliberately asymmetric, because the two failure modes are not
 * equally bad. Showing a patient a section they were not meant to see is a
 * billing discrepancy someone reconciles later. HIDING a patient's own
 * medication list or lab results because /v1/auth/me timed out on a train is
 * a clinical-safety problem, and it looks identical to a correct deny, so
 * nobody would ever report it as a bug.
 *
 * Fail open. Always.
 */

import { useUser } from './use-user';

export type EntitlementDecision =
  /** Affirmatively allowed: the key is present, or the wildcard is. */
  | 'granted'
  /** Affirmatively denied: a real entitlement set exists and omits this key. */
  | 'denied'
  /** Not known yet, or not knowable: loading, error, or no entitlements field. */
  | 'unknown';

/**
 * The three-state decision, for callers that need to tell "denied" from
 * "we could not find out" — analytics, debug screens, or a future UI that
 * wants to explain an upgrade path rather than silently hide something.
 *
 * Rendering code should prefer `useCanRender` below.
 */
export function useEntitlementDecision(dottedKey: string): EntitlementDecision {
  const { data, isLoading, isError } = useUser();

  // Still fetching, or the fetch failed. We know nothing.
  if (isLoading || isError) return 'unknown';

  const ents = data?.entitlements;

  // Field absent entirely — an older backend, or the resolver's kill switch
  // shape. Not a statement about this patient.
  if (!ents) return 'unknown';

  // An empty array reaches us from the resolver for a patient with no plan
  // assignment at all. That is a gap in provisioning, not an entitlement
  // decision, and treating it as a deny would blank the app for anyone who
  // slipped through onboarding.
  if (ents.length === 0) return 'unknown';

  // Kill switch OFF / SUPER_ADMIN — the resolver's "everything" sentinel.
  if (ents.includes('*')) return 'granted';

  return ents.includes(dottedKey) ? 'granted' : 'denied';
}

/**
 * The gate every call site should use. Boolean, and fail-open by construction:
 * it returns false ONLY for an affirmative 'denied'.
 *
 *   const canLabs = useCanRender('plan.labs-by-condition');
 *   ...
 *   {canLabs && <LabsByConditionSection />}
 *
 * Call it unconditionally at the TOP of the component, above every early
 * return — it is a hook, and this screen returns early on both loading and
 * error.
 */
export function useCanRender(dottedKey: string): boolean {
  return useEntitlementDecision(dottedKey) !== 'denied';
}
