/**
 * COS-793 — the narrow seam a real payment SDK drops into.
 *
 * ─── WHY THIS IS SEPARATE FROM lib/launch-purchase.ts ────────────────
 *
 * launch-purchase answers "start this purchase" and holds the Apple
 * compliance guard (out-of-process Linking, never a webview). It can only
 * answer AFTER a server round-trip, which is one round-trip too late: by then
 * we have already rendered a button.
 *
 * This file answers the question that has to be settled BEFORE render — can
 * this BUILD actually finish a purchase through this gateway? — and it answers
 * it without importing anything, so it is honest on a cold mount and testable
 * without a React or React Native harness.
 *
 * ─── WHAT "UNAVAILABLE IN THIS BUILD" MEANS ──────────────────────────
 *
 * StoreKit (react-native-iap / expo-in-app-purchases) and Play Billing are
 * NATIVE MODULES. They cannot arrive over an OTA, only in a new binary, and
 * Metro resolves require() statically — so merely importing one that is not
 * installed crashes every device on bundle load. This app has already had that
 * outage once (expo-clipboard on the About screen).
 *
 * So the store providers below report themselves unavailable and say why. The
 * server may well have Apple IAP switched ON — that is a correct server answer
 * about a build that cannot act on it, and the difference is exactly what the
 * patient needs told.
 *
 * ─── THE DROP-IN ─────────────────────────────────────────────────────
 *
 * When the module ships in a binary, ONE provider object changes: implement
 * purchase() and set unavailableReason to null. They flip together on purpose
 * — an available provider with a stub purchase() is the silent dead button
 * this whole file exists to prevent.
 *
 * COS-893 — the drop-in happened, and it is INJECTED, not imported.
 *
 * react-native-iap is now a dependency and services/native-store-billing.ts
 * knows how to drive it. Importing that here would have imported `react-native`
 * here, which breaks the property the line below promises — and it did: the
 * existing hooks/__tests__/payment-methods.test.ts stopped loading the moment
 * the import was added.
 *
 * So the binding is registered at app start instead, the same way
 * services/user-photo.ts takes its re-signer. Unregistered — every unit test,
 * and any build where the native half is absent — behaves exactly as it did
 * before this existed: unavailable, with a reason.
 *
 * NO IMPORTS AT RUNTIME. Type-only, so `node --test` can load it.
 */

/** What the app registers at start-up. Shaped so this file never names the SDK. */
export interface StoreBilling {
  /** Is the native half in THIS binary? */
  isLinked(): boolean;
  /**
   * COS-925 — `verify` is threaded through, not called afterwards.
   *
   * The store connection has to be open for finishTransaction, and
   * finishTransaction has to follow the server's verification. Only the store
   * layer knows when the connection is open, so it owns the whole sequence and
   * the caller hands it the one step it cannot do itself.
   */
  purchase(
    productId: string,
    unavailableReason: string,
    verify: VerifyStoreReceipt,
  ): Promise<PurchaseResult>;
}

/** The server round-trip, injected so this file never imports the API client. */
export type VerifyStoreReceipt = (proof: {
  productId: string;
  receipt: string;
  platform: 'ios' | 'android';
  transactionId?: string;
}) => Promise<{ applied: boolean }>;

let storeBilling: StoreBilling | null = null;

/** Called once from the app root. Absent in tests, and that is the point. */
export function registerStoreBilling(impl: StoreBilling | null): void {
  storeBilling = impl;
}

import type { AvailableGateway, PaymentGatewayId } from './api/payments';

export type PurchaseResult =
  /*
   * The store took it. COS-893 — it now carries the RECEIPT, because the
   * receipt is the only record that the purchase happened and dropping it here
   * meant /v1/payments/verify could never be called: the patient would have
   * been charged and granted nothing. `transactionId` is Apple's; Google
   * identifies a purchase by its token plus the product.
   */
  | {
      status: 'purchased';
      productId: string;
      /**
       * COS-925 — the RECEIPT no longer travels back out here.
       *
       * COS-893 added it so the caller could verify. Verification now happens
       * inside the store layer, because finishTransaction has to follow it
       * while the connection is still open. Carrying the receipt out as well
       * would be a second copy of a payment credential in a second place, for
       * a step nobody performs any more. `applied` is what the caller needs:
       * false means the money moved and the plan has not landed yet.
       */
      applied: boolean;
    }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string };

export interface PaymentProvider {
  id: PaymentGatewayId;
  /** Patient-facing. Vishal's words: they pay "via Apple" or "via Stripe". */
  label: string;
  /** One line under the label saying where the money actually goes. */
  detail: string;
  /** Null when purchase() can genuinely complete. Set with the SDK, never before. */
  unavailableReason: string | null;
  /** The SDK call. Real StoreKit / Play Billing implementation replaces this body. */
  purchase(productId: string, verify: VerifyStoreReceipt): Promise<PurchaseResult>;
}

const NO_STOREKIT =
  "Paying through Apple needs an App Store update — Apple's in-app purchase module isn't in this version of the app yet.";
const NO_PLAY_BILLING =
  'Paying through Google Play needs a Play Store update — the Play Billing module isn’t in this version of the app yet.';

const PROVIDERS: Record<PaymentGatewayId, PaymentProvider> = {
  /*
   * Stripe is the one that works today, and it works because it needs no SDK:
   * the server returns a checkout URL and RN core Linking opens it out of
   * process. @stripe/stripe-react-native would be a native module and is
   * deliberately NOT what this path uses.
   */
  stripe: {
    id: 'stripe',
    label: 'Card',
    detail: 'Pay by card with Stripe. Opens your browser, then brings you back.',
    unavailableReason: null,
    purchase: () =>
      Promise.resolve({
        status: 'unavailable',
        // Not reachable: a redirect gateway is completed by launchPurchase,
        // which owns the compliance guard. Never open a payment URL here.
        reason: 'Card payments open in your browser rather than through the app.',
      }),
  },
  /*
   * COS-893 — unavailableReason is now DERIVED from the binary, not asserted.
   *
   * It was a constant, so it stayed set after the SDK shipped and the button
   * would have kept explaining itself while being perfectly able to work. It
   * is a getter over isStoreBillingLinked() instead: one fact, read at the
   * moment it is needed, and it flips with the binary rather than with an edit
   * somebody has to remember.
   */
  'apple-iap': {
    id: 'apple-iap',
    label: 'Apple',
    detail: 'Charged to your Apple ID, managed in your Apple subscriptions.',
    get unavailableReason() {
      return storeBilling?.isLinked() ? null : NO_STOREKIT;
    },
    purchase: (productId: string, verify: VerifyStoreReceipt) =>
      storeBilling
        ? storeBilling.purchase(productId, NO_STOREKIT, verify)
        : Promise.resolve({ status: 'unavailable' as const, reason: NO_STOREKIT }),
  },
  'google-play': {
    id: 'google-play',
    label: 'Google Play',
    detail: 'Charged to your Google Play account, managed in Play subscriptions.',
    get unavailableReason() {
      return storeBilling?.isLinked() ? null : NO_PLAY_BILLING;
    },
    purchase: (productId: string, verify: VerifyStoreReceipt) =>
      storeBilling
        ? storeBilling.purchase(productId, NO_PLAY_BILLING, verify)
        : Promise.resolve({ status: 'unavailable' as const, reason: NO_PLAY_BILLING }),
  },
};

export function getPaymentProvider(id: PaymentGatewayId): PaymentProvider | undefined {
  return PROVIDERS[id];
}

/** One gateway the server offered, joined to what this build can do with it. */
export interface PaymentMethod {
  id: PaymentGatewayId;
  label: string;
  detail: string;
  kind: 'redirect' | 'native';
  usable: boolean;
  /** Present iff !usable. Always shown — an unexplained missing option reads as a bug. */
  reason: string | null;
}

/**
 * What the checkout screen should do.
 *
 *   none   — nothing here can take money. Say so; render no pay button.
 *   single — exactly one way to pay. Do NOT ask; name it and get on with it.
 *   choose — more than one. Ask, in the server's order (see registry.ts:
 *            the order is a preference contract, not a set).
 */
export type PaymentChoice =
  | { mode: 'none'; methods: PaymentMethod[]; usable: [] }
  | { mode: 'single'; methods: PaymentMethod[]; usable: [PaymentMethod] }
  | { mode: 'choose'; methods: PaymentMethod[]; usable: PaymentMethod[] };

/**
 * PURE. The client renders what the server sent and never adds to it — a
 * gateway absent from `gateways` is absent here, whatever the platform.
 *
 * The one thing decided locally is whether this BUILD can finish, which is a
 * fact about the binary the server cannot know.
 */
export function decidePaymentChoice(gateways: AvailableGateway[]): PaymentChoice {
  const methods: PaymentMethod[] = gateways.flatMap((g) => {
    const p = getPaymentProvider(g.id);
    // An id this build has never heard of: drop it rather than render a
    // nameless button. Forward compatibility, not defensiveness.
    if (!p) return [];
    return [
      {
        id: p.id,
        label: g.label ?? p.label,
        detail: p.detail,
        kind: g.kind,
        usable: p.unavailableReason === null,
        reason: p.unavailableReason,
      },
    ];
  });

  const usable = methods.filter((m) => m.usable);
  if (usable.length === 0) return { mode: 'none', methods, usable: [] };
  if (usable.length === 1) return { mode: 'single', methods, usable: [usable[0]] };
  return { mode: 'choose', methods, usable };
}
