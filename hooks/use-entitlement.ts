/**
 * Entitlement gates for screens and screen PARTS.
 *
 * ─── ONE GATE, NO CHOICE TO MAKE ─────────────────────────────────────
 *
 * Pricing lives on the PLAN: a plan carries a price and a set of permission
 * keys, and a patient holds one plan. So "is this feature paid?" is not a
 * property of the feature — it is answered by whether the patient's plan
 * contains the key. A call site therefore never picks between a clinical gate
 * and a billing gate. Use `useCanRender` everywhere.
 *
 * ─── WHAT CHANGED, AND WHY (COS-727) ─────────────────────────────────
 *
 * This gate used to be `decision !== 'denied'` — fail-open on loading, error,
 * absent field and empty array. The clinical reasoning was sound: hiding a
 * patient's own medication list because /v1/auth/me timed out on a train is a
 * safety problem that looks identical to a correct deny, so nobody reports it.
 *
 * But that rule cannot carry billing. The profile query is memory-only (gcTime
 * 10 min, nothing on disk), so a cold offline launch has no entitlements at
 * all — force-quit, airplane mode, relaunch, and every gate opens.
 *
 * The rule now REMEMBERS: live answer, else the device's last-known array, else
 * open. One rule serves both concerns, because an entitled patient's cached
 * array says granted — their data survives the timeout — while a cached deny
 * only hides what they genuinely do not have. The clinical worry was never
 * about hiding what people lack; it was about hiding what they HAVE because we
 * could not confirm it, and the cache is that confirmation.
 *
 * The decision table itself is pure and lives in lib/entitlement-decision.ts,
 * where every branch is tested without a renderer or a device.
 *
 * ─── STILL TRUE ──────────────────────────────────────────────────────
 *
 * Nothing is ever hidden on an unknown. An empty array is a provisioning gap,
 * not a deny. And once a real, non-empty array arrives, every key not in it is
 * DENIED — which is what makes back-filling plans a prerequisite for shipping
 * any new gate (see cos-backend/scripts/backfill-split-entitlement-keys.ts).
 */

import React from 'react';
import { useUser } from './use-user';
import {
  decideEntitlement,
  type Decision,
  type GateMode,
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
 * COS-727 — the reasoned form of the gate, for callers that want to explain
 * rather than silently hide.
 *
 * `source` says where the answer came from and `provisional` marks a fallback,
 * so an upgrade surface can prompt to reconnect instead of quietly granting.
 * An authoritative deny is never provisional, so a prompt cannot fire on a
 * legitimate denial.
 */
export function useEntitlement(dottedKey: string, mode: GateMode = 'standard'): Decision {
  const { data, isLoading, isError } = useUser();
  const live = data?.entitlements;

  // Pull the last-known array off disk once per launch. The decision below reads
  // the synchronous view, which is null until this lands — and null reads as
  // "unknown", which is the safe state to be in meanwhile.
  React.useEffect(() => {
    void hydrateEntitlementCache();
  }, []);

  // Whenever a real array arrives it becomes the new last-known state. Guarded
  // inside persistEntitlements: empty arrays are never stored, and an unchanged
  // array is not rewritten on every five-minute refetch.
  React.useEffect(() => {
    persistEntitlements(live);
  }, [live]);

  return decideEntitlement({
    mode,
    key: dottedKey,
    live,
    cached: readCachedEntitlements(),
    isLoading,
    isError,
  });
}

/**
 * The gate every screen should use.
 *
 *   const canLabs = useCanRender('plan.labs-by-condition');
 *   ...
 *   {canLabs && <LabsByConditionSection />}
 *
 * Call it unconditionally at the TOP of the component, above every early
 * return — it is a hook.
 *
 * There is deliberately no paid/clinical variant to choose between. Pricing
 * lives on the plan, so whether this key is billable is already answered by
 * whether the patient's plan contains it. See lib/entitlement-decision.ts.
 */
export function useCanRender(dottedKey: string): boolean {
  return useEntitlement(dottedKey).allowed;
}

/**
 * Escape hatch for surfaces where showing something the patient was not granted
 * is clearly better than hiding it during uncertainty — allergies and emergency
 * contacts are the shape of it.
 *
 * NOT the other half of a pair. Reach for this only with a specific reason;
 * ordinary clinical screens want `useCanRender`, because an entitled patient's
 * cached array already says granted and their data survives a timeout anyway.
 */
export function useCanRenderSafetyCritical(dottedKey: string): boolean {
  return useEntitlement(dottedKey, 'safety-critical').allowed;
}

/**
 * COS-735 — for surfaces that must appear ONLY on an affirmative, live grant.
 *
 * The opposite end of the scale from useCanRenderSafetyCritical, and it exists
 * for one specific shape: an internal or diagnostic surface that is OFF for
 * everyone by default and switched on for named individuals.
 *
 * `useCanRender` is wrong for those. It is fail-open by design, and it treats
 * the WILDCARD as a grant — which is exactly what the resolver returns for
 * every patient on a stage where `plan_tier_enabled` is unset (today: staging
 * and production). Gating the About screen with it would put build, runtime and
 * OTA details in front of every patient the moment it shipped.
 *
 * So this accepts nothing but a real, populated entitlement array that names
 * the key. Loading, error, missing field, empty array, cached, wildcard — all
 * false. Hiding a diagnostic screen from someone who should see it costs a
 * support message; showing it to everyone is a leak.
 *
 * Do NOT reach for this to gate clinical content. The fail-open reasoning in
 * this file's header applies there and has not changed.
 */
export function useHasExplicitGrant(dottedKey: string): boolean {
  const { source, allowed } = useEntitlement(dottedKey);
  return source === 'live' && allowed;
}
