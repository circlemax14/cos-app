/**
 * COS-737 — price formatting for the subscription screen.
 *
 * This is the one screen where a wrong number is a promise to a patient about
 * money. So the tests care less about happy-path formatting and more about the
 * cases where a plausible-looking output would be a lie.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrice, priceLines } from '../../lib/plan-price.ts';

test('formats whole and part amounts the way a card should read', () => {
  assert.equal(formatPrice(999), '$9.99');
  assert.equal(formatPrice(1999), '$19.99');
  assert.equal(formatPrice(2000), '$20');   // no trailing .00 on a pricing card
  assert.equal(formatPrice(905), '$9.05');  // pads the minor unit
});

test('THE POINT: absent pricing returns null, never "$0" or "Free"', () => {
  // A plan with no pricing is NOT-FOR-SALE. Rendering a zero price is a lie the
  // patient could act on.
  for (const v of [null, undefined, NaN, Infinity, -1]) {
    assert.equal(formatPrice(v as number | null), null, String(v));
  }
});

test('zero is a real price and formats, unlike absent', () => {
  assert.equal(formatPrice(0), '$0');
});

test('priceLines produces both lines when both prices exist', () => {
  const out = priceLines({ monthlyPriceCents: 999, annualPriceCents: 9900, currency: 'USD' });
  assert.equal(out.monthly, '$9.99 / mo');
  assert.equal(out.annual, '$99 / yr');
});

test('advertises the annual saving only when there is one', () => {
  // $9.99/mo = $119.88/yr, so $99 saves ~17%.
  assert.equal(priceLines({ monthlyPriceCents: 999, annualPriceCents: 9900, currency: 'USD' }).annualSavingPct, 17);
});

test('THE POINT: never advertises a saving that does not exist', () => {
  // An annual price at or above 12x monthly is not a saving. Claiming one on a
  // payment page is the kind of thing that ends up in a complaint.
  assert.equal(priceLines({ monthlyPriceCents: 999, annualPriceCents: 11988, currency: 'USD' }).annualSavingPct, null);
  assert.equal(priceLines({ monthlyPriceCents: 999, annualPriceCents: 20000, currency: 'USD' }).annualSavingPct, null);
});

test('a monthly-only plan still renders, with no annual line or saving', () => {
  const out = priceLines({ monthlyPriceCents: 999, annualPriceCents: null, currency: 'USD' });
  assert.equal(out.monthly, '$9.99 / mo');
  assert.equal(out.annual, null);
  assert.equal(out.annualSavingPct, null);
});

test('no pricing at all yields all nulls, so the card can say something else', () => {
  assert.deepEqual(priceLines(null), { monthly: null, annual: null, annualSavingPct: null, label: null });
});

// ── COS-807: the admin's own words for the price ──────────────────────────

test("THE POINT: a plan priced only by a label is not priceless", () => {
  // The backend has returned displayPriceLabel since COS-784 and the app threw
  // it away, so a free plan rendered a name and nothing else. That is most of
  // why the cards read as empty.
  const out = priceLines({
    monthlyPriceCents: null,
    annualPriceCents: null,
    currency: 'USD',
    displayPriceLabel: 'Free forever',
  });
  assert.equal(out.label, 'Free forever');
  assert.equal(out.monthly, null);
});

test('the label wins over a computed figure', () => {
  // An admin who typed a price meant it.
  const out = priceLines({
    monthlyPriceCents: 3900,
    annualPriceCents: null,
    currency: 'USD',
    displayPriceLabel: 'Included with your care',
  });
  assert.equal(out.label, 'Included with your care');
  // ...and the computed one is still available, so the card can show both.
  assert.equal(out.monthly, '$39 / mo');
});

test('a blank label is absent, not a blank price', () => {
  // displayName had exactly this bug in four places.
  for (const bad of ['', '   ', undefined, null]) {
    const out = priceLines({
      monthlyPriceCents: 1000,
      annualPriceCents: null,
      currency: 'USD',
      displayPriceLabel: bad as string | null | undefined,
    });
    assert.equal(out.label, null, `"${String(bad)}" should not render as a price`);
  }
});
