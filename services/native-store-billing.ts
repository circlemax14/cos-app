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

/**
 * COS-925 — the server verifies the receipt WHILE the store connection is open.
 *
 * Passed in rather than done by the caller afterwards, because finishTransaction
 * has to be called after verification and before the connection closes. Doing
 * it in two places meant it was done in neither: nothing in the app called
 * finishTransaction at all, so on Google every purchase would be auto-refunded
 * after three days while our backend went on honouring the plan, and on Apple
 * the transaction replays on every launch forever.
 */
export type VerifyReceipt = (proof: {
  productId: string;
  receipt: string;
  platform: 'ios' | 'android';
  transactionId?: string;
}) => Promise<{ applied: boolean }>;

export type StorePurchase =
  | {
      status: 'purchased';
      productId: string;
      /** The server confirmed it. False means the money moved but the plan has not landed. */
      applied: boolean;
    }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string };

/** Shape of the bits of react-native-iap this file uses. Kept local so the
 *  package's own types are never imported at module scope. */
interface IapSubscription {
  remove(): void;
}
interface IapLike {
  initConnection(): Promise<unknown>;
  endConnection(): Promise<unknown>;
  /**
   * COS-925 — 16.5's ACTUAL names. `getSubscriptions` and `requestSubscription`
   * were removed; calling them got `undefined is not a function` before the
   * sheet could open. See the header.
   */
  fetchProducts(args: { skus: string[]; type: 'subs' | 'in-app' }): Promise<unknown[]>;
  requestPurchase(args: {
    request: { apple?: { sku: string }; google?: { skus: string[] } };
    type: 'subs' | 'in-app';
  }): Promise<unknown>;
  /** The purchase arrives HERE, not from requestPurchase's promise. */
  purchaseUpdatedListener(cb: (purchase: unknown) => void): IapSubscription;
  purchaseErrorListener(cb: (err: unknown) => void): IapSubscription;
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
  verify: VerifyReceipt,
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

  let updated: IapSubscription | null = null;
  let failed: IapSubscription | null = null;

  try {
    await iap.initConnection();

    // Ask the store for the product first. A sku that is not configured comes
    // back as an empty list, and saying so beats a purchase dialog that fails
    // with a store error the patient cannot act on.
    const products = await iap.fetchProducts({ skus: [productId], type: 'subs' });
    if (!products || products.length === 0) {
      /*
       * COS-923 — naming the id is the whole diagnostic.
       *
       * An empty result means the store has never heard of this product, and
       * the causes look identical from here: the product does not exist in App
       * Store Connect, it exists under a DIFFERENT id than the plan carries,
       * it is not yet "Ready to Submit", or the Paid Applications Agreement is
       * not active. Printing the id we asked for is what tells those apart
       * without another build.
       */
      return {
        status: 'unavailable',
        reason: `The store has no product called "${productId}". Check it exists in App Store Connect, is Ready to Submit, that the Paid Applications Agreement is active, and that the id on the plan matches exactly.`,
      };
    }

    /*
     * COS-925 — THE PURCHASE ARRIVES ON A LISTENER, NOT FROM THE PROMISE.
     *
     * react-native-iap 16.5 documents requestPurchase as event-based, and says
     * of its return value: "Do not rely on it for the actual outcome." The old
     * code awaited it and read a receipt off the result, so even once the
     * function names were right it would have reported "the store did not
     * return a receipt" while StoreKit went on to charge the card — the worst
     * possible split between what we tell the patient and what their bank does.
     *
     * So the promise is used only to DISPATCH, and the outcome is whichever of
     * the two listeners fires first.
     */
    const outcome = await new Promise<
      { kind: 'ok'; purchase: RawPurchase } | { kind: 'err'; err: unknown }
    >((resolve) => {
      let settled = false;
      const once = (v: { kind: 'ok'; purchase: RawPurchase } | { kind: 'err'; err: unknown }) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      updated = iap!.purchaseUpdatedListener((p) => once({ kind: 'ok', purchase: p as RawPurchase }));
      failed = iap!.purchaseErrorListener((e) => once({ kind: 'err', err: e }));

      /*
       * A dispatch failure is delivered by throwing here on some paths and
       * through purchaseErrorListener on others (the docs call out Android's
       * `not-prepared`). Routing both into the same resolve means neither can
       * leave this promise hanging with the sheet already dismissed.
       */
      iap!
        .requestPurchase({
          request: { apple: { sku: productId }, google: { skus: [productId] } },
          type: 'subs',
        })
        .catch((err: unknown) => once({ kind: 'err', err }));
    });

    if (outcome.kind === 'err') {
      if (isUserCancelled(outcome.err)) return { status: 'cancelled' };
      throw outcome.err;
    }

    const purchase = outcome.purchase;
    // iOS hands back a base64 app receipt; Android a purchase token. The
    // server knows which it is from `platform` and verifies accordingly.
    const receipt = purchase.transactionReceipt ?? purchase.purchaseToken ?? '';
    if (!receipt) {
      return {
        status: 'unavailable',
        reason: 'The store did not return a receipt. Nothing has been charged.',
      };
    }

    const platform = Platform.OS === 'ios' ? ('ios' as const) : ('android' as const);
    let applied = false;
    try {
      const res = await verify({
        productId: purchase.productId ?? productId,
        receipt,
        platform,
        transactionId: purchase.transactionId,
      });
      applied = res.applied;
    } catch {
      /*
       * The money moved and we could not confirm it. Deliberately NOT finished:
       * an unfinished transaction is replayed by the store, which is the only
       * mechanism that can still settle this without charging again. Finishing
       * here to tidy up would throw away the patient's money.
       */
      return { status: 'purchased', productId: purchase.productId ?? productId, applied: false };
    }

    if (applied) {
      /*
       * Only now. finishTransaction tells the store we have delivered what was
       * bought, so it must follow the server's confirmation and never precede
       * it. Its failure does not change the outcome — the plan is already
       * granted — so it must not turn a completed purchase into an error.
       */
      try {
        await iap.finishTransaction({ purchase, isConsumable: false });
      } catch {
        /* the store will replay it; the verify endpoint is idempotent */
      }
    }

    return { status: 'purchased', productId: purchase.productId ?? productId, applied };
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
    // Listeners first: an endConnection that throws must not leave two live
    // subscriptions behind for the next attempt to double-fire on.
    try {
      (updated as IapSubscription | null)?.remove();
      (failed as IapSubscription | null)?.remove();
    } catch {
      /* best effort */
    }
    // Never let a teardown failure turn a completed purchase into an error.
    try {
      await iap?.endConnection();
    } catch {
      /* best effort */
    }
  }
}
