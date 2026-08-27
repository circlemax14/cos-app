/**
 * COS-784 — the plan shelf, patient side.
 *
 * The dashboard has had a full plan editor since COS-768 — price, highlights,
 * trials, icons, audience — and until now NOTHING in this app read any of it.
 * `/v1/patients/me/plans` existed and had no consumer, so every plan an admin
 * composed was invisible to the people the plans are for.
 *
 * ─── WHY THIS FAILS SOFT ───────────────────────────────────────────────────
 *
 * The endpoint already degrades server-side: if the scan throws it returns
 * `{ plans: [], billing: null }` rather than a 500, because "a pricing page
 * that 500s is a dead end for someone trying to give us money"
 * (patient-plans.routes.ts). This mirrors that. A shelf is informational — it
 * grants nothing, gates nothing, and nothing downstream depends on it — so an
 * empty list is a truthful, harmless outcome and an error screen is not.
 *
 * That reasoning does NOT generalise. It is the opposite of what COS-777
 * concluded for notification preferences, where swallowing a failed WRITE told
 * the patient their toggles were saved when they were not. The rule is that a
 * failed READ of an advisory list may degrade; a failed WRITE never may.
 */

import { apiClient } from '@/lib/api-client';

export interface PlanShelfPricing {
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  /** Admin copy that REPLACES the figures, e.g. "Free forever". */
  displayPriceLabel: string | null;
}

export interface PlanShelfCard {
  planKey: string;
  name: string;
  shortDescription: string | null;
  tier: string | null;
  pricing: PlanShelfPricing | null;
  highlights: string[];
  isCurrent: boolean;
  /** 'coming-soon' renders disabled. Drafts never reach here — the API drops them. */
  status: string | null;
  /** MaterialIcons glyph name, or null to use the default. */
  icon: string | null;
  /** COS-784 — length of the free trial this plan offers, null when none. */
  trialDays: number | null;
}

export interface PlanShelfBilling {
  planKey: string | null;
  planName: string | null;
  billingCycle: string | null;
  billingStatus: string | null;
  currentPeriodEnd: string | null;
  pricing: PlanShelfPricing | null;
  trial: { endsAt: string | null; daysRemaining: number | null; convertsTo: string | null } | null;
}

export interface PlanShelf {
  plans: PlanShelfCard[];
  billing: PlanShelfBilling | null;
}

const EMPTY: PlanShelf = { plans: [], billing: null };

/**
 * The plans this patient can see, cheapest first, with theirs marked.
 *
 * Ordering and audience filtering are the SERVER's, not ours: it sorts by
 * monthly price and applies `isVisibleTo`, so a restricted plan never reaches a
 * patient who is not on its allowlist. Re-sorting here would be a second
 * opinion on a decision that has already been made correctly, and re-filtering
 * would imply the client is a security boundary, which it is not.
 */
export async function fetchPlanShelf(): Promise<PlanShelf> {
  try {
    const res = await apiClient.get<{ success: boolean; data: PlanShelf }>('/v1/patients/me/plans');
    const data = res.data?.data;
    // Shape-check rather than trust: an older or partially-deployed API could
    // answer 200 with something else, and `.map` on a non-array is a crash on
    // a screen that has no business crashing.
    if (!data || !Array.isArray(data.plans)) return EMPTY;
    return { plans: data.plans, billing: data.billing ?? null };
  } catch {
    return EMPTY;
  }
}

/**
 * Price as a patient reads it.
 *
 * `displayPriceLabel` WINS when set — that is the whole point of the override,
 * and an admin writing "Free forever" over a $0 plan must not also see "$0/mo".
 * No pricing at all means the plan is assigned rather than bought (agency and
 * enterprise), which is a real state and reads as "Included" rather than as an
 * error or a blank.
 */
export function formatPlanPrice(pricing: PlanShelfPricing | null): string {
  if (pricing?.displayPriceLabel) return pricing.displayPriceLabel;
  if (!pricing) return 'Included';
  const { monthlyPriceCents } = pricing;
  if (monthlyPriceCents === null || monthlyPriceCents === undefined) return 'Included';
  if (monthlyPriceCents === 0) return 'Free';
  // Whole dollars stay whole — "$29/mo", not "$29.00/mo" — because the cents
  // are noise on a card and every real price here is a round number.
  const dollars = monthlyPriceCents / 100;
  const shown = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `$${shown}/mo`;
}
