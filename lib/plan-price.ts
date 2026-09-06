/**
 * COS-737 — money formatting for the subscription screen.
 *
 * Pure and separate so it can be tested under `node --test` — the screen itself
 * cannot be, and getting a price wrong on a page where someone decides to pay
 * is the kind of bug people screenshot.
 */

export interface PlanPricing {
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  currency: string;
  /**
   * COS-807 — an admin-authored override, e.g. "Free forever".
   *
   * The backend has returned this since COS-784 and the app dropped it on the
   * floor, so a plan priced entirely by this label rendered with NO PRICE AT
   * ALL — the card showed a name and nothing else. It wins over the computed
   * figure, because an admin who typed a price meant it.
   */
  displayPriceLabel?: string | null;
}

/**
 * Format cents as a price string.
 *
 * Returns null rather than a placeholder when there is no price: a plan with no
 * pricing is not-for-sale, and rendering "$0.00" or "Free" would be a lie the
 * patient could act on. The caller decides what to show instead.
 */
export function formatPrice(cents: number | null | undefined, currency = 'USD'): string | null {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents < 0) return null;
  const symbol = currency === 'USD' ? '$' : '';
  const whole = Math.floor(cents / 100);
  const part = cents % 100;
  // Whole amounts read better without trailing zeros on a pricing card.
  return part === 0 ? `${symbol}${whole}` : `${symbol}${whole}.${String(part).padStart(2, '0')}`;
}

/** "$9.99 / mo" plus an annual line when one exists. */
export function priceLines(pricing: PlanPricing | null | undefined): {
  monthly: string | null;
  annual: string | null;
  /** Percent saved by paying annually, when both prices exist and it is positive. */
  annualSavingPct: number | null;
  /** The admin's own words for the price, when they wrote any. */
  label: string | null;
} {
  if (!pricing) return { monthly: null, annual: null, annualSavingPct: null, label: null };
  const currency = pricing.currency || 'USD';
  const monthly = formatPrice(pricing.monthlyPriceCents, currency);
  const annual = formatPrice(pricing.annualPriceCents, currency);

  let annualSavingPct: number | null = null;
  const m = pricing.monthlyPriceCents;
  const a = pricing.annualPriceCents;
  if (typeof m === 'number' && typeof a === 'number' && m > 0 && a > 0) {
    const pct = Math.round((1 - a / (m * 12)) * 100);
    // Only advertise a saving that exists. A negative or zero one would be a
    // false claim on a page where someone is deciding to spend money.
    annualSavingPct = pct > 0 ? pct : null;
  }

  // Trimmed, and empty-string-is-absent: displayName had exactly this bug in
  // four places, and an all-whitespace label would render as a blank price.
  const label = pricing.displayPriceLabel?.trim() || null;

  return {
    monthly: monthly ? `${monthly} / mo` : null,
    annual: annual ? `${annual} / yr` : null,
    annualSavingPct,
    label,
  };
}

/**
 * COS-925 — which control a plan card offers, defined ONCE.
 *
 * The shelf (components/plan/PlanStatusSection.tsx) and the billing screen
 * (app/Home/billing.tsx) render the same plans and each had its own answer.
 * Billing's was `isPurchasable(plan)`, which COS-924 had to invert, and the
 * inversion silently offered a free one-tap Switch on COMING-SOON plans —
 * because billing's card type carries no status and could not tell. Two copies
 * of one rule is how that happened, so there is one copy now.
 *
 * Money rule, stated once: a plan is FREE when neither cycle has a positive
 * price. That is the whole rule.
 *
 * COS-926 — an earlier version of this added a third state: a plan with a
 * `displayPriceLabel` but no figure ("Contact us") was treated as neither free
 * nor sellable, on the reasoning that we cannot charge for it and should not
 * give it away. That was wrong twice over.
 *
 * It broke a real plan. `test-plan-1` is labelled "Free Foreever" with no
 * cents, which is a plan that IS free saying so, and the patient was told
 * "your care team can move you to this plan" about a plan they were meant to
 * be able to take themselves.
 *
 * And it contradicted a decision already made. COS-786 removed exactly this
 * inference — Vishal, 2026-08-29: "we can also [set the] advanced plan as free
 * because sometimes the plan is only for the specific users, and we don't want
 * to charge anything to them." `isPurchasable` on the server has said since
 * then that a free plan is a real plan; the client had no business being
 * stricter, least of all by guessing at English.
 *
 * If "Contact us with no price" ever needs to be un-takeable, that is the plan
 * EDITOR's job to refuse at authoring time, where a human can be asked what
 * they meant — not this function's, reading prose.
 */
export function planChoice(pricing: PlanPricing | null | undefined): {
  /** Has a real monthly amount. Gate the monthly Subscribe button on THIS. */
  monthlyPaid: boolean;
  /** Has a real annual amount. Gate the annual Subscribe button on THIS. */
  annualPaid: boolean;
  /** Either cycle costs something. */
  costsMoney: boolean;
  /** Safe to hand over for nothing. */
  isFree: boolean;
} {
  // `> 0`, not "is a number": a 0 renders as "$0" rather than null, so a
  // truthiness test on the formatted line calls a free plan paid.
  const monthlyPaid = (pricing?.monthlyPriceCents ?? 0) > 0;
  const annualPaid = (pricing?.annualPriceCents ?? 0) > 0;
  const costsMoney = monthlyPaid || annualPaid;
  return { monthlyPaid, annualPaid, costsMoney, isFree: !costsMoney };
}
