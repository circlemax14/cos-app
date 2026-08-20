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

import React from 'react';
import { useUser } from './use-user';
import {
  decideEntitlement,
  type Decision,
} from '@/lib/entitlement-decision';
import {
  hydrateEntitlementCache,
  persistEntitlements,
  readCachedEntitlements,
} from '@/lib/entitlement-cache';

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

/**
 * COS-727 — the gate for anything a patient PAYS for.
 *
 * `useCanRender` above is the clinical gate and must stay fail-open: hiding
 * someone's own medication list because a request timed out is a safety problem
 * that looks exactly like a correct deny. That rule cannot carry billing
 * though — under it the paywall is advisory, because the profile query is
 * memory-only and a cold offline launch has no entitlements at all. Force-quit,
 * airplane mode, relaunch, everything free.
 *
 * So this gate REMEMBERS rather than failing open or closed:
 *
 *   live array      → authoritative, exact match
 *   offline/error   → the device's last-known array, so a subscriber keeps what
 *                     they paid for and a non-subscriber does not gain anything
 *   never known     → open, deliberately — a fresh install with no network is
 *                     also how a brand-new subscriber arrives, and falsely
 *                     denying them is the more expensive mistake
 *
 * An EMPTY array is a provisioning gap, not a deny, and stays open in both
 * modes. Alert on that server-side rather than paywalling someone for our bug.
 *
 * NOT A SECURITY BOUNDARY — see lib/entitlement-cache.ts. Anything that costs
 * real money must also be checked server-side.
 *
 *   const { allowed, provisional } = usePaidFeature('nutrition-plan.view');
 *   if (!allowed) return <UpgradePrompt />;
 *
 * `provisional` marks a fallback answer, so a surface can prompt to reconnect
 * instead of silently granting. An authoritative deny is never provisional.
 */
export function usePaidFeature(dottedKey: string): Decision {
  const { data, isLoading, isError } = useUser();
  const live = data?.entitlements;

  // Pull the last-known array off disk once per launch. The render below reads
  // the synchronous view, which is null until this lands — and null reads as
  // "unknown", which is the safe state to be in meanwhile.
  React.useEffect(() => {
    void hydrateEntitlementCache();
  }, []);

  // Whenever a real array arrives, it becomes the new last-known state.
  // Guarded inside persistEntitlements: empty arrays are never stored, and an
  // unchanged array is not rewritten on every five-minute refetch.
  React.useEffect(() => {
    persistEntitlements(live);
  }, [live]);

  return decideEntitlement({
    mode: 'paid',
    key: dottedKey,
    live,
    cached: readCachedEntitlements(),
    isLoading,
    isError,
  });
}

/** Boolean form, for call sites that do not need the reason. */
export function useCanAccessPaid(dottedKey: string): boolean {
  return usePaidFeature(dottedKey).allowed;
}
