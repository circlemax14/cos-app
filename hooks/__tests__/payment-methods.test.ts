/**
 * COS-793 — the branch that decides whether we ask the patient anything.
 *
 * IMPORT STRATEGY: same as the other hook tests here. The React hook pulls in
 * react-query and the axios client, neither of which resolve under
 * `node --test`, so this covers the PURE decision it delegates to.
 * services/payments-provider.ts has no runtime imports precisely so this file
 * can load it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidePaymentChoice,
  getPaymentProvider,
  registerStoreBilling,
  type PaymentChoice,
} from '../../services/payments-provider.ts';

const stripe = { id: 'stripe', kind: 'redirect' } as const;
const apple = { id: 'apple-iap', kind: 'native' } as const;
const play = { id: 'google-play', kind: 'native' } as const;

test('nothing offered → no way to pay, and no button to render', () => {
  const choice = decidePaymentChoice([]);
  assert.equal(choice.mode, 'none');
  assert.deepEqual(choice.methods, []);
});

test('one usable method → do not ask, name it', () => {
  const choice = decidePaymentChoice([stripe]);
  assert.equal(choice.mode, 'single');
  assert.equal(choice.usable[0]?.id, 'stripe');
  assert.equal(choice.usable[0]?.usable, true);
});

test('iOS today: Apple offered but not in this build → single, and Apple still explained', () => {
  const choice = decidePaymentChoice([apple, stripe]);
  assert.equal(choice.mode, 'single', 'one usable method must not stage a choice');
  assert.equal(choice.usable[0]?.id, 'stripe');
  const shown = choice.methods.find((m) => m.id === 'apple-iap');
  assert.equal(shown?.usable, false);
  assert.match(String(shown?.reason), /App Store/, 'an option must never vanish unexplained');
});

test('server offers only a method this build cannot finish → none, never a dead button', () => {
  const choice = decidePaymentChoice([play]);
  assert.equal(choice.mode, 'none');
  assert.equal(choice.methods.length, 1);
  assert.equal(choice.methods[0]?.usable, false);
});

test('the drop-in: a linked StoreKit flips the screen to a real choice', () => {
  /*
   * COS-893 — this used to assign `provider.unavailableReason = null` to
   * simulate the drop-in. That field is now a GETTER over the registered store
   * binding, so the assignment stopped meaning anything. Registering a binding
   * that reports itself linked is the same simulation done through the seam
   * the app actually uses — a closer test than the one it replaces.
   */
  registerStoreBilling({
    isLinked: () => true,
    purchase: () => Promise.resolve({ status: 'cancelled' as const }),
  });
  try {
    assert.equal(getPaymentProvider('apple-iap')?.unavailableReason, null);
    const choice: PaymentChoice = decidePaymentChoice([apple, stripe]);
    assert.equal(choice.mode, 'choose');
    // registry.ts: the server's order is a preference contract, not a set.
    assert.deepEqual(
      choice.usable.map((m) => m.id),
      ['apple-iap', 'stripe'],
    );
  } finally {
    registerStoreBilling(null);
  }
});

test('with NO binding registered the store methods stay unavailable, with a reason', () => {
  // This is every unit test, and every binary built before the SDK landed.
  registerStoreBilling(null);
  const provider = getPaymentProvider('apple-iap');
  assert.ok(provider?.unavailableReason);
  assert.match(provider.unavailableReason, /App Store update/);
});

test('an unregistered provider still refuses to purchase rather than throwing', async () => {
  registerStoreBilling(null);
  const result = await getPaymentProvider('apple-iap')?.purchase('advanced-monthly');
  assert.equal(result?.status, 'unavailable');
});

test('a gateway id this build has never heard of is dropped, not rendered nameless', () => {
  const choice = decidePaymentChoice([{ id: 'paypal', kind: 'redirect' } as never, stripe]);
  assert.equal(choice.methods.length, 1);
  assert.equal(choice.methods[0]?.id, 'stripe');
});

test('a server-supplied label wins over the built-in one', () => {
  const choice = decidePaymentChoice([{ ...stripe, label: 'Credit or debit card' }]);
  assert.equal(choice.methods[0]?.label, 'Credit or debit card');
});
