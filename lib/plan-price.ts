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
 * Money rule, stated once: a plan is only FREE if it has no positive price on
 * either cycle AND the admin did not write a price in words. A plan priced
 * "Contact us" with no figure is neither chargeable (there is no amount to
 * send, and no store product) nor giveable — so it is offered as neither.
 */
export function planChoice(pricing: PlanPricing | null | undefined): {
  /** Has a real monthly amount. Gate the monthly Subscribe button on THIS. */
  monthlyPaid: boolean;
  /** Has a real annual amount. Gate the annual Subscribe button on THIS. */
  annualPaid: boolean;
  /** Either cycle costs something. */
  costsMoney: boolean;
  /** An admin priced it in words and gave no figure. Not free, not sellable. */
  pricedInWordsOnly: boolean;
  /** Safe to hand over for nothing. */
  isFree: boolean;
} {
  // `> 0`, not "is a number": a 0 renders as "$0" rather than null, so a
  // truthiness test on the formatted line calls a free plan paid.
  const monthlyPaid = (pricing?.monthlyPriceCents ?? 0) > 0;
  const annualPaid = (pricing?.annualPriceCents ?? 0) > 0;
  const costsMoney = monthlyPaid || annualPaid;
  const pricedInWordsOnly = !costsMoney && Boolean(pricing?.displayPriceLabel?.trim());
  return {
    monthlyPaid,
    annualPaid,
    costsMoney,
    pricedInWordsOnly,
    isFree: !costsMoney && !pricedInWordsOnly,
  };
}
