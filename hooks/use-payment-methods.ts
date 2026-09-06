/**
 * COS-793 — how the patient wants to pay, and whether we should even ask.
 *
 * Two facts, from two places that each own one of them:
 *
 *   WHICH GATEWAYS  — the server, via usePaymentGateways(). Platform rules and
 *                     the per-gateway dashboard switches are compliance
 *                     decisions; a client that re-derives them drifts, and the
 *                     drift is either an App Store rejection or a charge we
 *                     said we would not take. This hook adds nothing to that
 *                     list, ever.
 *   CAN THIS BUILD  — services/payments-provider.ts. Whether StoreKit is in
 *                     the binary is a fact the server cannot see.
 *
 * The join gives the three states the checkout screen renders, and the middle
 * one is the point of the whole hook: with exactly one way to pay there is
 * nothing to choose, so we do not stage a decision the patient cannot make.
 */

import { useCallback } from 'react';
import { usePaymentGateways } from '@/hooks/use-payment-gateways';
import {
  decidePaymentChoice,
  getPaymentProvider,
  type PaymentChoice,
  type PaymentMethod,
} from '@/services/payments-provider';
import { launchPurchase, describeOutcome } from '@/lib/launch-purchase';
import { startPurchase, verifyStorePurchase } from '@/services/api/payments';

export type { PaymentMethod, PaymentChoice };

/**
 * COS-924 — what actually happened, instead of a message-or-null.
 *
 * `pay()` used to return `string | null`, and null meant THREE different
 * things: the patient cancelled the store sheet, the purchase was verified and
 * the plan is live, and the system browser has taken over. billing-checkout
 * never had to tell them apart — it only ever rendered the message — so the
 * ambiguity was invisible.
 *
 * The plan shelf is the first caller that ACTS on success: it refreshes the
 * plan and closes the chooser. Reading null as success there would have closed
 * the chooser and shown the new plan when the patient had cancelled Apple's
 * sheet and paid nothing.
 *
 * Fixed here rather than at the call site, because a caller cannot recover a
 * distinction the contract threw away, and the next caller would get it wrong
 * the same way.
 */
export type PayOutcome =
  /** Verified by the server. The plan is live — safe to refresh and move on. */
  | { status: 'applied' }
  /** The money moved but the plan has not landed yet. Say so; do NOT retry. */
  | { status: 'pending'; message: string }
  /** The patient backed out. Nothing was charged and nothing should be said. */
  | { status: 'cancelled' }
  /** The system browser owns the screen now. Anything we say talks over it. */
  | { status: 'handed-off' }
  /** It did not happen. `message` is safe to show. */
  | { status: 'failed'; message: string };

export interface UsePaymentMethods {
  isLoading: boolean;
  /** Every method the server offered, usable or not, in the server's order. */
  methods: PaymentMethod[];
  /** 'none' | 'single' | 'choose'. 'none' while loading — never a pay button by default. */
  mode: PaymentChoice['mode'];
  /** The only way to pay, when there is exactly one. Null otherwise. */
  only: PaymentMethod | null;
  /** Run a purchase. See PayOutcome — the caller must not treat these alike. */
  pay: (
    method: PaymentMethod,
    order: { planKey: string; cycle: 'monthly' | 'annual' },
  ) => Promise<PayOutcome>;
}

export function usePaymentMethods(): UsePaymentMethods {
  const { gateways, isLoading } = usePaymentGateways();
  // Loading and error both surface as an empty list from usePaymentGateways,
  // so this is 'none' until proven otherwise. That is the safe default: a
  // Subscribe button that cannot complete is worse than no button.
  const choice = decidePaymentChoice(gateways);

  const pay = useCallback(
    async (
      method: PaymentMethod,
      order: { planKey: string; cycle: 'monthly' | 'annual' },
    ): Promise<PayOutcome> => {
      // Belt to the UI's braces: an unusable method is not rendered as a
      // button, and if that ever slips it still cannot reach the network.
      if (!method.usable) {
        return { status: 'failed', message: method.reason ?? 'That payment method is not available.' };
      }

      if (method.kind === 'native') {
        /*
         * COS-920 — ASK THE SERVER FOR THE PRODUCT ID FIRST.
         *
         * This passed `order.planKey` straight to StoreKit. A plan key is
         * `advanced`; an App Store Connect product id is reverse-DNS, e.g.
         * `ai.circlesupporthealth.advanced.monthly`. They are different
         * namespaces and only the server knows the mapping — it lives on
         * plan.pricing.appleProductIdMonthly / …Annual.
         *
         * So StoreKit would have been asked for a product that does not exist,
         * getSubscriptions would return [], and every Apple purchase would
         * have failed with "That plan is not available in the store yet" — no
         * matter how correctly the products were set up in App Store Connect.
         *
         * POST /v1/payments/start already returns exactly this:
         * `{ kind: 'native', productId, reference }` (apple-iap.gateway.ts:131,
         * google-play.gateway.ts). The endpoint was built for it and nothing
         * called it. It also re-checks the gateway is enabled, legal for this
         * platform and configured, so a stale screen cannot start a purchase
         * through a gateway that has since been switched off.
         */
        let productId: string;
        try {
          const started = await startPurchase({
            gateway: method.id,
            planKey: order.planKey,
            cycle: order.cycle,
          });
          if (started.kind !== 'native') {
            // The server changed its mind about how this gateway works. Do not
            // guess — a redirect handled as a native purchase charges nothing
            // and reports success.
            return { status: 'failed', message: 'That payment method is not available right now.' };
          }
          productId = started.productId;
        } catch {
          // Deliberately not surfacing the server's message: it can name SSM
          // parameter paths (payments.routes.ts says so where it builds them).
          return { status: 'failed', message: 'We could not start that purchase. Please try again.' };
        }

        /*
         * COS-925 — verification is handed TO the store layer, not run after it.
         *
         * finishTransaction has to follow the server's confirmation and has to
         * happen while the store connection is open. Splitting those across two
         * files meant neither did it: nothing in the app called
         * finishTransaction at all. On Google that is an automatic refund after
         * three days on a plan we go on honouring; on Apple the transaction
         * replays on every launch forever.
         *
         * Entitlement still follows the SERVER and never the client's word —
         * that is the whole reason this callback exists rather than the store
         * layer deciding for itself.
         */
        const provider = getPaymentProvider(method.id);
        const result = await provider?.purchase(productId, async (proof) =>
          verifyStorePurchase(
            proof.platform === 'ios'
              ? {
                  gateway: 'apple-iap',
                  transactionId: proof.transactionId ?? proof.productId,
                  signedPayload: proof.receipt,
                }
              : {
                  gateway: 'google-play',
                  purchaseToken: proof.receipt,
                  productId: proof.productId,
                },
          ),
        );

        if (!result || result.status === 'unavailable') {
          return {
            status: 'failed',
            message:
              result?.reason ?? 'That payment method isn\u2019t available in this version of the app.',
          };
        }
        // Distinct from success. The shelf must not refresh or close on this.
        if (result.status === 'cancelled') return { status: 'cancelled' };

        /*
         * COS-925 — 'pending' no longer promises a retry nobody performs.
         *
         * It used to end "It will apply automatically \u2014 no need to pay again",
         * which was false in both directions: nothing in the app retries a
         * failed verify, and the sentence talks the patient out of the one
         * action that WOULD recover it. The transaction is deliberately left
         * unfinished, so the store replays it and the next purchase attempt
         * settles it \u2014 and /v1/payments/verify is idempotent on the
         * provider's transaction id, so that costs nothing.
         */
        return result.applied
          ? { status: 'applied' }
          : {
              status: 'pending',
              message:
                'Payment received, but your plan has not updated yet. Reopen this screen in a minute \u2014 you will not be charged again.',
            };
      }

      // Redirect. launchPurchase owns the Apple compliance guard (out of
      // process, never a webview); it is deliberately the only opener.
      const outcome = await launchPurchase({
        gateway: method.id,
        planKey: order.planKey,
        cycle: order.cycle,
      });
      return outcome.status === 'opened-external'
        ? { status: 'handed-off' }
        : { status: 'failed', message: describeOutcome(outcome) };
    },
    [],
  );

  return {
    isLoading,
    methods: choice.methods,
    mode: choice.mode,
    only: choice.mode === 'single' ? choice.usable[0] : null,
    pay,
  };
}
