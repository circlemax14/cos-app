/**
 * COS-1242 / SCRUM-776 — the pure half of Google Play Billing.
 *
 * Everything here is a decision that can be made without a store connection,
 * so it lives where `node --test` can load it: NO runtime imports. The store
 * calls themselves are in services/native-store-billing.ts, which is the only
 * file allowed to require react-native-iap (and only lazily — see its header).
 *
 * ─── WHERE THE PRODUCT ID COMES FROM ─────────────────────────────────
 *
 * Not from here. POST /v1/payments/start reads plan.pricing.googleProductIdMonthly
 * / googleProductIdAnnual on the server (google-play.gateway.ts productIdFor)
 * and returns `{ kind: 'native', productId }`, exactly as it does for Apple
 * (COS-920). A plan key never reaches the store, and the client never reads a
 * product id off the plan payload — the server is the one place the mapping
 * lives, and the dashboard writes those two fields.
 */

/** The bits of a react-native-iap 16.5 `SubscriptionOffer` this file reads. */
export interface PlayOffer {
  /** offerId, or the basePlanId when the offer IS the base plan (openiap-google BillingConverters). */
  id?: string | null;
  basePlanIdAndroid?: string | null;
  offerTokenAndroid?: string | null;
  pricingPhasesAndroid?: {
    pricingPhaseList?: { billingPeriod?: string | null }[] | null;
  } | null;
}

/** ISO-8601 billing periods Play Console uses for the two cycles we sell. */
const PERIOD: Record<'monthly' | 'annual', string> = { monthly: 'P1M', annual: 'P1Y' };

/**
 * Which offer to buy for this billing cycle. Returns its offerToken, or null
 * when the product has nothing that bills on this cycle.
 *
 * Play Billing 5+ will not launch a subscription without an offerToken, and a
 * product can carry several base plans (monthly AND annual under one product
 * id) plus developer offers on each. So:
 *
 *   1. offers whose RECURRING phase — the last pricing phase; any earlier ones
 *      are a trial or intro price — bills on this cycle;
 *   2. of those, the BASE PLAN (Google returns `id = basePlanId` when there is
 *      no offerId) — that is the price the shelf showed the patient;
 *   3. if the product has exactly one base plan and Play sent NO phase data
 *      for it, that one: the server already picked a per-cycle product id, so
 *      there is nothing else it could mean. Phase data that names a DIFFERENT
 *      cycle is a refusal, not a fallback — buying a P1M plan for an annual
 *      order charges a price the shelf never showed (review of COS-1242).
 *
 * Deliberately the base plan over developer offers (free trial, intro price):
 * the shelf prices the base plan, and silently applying a trial would charge
 * something other than what it said. When someone decides Play trials are
 * wanted, prefer a tagged offer here — nothing else has to move.
 */
export function selectPlayOfferToken(
  offers: readonly PlayOffer[] | null | undefined,
  cycle: 'monthly' | 'annual',
): string | null {
  const usable = (offers ?? []).filter((o) => typeof o.offerTokenAndroid === 'string' && o.offerTokenAndroid);
  const isBasePlan = (o: PlayOffer) => !!o.basePlanIdAndroid && o.id === o.basePlanIdAndroid;
  const recurringPeriod = (o: PlayOffer) => {
    const phases = o.pricingPhasesAndroid?.pricingPhaseList ?? [];
    return phases.length > 0 ? phases[phases.length - 1]?.billingPeriod : undefined;
  };

  const forCycle = usable.filter((o) => recurringPeriod(o) === PERIOD[cycle]);
  const pick = forCycle.find(isBasePlan) ?? forCycle[0];
  if (pick) return pick.offerTokenAndroid ?? null;

  const basePlans = new Set(usable.map((o) => o.basePlanIdAndroid ?? ''));
  if (basePlans.size !== 1 || usable.some((o) => recurringPeriod(o))) return null;
  return (usable.find(isBasePlan) ?? usable[0])?.offerTokenAndroid ?? null;
}

/** The bits of a react-native-iap 16.5 Android `Purchase` the replacement check reads. */
export interface PlayHeldPurchase {
  productId?: string | null;
  purchaseToken?: string | null;
  purchaseState?: string | null;
  obfuscatedAccountIdAndroid?: string | null;
}

/**
 * COS-1242 — the live Play subscription a new purchase must REPLACE, or null.
 *
 * Play is not an App Store subscription group: two product ids are two
 * subscriptions. Buying plan B while holding plan A, without saying so, leaves
 * BOTH renewing — the patient is charged twice, and every renewal of A
 * re-grants A over B (google-play-notifications.ts applies any paid order it
 * has not seen). The server already expects a change to arrive as a
 * replacement (it ignores the old token's replacementCancellation), so the
 * app launches one.
 *
 * Only a subscription THIS patient bought — obfuscatedAccountId is their sub.
 * A Google account shared by two of our accounts must not let one patient's
 * plan change cancel the other's subscription. The same product id is left
 * alone: Play answers already-owned, and that sentence sends them to Restore.
 */
export function playSubscriptionToReplace(
  held: readonly PlayHeldPurchase[] | null | undefined,
  sub: string,
  productId: string,
): { productId: string; purchaseToken: string } | null {
  for (const p of held ?? []) {
    if (
      p.purchaseState === 'purchased' &&
      p.obfuscatedAccountIdAndroid === sub &&
      p.purchaseToken &&
      p.productId &&
      p.productId !== productId
    ) {
      return { productId: p.productId, purchaseToken: p.purchaseToken };
    }
  }
  return null;
}

const PLAY_SUBSCRIPTIONS = 'https://play.google.com/store/account/subscriptions';

/**
 * Play's own subscription centre, opened on THIS subscription when we know it.
 *
 * Google documents `?sku=&package=` as the deep link to one subscription's
 * manage page; without both it falls back to the list, which still works.
 * Opened with Linking.openURL — Play's UI, out of process, never a webview.
 */
export function playSubscriptionsUrl(productId?: string | null, packageName?: string | null): string {
  if (!productId || !packageName) return PLAY_SUBSCRIPTIONS;
  return `${PLAY_SUBSCRIPTIONS}?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(packageName)}`;
}

/** react-native-iap 16.5 codes are kebab-case; older ones were E_SNAKE_CASE. */
function normalise(code: unknown): string {
  return String(code ?? '')
    .toLowerCase()
    .replace(/^e_/, '')
    .replace(/_/g, '-');
}

/** Play is holding the payment (cash at a shop, a slow bank). Not a failure. */
export function isPlayPending(code: unknown): boolean {
  const c = normalise(code);
  return c === 'pending' || c === 'deferred-payment';
}

/**
 * A plain-English sentence for a Play Billing error, or null to fall back to
 * the generic "the store could not complete that purchase" wording.
 *
 * Every one says whether money moved, because that is the first thing a
 * patient wants to know and the one thing they cannot see.
 */
export function playBillingProblem(code: unknown): string | null {
  switch (normalise(code)) {
    case 'already-owned':
    case 'duplicate-purchase':
      return 'You already have this subscription on Google Play. Open Billing and tap “Restore Google Play purchases” to add it to this account. Nothing new has been charged.';
    case 'billing-unavailable':
    case 'iap-not-available':
    case 'feature-not-supported':
    case 'service-disconnected':
    case 'service-error':
    case 'service-timeout':
    case 'connection-closed':
    case 'init-connection':
    case 'not-prepared':
      return 'Google Play Billing isn’t available on this device right now. Check the Play Store app is installed, up to date and signed in, then try again. Nothing has been charged.';
    case 'network-error':
    case 'remote-error':
      return 'We couldn’t reach Google Play. Check your connection and try again. Nothing has been charged.';
    case 'item-unavailable':
    case 'sku-not-found':
    case 'sku-offer-mismatch':
    case 'empty-sku-list':
    case 'query-product':
      return 'This plan isn’t available on Google Play yet. Nothing has been charged — your care team can move you over in the meantime.';
    case 'developer-error':
      // Overwhelmingly: a copy of the app that did not come from Play (a
      // side-loaded or debug build), which Play refuses to bill.
      return 'Google Play couldn’t start this purchase from this copy of the app. Install the app from Google Play and try again. Nothing has been charged.';
    default:
      return null;
  }
}

/** Shown when Play holds the payment. Restore is what settles it afterwards. */
export const PLAY_PENDING_MESSAGE =
  'Google Play is still processing your payment. Once it clears, open Billing and tap “Restore Google Play purchases” — you won’t be charged twice.';
