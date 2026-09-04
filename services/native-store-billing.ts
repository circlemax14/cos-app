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

import { NativeModules, Platform } from 'react-native';

/** The native binding each library registers when it is linked into a build. */
const IAP_NATIVE_MODULES = ['RNIapModule', 'RNIapIosModule', 'RNIapAmazonModule'] as const;

/**
 * Is the native half of react-native-iap in THIS binary?
 *
 * Deliberately not a try/require: requiring is the thing that is unsafe.
 * NativeModules is a plain object on the bridge and reading a missing key is
 * just `undefined`. Wrapped anyway — on a bridgeless / new-architecture runtime
 * the proxy can throw for an unknown name.
 */
export function isStoreBillingLinked(): boolean {
  try {
    const mods = NativeModules as unknown as Record<string, unknown>;
    return IAP_NATIVE_MODULES.some((name) => !!mods[name]);
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
      return {
        status: 'unavailable',
        reason: 'That plan is not available in the store yet. Please try again later.',
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
    return {
      status: 'unavailable',
      reason: 'The store could not complete that purchase. Nothing has been charged.',
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
