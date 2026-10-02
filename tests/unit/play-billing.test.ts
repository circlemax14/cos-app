/**
 * COS-1242 / SCRUM-776 — the pure decisions behind Google Play checkout.
 *
 * A real unit test rather than a source-text one: these functions are pure
 * and the ways they go wrong are behavioural — buying the annual base plan for
 * a monthly order, silently applying a free trial the shelf never priced, or
 * telling a patient "the store could not complete that purchase" when Play is
 * simply holding their payment.
 *
 * Offer fixtures mirror react-native-iap 16.5's SubscriptionOffer as
 * openiap-google 3.5 builds it: `id` is the offerId, or the basePlanId when the
 * offer IS the base plan; the last pricing phase is the recurring price.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isPlayPending,
  playBillingProblem,
  playSubscriptionsUrl,
  playSubscriptionToReplace,
  selectPlayOfferToken,
  type PlayOffer,
} from '../../lib/play-billing.ts';

const offer = (basePlan: string, offerId: string | null, periods: string[], token: string): PlayOffer => ({
  id: offerId ?? basePlan,
  basePlanIdAndroid: basePlan,
  offerTokenAndroid: token,
  pricingPhasesAndroid: { pricingPhaseList: periods.map((billingPeriod) => ({ billingPeriod })) },
});

// One product, two base plans, and a free-trial offer on the monthly one.
const twoBasePlans = [
  offer('monthly', 'trial-7d', ['P1W', 'P1M'], 'tok-monthly-trial'),
  offer('monthly', null, ['P1M'], 'tok-monthly-base'),
  offer('annual', null, ['P1Y'], 'tok-annual-base'),
];

test('picks the base plan that bills on the ordered cycle', () => {
  assert.equal(selectPlayOfferToken(twoBasePlans, 'monthly'), 'tok-monthly-base');
  assert.equal(selectPlayOfferToken(twoBasePlans, 'annual'), 'tok-annual-base');
});

test('THE POINT: a trial offer is never chosen over the base plan the shelf priced', () => {
  // The trial comes FIRST in the list and its recurring phase is also P1M.
  assert.notEqual(selectPlayOfferToken(twoBasePlans, 'monthly'), 'tok-monthly-trial');
});

test('a per-cycle product with one base plan is used even without matching phase data', () => {
  // The server already chose a per-cycle product id, so there is nothing else it could mean.
  const single = [{ id: 'base', basePlanIdAndroid: 'base', offerTokenAndroid: 'tok-only' }];
  assert.equal(selectPlayOfferToken(single, 'annual'), 'tok-only');
});

test('THE POINT: one base plan that bills on the OTHER cycle is refused, not bought', () => {
  // An annual order on a product whose only base plan is monthly would charge
  // a price the shelf never showed. Refuse; the caller names the product.
  assert.equal(selectPlayOfferToken([offer('monthly', null, ['P1M'], 'tok-m')], 'annual'), null);
  assert.equal(selectPlayOfferToken([offer('annual', null, ['P1Y'], 'tok-a')], 'monthly'), null);
});

test('nothing on this cycle across several base plans → null, never a guess', () => {
  const weekly = [offer('weekly', null, ['P1W'], 'tok-w'), offer('quarterly', null, ['P3M'], 'tok-q')];
  assert.equal(selectPlayOfferToken(weekly, 'monthly'), null);
});

test('offers with no token, and empty or missing lists, give null', () => {
  assert.equal(selectPlayOfferToken([{ ...offer('monthly', null, ['P1M'], ''), offerTokenAndroid: null }], 'monthly'), null);
  assert.equal(selectPlayOfferToken([], 'monthly'), null);
  assert.equal(selectPlayOfferToken(null, 'monthly'), null);
  assert.equal(selectPlayOfferToken(undefined, 'annual'), null);
});

test('the manage link deep-links one subscription, and falls back to the list', () => {
  assert.equal(
    playSubscriptionsUrl('ai.circlesupporthealth.advanced.monthly', 'ai.circlesupporthealth.csh'),
    'https://play.google.com/store/account/subscriptions?sku=ai.circlesupporthealth.advanced.monthly&package=ai.circlesupporthealth.csh',
  );
  assert.equal(playSubscriptionsUrl(null, 'ai.circlesupporthealth.csh'), 'https://play.google.com/store/account/subscriptions');
  assert.equal(playSubscriptionsUrl('sku', undefined), 'https://play.google.com/store/account/subscriptions');
  // Encoded, so a product id can never smuggle in another query parameter.
  assert.match(playSubscriptionsUrl('a&b', 'p'), /sku=a%26b&package=p$/);
});

test('pending and deferred payments are recognised in both code spellings', () => {
  assert.equal(isPlayPending('pending'), true);
  assert.equal(isPlayPending('deferred-payment'), true);
  assert.equal(isPlayPending('E_DEFERRED_PAYMENT'), true);
  assert.equal(isPlayPending('user-cancelled'), false);
  assert.equal(isPlayPending(undefined), false);
});

test('each Play failure gets a sentence a patient can act on, and says nothing was charged', () => {
  const cases: [string, RegExp][] = [
    ['already-owned', /already have this subscription.*Restore Google Play purchases/],
    ['E_ALREADY_OWNED', /already have this subscription/],
    ['billing-unavailable', /isn’t available on this device.*Play Store/],
    ['service-disconnected', /isn’t available on this device/],
    ['network-error', /couldn’t reach Google Play/],
    ['item-unavailable', /isn’t available on Google Play yet/],
    ['sku-not-found', /isn’t available on Google Play yet/],
    ['developer-error', /Install the app from Google Play/],
  ];
  for (const [code, expected] of cases) {
    const sentence = playBillingProblem(code);
    assert.ok(sentence, `${code} has no sentence`);
    assert.match(sentence, expected, code);
    assert.match(sentence, /charged/, `${code} must say whether money moved`);
  }
});

test('an unknown code falls through to the generic wording rather than inventing one', () => {
  assert.equal(playBillingProblem('unknown'), null);
  assert.equal(playBillingProblem(undefined), null);
  assert.equal(playBillingProblem('user-cancelled'), null);
});

// ── a plan change replaces, never stacks ─────────────────────────────────
const SUB = '00000000-0000-4000-8000-000000000001';
const held = (productId: string, over: Record<string, unknown> = {}) => ({
  productId,
  purchaseToken: `token-${productId}`,
  purchaseState: 'purchased',
  obfuscatedAccountIdAndroid: SUB,
  ...over,
});

test('THE POINT: buying plan B while holding plan A replaces A', () => {
  assert.deepEqual(playSubscriptionToReplace([held('plan.a.monthly')], SUB, 'plan.b.monthly'), {
    productId: 'plan.a.monthly',
    purchaseToken: 'token-plan.a.monthly',
  });
});

test('nothing to replace: no purchases, the same product, or a pending one', () => {
  assert.equal(playSubscriptionToReplace([], SUB, 'plan.b.monthly'), null);
  assert.equal(playSubscriptionToReplace(null, SUB, 'plan.b.monthly'), null);
  // Same product → let Play answer already-owned (its sentence says Restore).
  assert.equal(playSubscriptionToReplace([held('plan.b.monthly')], SUB, 'plan.b.monthly'), null);
  assert.equal(playSubscriptionToReplace([held('plan.a.monthly', { purchaseState: 'pending' })], SUB, 'plan.b.monthly'), null);
  assert.equal(playSubscriptionToReplace([held('plan.a.monthly', { purchaseToken: null })], SUB, 'plan.b.monthly'), null);
});

test('THE POINT: never replaces a subscription another of our accounts bought', () => {
  // A shared Google account: the other patient's plan must not be cancelled.
  const other = held('plan.a.monthly', { obfuscatedAccountIdAndroid: '00000000-0000-4000-8000-000000000002' });
  assert.equal(playSubscriptionToReplace([other], SUB, 'plan.b.monthly'), null);
  // A purchase with no account id was never granted by the server either.
  assert.equal(playSubscriptionToReplace([held('plan.a.monthly', { obfuscatedAccountIdAndroid: null })], SUB, 'plan.b.monthly'), null);
  // Theirs is skipped, this patient's is found.
  assert.equal(playSubscriptionToReplace([other, held('plan.c.annual')], SUB, 'plan.b.monthly')?.productId, 'plan.c.annual');
});
