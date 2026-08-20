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
} {
  if (!pricing) return { monthly: null, annual: null, annualSavingPct: null };
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

  return { monthly: monthly ? `${monthly} / mo` : null, annual: annual ? `${annual} / yr` : null, annualSavingPct };
}
