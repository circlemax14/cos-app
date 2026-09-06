/**
 * COS-791 — the ONE way a purchase is started, and the guard that keeps it legal.
 *
 * ─── THE MISTAKE THIS FILE EXISTS TO PREVENT ─────────────────────────
 *
 * The obvious implementation of "take the patient to Stripe" is to open the
 * checkout URL in an in-app browser. On iOS that is an App Store rejection
 * under Guideline 3.1.1 — payment for digital content collected inside the
 * binary — and it is the single most common way apps fail review for this.
 *
 * Worse, it WORKS PERFECTLY in the simulator, so nothing catches it before
 * submission. And this repo already ships BOTH libraries that would do it:
 *
 *   react-native-webview  13.16.0   (package.json:85, and in the Podfile)
 *   expo-web-browser      ~55.0.14  (package.json:65)
 *
 * `expo-web-browser`'s openBrowserAsync is the subtle one: it is
 * SFSafariViewController, which is still in-process and still counts. It is
 * also the function anyone would reach for first.
 *
 * The compliant call is React Native core `Linking.openURL()`, which hands off
 * OUT of the app to the system browser. So this module imports Linking and
 * nothing else, and `payments-compliance.test.mjs` fails the build if either
 * of those two libraries ever appears in the payment path.
 *
 * ─── AND THE REDIRECT PATH SHOULD NOT ARISE ON A DEVICE ANYWAY ───────
 *
 * The server declares stripe.platforms = ['web'], so an iOS or Android build
 * asking for a redirect gateway is refused server-side before it gets here.
 * The Linking guard below is therefore a second line of defence, not the
 * first — it covers the case where someone later marks Stripe as legal on a
 * mobile platform (an external-purchase-link programme, say) and forgets that
 * HOW the link opens is the part Apple actually cares about.
 */

import { Linking, Platform } from 'react-native';
import {
  startPurchase,
  type PaymentGatewayId,
  type StartPurchaseResult,
} from '@/services/api/payments';

export type LaunchOutcome =
  | { status: 'opened-external' }
  | { status: 'needs-store-sdk'; productId: string }
  | { status: 'unsupported'; reason: string };

/**
 * Open a redirect-style checkout.
 *
 * ALWAYS out-of-process. Never a webview, never SFSafariViewController — see
 * the header. This function is deliberately tiny and deliberately the only
 * place a payment URL is opened.
 */
async function openExternally(url: string): Promise<LaunchOutcome> {
  const ok = await Linking.canOpenURL(url);
  if (!ok) return { status: 'unsupported', reason: 'No browser available to open checkout.' };
  await Linking.openURL(url);
  return { status: 'opened-external' };
}

/**
 * Begin a purchase.
 *
 * Returns rather than navigating, so the caller decides what the screen does
 * next — and so the store path can report that this BUILD cannot complete it
 * (see below) without this module knowing anything about UI.
 */
export async function launchPurchase(input: {
  gateway: PaymentGatewayId;
  planKey: string;
  cycle: 'monthly' | 'annual';
}): Promise<LaunchOutcome> {
  const result: StartPurchaseResult = await startPurchase(input);

  if (result.kind === 'redirect') {
    return openExternally(result.url);
  }

  /*
   * A store purchase. The server has told us WHICH product to ask for; the
   * rest is StoreKit on iOS or Play Billing on Android, and both are NATIVE
   * MODULES — they cannot be added by an OTA, only by a new binary.
   *
   * Nothing is imported here yet, and that is deliberate rather than
   * unfinished. Metro resolves `require()` statically, so referencing a
   * package that is not installed fails the BUNDLE, not just this call — an
   * OTA carrying such an import would crash every device on load. That exact
   * failure already happened on this app: an About-screen change imported
   * expo-clipboard, which was not in the shipped binary, and the screen
   * crashed on module load until it was rewritten to use RN's own Share.
   *
   * So this returns a status the UI can render honestly, and when the store
   * SDK is added ahead of a binary cut, THIS is the only function that
   * changes:
   *
   *   iOS      expo-in-app-purchases or react-native-iap -> purchase(productId)
   *            then POST the signed transaction to verifyStorePurchase()
   *   Android  the same library's Play Billing path -> purchaseToken
   *            then POST it to verifyStorePurchase()
   *
   * The server side of both already exists and is tested (COS-790).
   */
  return { status: 'needs-store-sdk', productId: result.productId };
}

/** Human-readable, for the one place the UI has to explain itself. */
export function describeOutcome(outcome: LaunchOutcome): string {
  switch (outcome.status) {
    case 'opened-external':
      return 'Continue in your browser to finish subscribing.';
    case 'needs-store-sdk':
      return Platform.OS === 'ios'
        ? 'In-app subscribing needs a newer version of the app from the App Store.'
        : 'In-app subscribing needs a newer version of the app from Google Play.';
    case 'unsupported':
      return outcome.reason;
  }
}
