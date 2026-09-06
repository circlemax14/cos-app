/**
 * COS-893 — StoreKit / Play Billing, reached ONLY when the binary has them.
 *
 * ─── THE RULE THIS FILE EXISTS TO KEEP ───────────────────────────────
 *
 * `react-native-iap` is a native module. Its JavaScript half ships in the
 * bundle the moment it is a dependency; its native half only exists in a
 * binary built after it was added. An OTA carries the first and not the
 * second, so the JS lands on 1.5.2 handsets that have no native side at all.
 *
 * Requiring it there is what crashes the app — the same shape as the
 * expo-clipboard outage on the About screen. So nothing in this file is
 * imported at module scope. `NativeModules` is core React Native and always
 * present; it is asked whether the native half is linked, and the library is
 * required only after the answer is yes.
 *
 * Net effect: on today's binary every call returns `unavailable` with a
 * reason, exactly as before this file existed. On tomorrow's 2.1.0 build the
 * same code path finds the module and buys.
 *
 * ─── WHAT IT DOES NOT DO ─────────────────────────────────────────────
 *
 * It does not grant anything. A store purchase returns a receipt/token, and
 * entitlement follows only after POST /v1/payments/verify has checked it with
 * Apple or Google server-side. A client that grants on its own word is a
 * client that can be told to lie.
 */

import { Platform, TurboModuleRegistry } from 'react-native';

/**
 * COS-921 — react-native-iap 16.5 is a NITRO module, not a bridge module.
 *
 * This checked NativeModules.RNIapModule / RNIapIosModule / RNIapAmazonModule.
 * Those names belong to react-native-iap 12.x and earlier. 16.5 registers
 * nothing on the legacy bridge — its JS calls
 * `NitroModules.createHybridObject('RnIap')` (node_modules/react-native-iap/
 * lib/module/index.js:73) — so all three reads would have been `undefined`
 * EVEN IN A CORRECT 2.1.0 BUILD, and Apple IAP would have reported "not in
 * this version of the app" permanently.
 *
 * That is a bug you can only find by shipping a binary, which is exactly the
 * cost this check exists to avoid.
 *
 * `TurboModuleRegistry.get` — not `getEnforcing` — is the safe probe. It
 * returns null rather than throwing when the module is absent, and
 * TurboModuleRegistry is React Native core, present on every build. Nitro
 * itself resolves the same way and THROWS on a miss (its
 * turbomodule/NativeNitroModules.js calls getEnforcing at module scope), which
 * is precisely why this must not import nitro to ask the question.
 *
 * Nitro being present does not prove NitroIap is. It does not have to: this
 * only guards the require below, and that require is wrapped — if Nitro is
 * linked but the IAP pod is not, requiring react-native-iap throws and is
 * caught, giving the same honest "unavailable" answer.
 */
export function isStoreBillingLinked(): boolean {
  try {
    return TurboModuleRegistry.get('NitroModules') != null;
  } catch {
    return false;
  }
}

export type StorePurchase =
  | {
      status: 'purchased';
      productId: string;
      receipt: string;
      platform: 'ios' | 'android';
      transactionId?: string;
    }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string };

/** Shape of the bits of react-native-iap this file uses. Kept local so the
 *  package's own types are never imported at module scope. */
interface IapLike {
  initConnection(): Promise<unknown>;
  endConnection(): Promise<unknown>;
  requestSubscription(args: { sku: string }): Promise<unknown>;
  getSubscriptions(args: { skus: string[] }): Promise<unknown[]>;
  finishTransaction(args: { purchase: unknown; isConsumable: boolean }): Promise<unknown>;
}

interface RawPurchase {
  productId?: string;
  transactionReceipt?: string;
  purchaseToken?: string;
  transactionId?: string;
}

/** A user cancelling is not an error to report — it is an outcome. */
function isUserCancelled(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  const message = String((err as { message?: string })?.message ?? '');
  return (
    code === 'E_USER_CANCELLED' ||
    /cancel/i.test(code) ||
    /cancell?ed/i.test(message)
  );
}

/**
 * Buy `productId` through the platform store.
 *
 * The connection is opened and closed around the single purchase rather than
 * held for the life of the app: this runs at most a few times per patient, and
 * a long-lived store connection is a background listener we would then have to
 * reason about on every screen.
 */
export async function purchaseThroughStore(
  productId: string,
  unavailableReason: string,
): Promise<StorePurchase> {
  if (!isStoreBillingLinked()) {
    return { status: 'unavailable', reason: unavailableReason };
  }

  let iap: IapLike | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see the header: requiring at module scope is the bug this avoids
    iap = require('react-native-iap') as IapLike;
  } catch {
    return { status: 'unavailable', reason: unavailableReason };
  }

  try {
    await iap.initConnection();

    // Ask the store for the product first. A sku that is not configured comes
    // back as an empty list, and saying so beats a purchase dialog that fails
    // with a store error the patient cannot act on.
    const products = await iap.getSubscriptions({ skus: [productId] });
    if (!products || products.length === 0) {
      /*
       * COS-923 — naming the id is the whole diagnostic.
       *
       * An empty result means the store has never heard of this product, and
       * the three causes look identical from here: the product does not exist
       * in App Store Connect, it exists under a DIFFERENT id than the plan
       * carries, or it is not yet "Ready to Submit". Printing the id we asked
       * for is what tells those apart without another build.
       */
      return {
        status: 'unavailable',
        reason: `The store has no product called "${productId}". Check it exists in App Store Connect, is Ready to Submit, and that the id on the plan matches exactly.`,
      };
    }

    const result = (await iap.requestSubscription({ sku: productId })) as
      | RawPurchase
      | RawPurchase[]
      | null;
    const purchase = Array.isArray(result) ? result[0] : result;

    // iOS hands back a base64 app receipt; Android a purchase token. The
    // server knows which it is from `platform` and verifies accordingly.
    const receipt = purchase?.transactionReceipt ?? purchase?.purchaseToken ?? '';
    if (!purchase || !receipt) {
      return {
        status: 'unavailable',
        reason: 'The store did not return a receipt. Nothing has been charged.',
      };
    }

    /*
     * finishTransaction is NOT called here. The receipt has to be verified by
     * the server first — finishing before that means a purchase Apple considers
     * settled and our backend never saw, which is an entitlement the patient
     * paid for and did not get. The verify path finishes it.
     */
    return {
      status: 'purchased',
      productId: purchase.productId ?? productId,
      receipt,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      transactionId: purchase.transactionId,
    };
  } catch (err) {
    if (isUserCancelled(err)) return { status: 'cancelled' };
    /*
     * COS-923 — say what the STORE said.
     *
     * This returned a fixed sentence and dropped `err` on the floor, so
     * "products not created yet", "no sandbox account signed in", "this
     * Apple ID cannot purchase" and "the agreement is not active" were all
     * indistinguishable — and every one of them needs a different fix, on a
     * path that costs an archive to retry.
     *
     * Vishal hit exactly that: "it is saying store could not complete that
     * purchase, nothing has been charged", with nothing to act on.
     *
     * StoreKit's message is Apple's own, written for a person, and carries no
     * PHI — it is about a product id and an App Store account. The generic
     * sentence stays as the lead so the patient still knows nothing was
     * charged; the reason follows it.
     */
    const detail =
      (err as { message?: string })?.message?.trim() ??
      (err as { code?: string })?.code ??
      '';
    return {
      status: 'unavailable',
      reason: detail
        ? `The store could not complete that purchase — ${detail}. Nothing has been charged.`
        : 'The store could not complete that purchase. Nothing has been charged.',
    };
  } finally {
    // Never let a teardown failure turn a completed purchase into an error.
    try {
      await iap?.endConnection();
    } catch {
      /* best effort */
    }
  }
}
