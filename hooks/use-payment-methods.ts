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
import { verifyStorePurchase } from '@/services/api/payments';

export type { PaymentMethod, PaymentChoice };

export interface UsePaymentMethods {
  isLoading: boolean;
  /** Every method the server offered, usable or not, in the server's order. */
  methods: PaymentMethod[];
  /** 'none' | 'single' | 'choose'. 'none' while loading — never a pay button by default. */
  mode: PaymentChoice['mode'];
  /** The only way to pay, when there is exactly one. Null otherwise. */
  only: PaymentMethod | null;
  /**
   * Run a purchase. Resolves to a message to show the patient, or null when
   * the system browser has taken over and anything we said would talk over it.
   */
  pay: (
    method: PaymentMethod,
    order: { planKey: string; cycle: 'monthly' | 'annual' },
  ) => Promise<string | null>;
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
    ): Promise<string | null> => {
      // Belt to the UI's braces: an unusable method is not rendered as a
      // button, and if that ever slips it still cannot reach the network.
      if (!method.usable) return method.reason;

      if (method.kind === 'native') {
        // The store SDK seam. Today every implementation reports itself
        // unavailable; when one lands, nothing here changes.
        const provider = getPaymentProvider(method.id);
        const result = await provider?.purchase(order.planKey);
        if (!result || result.status === 'unavailable') {
          return result?.reason ?? 'That payment method isn’t available in this version of the app.';
        }
        if (result.status === 'cancelled') return null;

        /*
         * COS-893 — the drop-in landed, so the receipt is posted here.
         *
         * The store charging the card grants NOTHING on its own. Entitlement
         * follows only after the server has checked the receipt with Apple or
         * Google, which is also what stops a client simply claiming it paid.
         *
         * A verify failure is reported as "paid, not applied yet" rather than
         * as a failed purchase, because the money HAS moved. The server is
         * idempotent on the provider's transaction id, so a later retry — on
         * the next cold start, say — settles it without double-charging.
         */
        try {
          const applied = await verifyStorePurchase(
            result.platform === 'ios'
              ? {
                  gateway: 'apple-iap',
                  transactionId: result.transactionId ?? result.productId,
                  signedPayload: result.receipt,
                }
              : {
                  gateway: 'google-play',
                  purchaseToken: result.receipt,
                  productId: result.productId,
                },
          );
          return applied.applied
            ? null
            : 'Payment received. Your plan will update shortly.';
        } catch {
          return 'Payment received, but we could not confirm it yet. It will apply automatically — no need to pay again.';
        }
      }

      // Redirect. launchPurchase owns the Apple compliance guard (out of
      // process, never a webview); it is deliberately the only opener.
      const outcome = await launchPurchase({
        gateway: method.id,
        planKey: order.planKey,
        cycle: order.cycle,
      });
      return outcome.status === 'opened-external' ? null : describeOutcome(outcome);
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
