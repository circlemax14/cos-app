/**
 * COS-925 — the store call surface must exist in the INSTALLED SDK.
 *
 * ─── THE BUG THIS EXISTS FOR ─────────────────────────────────────────
 *
 * services/native-store-billing.ts called `getSubscriptions` and
 * `requestSubscription`. react-native-iap removed both; 16.5 exports
 * `fetchProducts` and `requestPurchase`. So every Apple purchase died on
 * `undefined is not a function` before the sheet could open, and the patient
 * was told "the store could not complete that purchase, nothing has been
 * charged" — a sentence that pointed at App Store Connect, which was fine.
 *
 * Nothing caught it. The SDK is required lazily inside a try/catch (correct —
 * importing it at module scope is a different bug), the local `IapLike`
 * interface declared the old names so tsc was happy to check the calls against
 * our own fiction, and no test could exercise the path without a device.
 *
 * A wrong method name on a payment path costs an archive and a TestFlight
 * round trip to discover. This closes that: it reads the names our code calls
 * and asserts each one is really exported by the version in node_modules.
 *
 * ─── WHY THIS IS NOT A MOCK ──────────────────────────────────────────
 *
 * It deliberately reads the SDK's own type declarations rather than a fixture.
 * A fixture would be a fourth copy of the same fiction, and would go stale in
 * exactly the way `IapLike` did. When react-native-iap is upgraded and renames
 * something again, this test fails on `npm install`, not in Vishal's hands.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const SRC = read('services/native-store-billing.ts')
/*
 * Comment-stripped, for the negative assertions only.
 *
 * Fifth time this week: the prose EXPLAINING what was removed satisfies a grep
 * looking for what was removed. The comment naming `getSubscriptions` as the
 * bug is exactly what a doesNotMatch(/getSubscriptions/) finds.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const DTS_PATH = 'node_modules/react-native-iap/lib/typescript/src/index.d.ts'

test('every react-native-iap function we call is exported by the installed version', () => {
  const dtsUrl = new URL(`../../${DTS_PATH}`, import.meta.url)
  if (!existsSync(dtsUrl)) {
    // Never fail the suite because someone has not installed yet — that would
    // train people to ignore this file, which is the opposite of its job.
    assert.ok(true, 'react-native-iap not installed; nothing to check')
    return
  }
  const dts = readFileSync(dtsUrl, 'utf8')
  const exported = new Set(
    [...dts.matchAll(/declare (?:const|function) ([A-Za-z0-9_]+)/g)].map((m) => m[1]),
  )

  // Every `iap.something(` in the source is a call into the SDK.
  const called = [...CODE.matchAll(/\biap!?\.([A-Za-z0-9_]+)\(/g)].map((m) => m[1])
  assert.ok(called.length > 0, 'expected to find SDK calls to check')

  for (const fn of new Set(called)) {
    assert.ok(
      exported.has(fn),
      `native-store-billing.ts calls iap.${fn}(), which react-native-iap does not export. ` +
        `This is the COS-925 bug: the call fails at runtime and the patient is told the ` +
        `store refused the purchase. Exports include: ${[...exported].slice(0, 12).join(', ')}…`,
    )
  }
})

test('the names that were WRONG cannot come back', () => {
  // Belt and braces, and it documents what went wrong for the next reader.
  // These are the v12-era names; they read as plausible and are not.
  assert.doesNotMatch(CODE, /\bgetSubscriptions\b/)
  assert.doesNotMatch(CODE, /\brequestSubscription\b/)
})

test('THE POINT: the purchase is read from the listener, not the promise', () => {
  /*
   * react-native-iap documents requestPurchase as event-based and says of its
   * return value: "Do not rely on it for the actual outcome."
   *
   * Awaiting it and reading a receipt off the result is worse than the wrong
   * method name, because it fails QUIETLY: the app reports "the store did not
   * return a receipt, nothing has been charged" while StoreKit goes on to
   * charge the card. That is the one failure mode a payment path must never
   * have — our story and the patient's bank statement disagreeing.
   */
  assert.match(SRC, /purchaseUpdatedListener\(/)
  assert.match(SRC, /purchaseErrorListener\(/)
  // The dispatch promise is used only to catch a dispatch failure, never for
  // the outcome — so it must not be the thing a receipt is read from.
  assert.doesNotMatch(CODE, /const\s+\w+\s*=\s*await iap!?\.requestPurchase/)
})

test('THE POINT: finishTransaction follows the server, and only on success', () => {
  /*
   * Nothing in the app called finishTransaction at all. On Google that is an
   * automatic refund after three days on a plan we go on honouring; on Apple
   * the transaction replays on every launch forever.
   *
   * It must also never run before verification: finishing first means a
   * purchase the store considers settled that our backend never saw — the
   * patient paid and got nothing, with no replay left to recover it.
   */
  assert.match(SRC, /finishTransaction\(\{ purchase, isConsumable: false \}\)/)
  const verifyAt = SRC.indexOf('await verify(')
  const finishAt = SRC.indexOf('finishTransaction({ purchase')
  assert.ok(verifyAt >= 0, 'expected the server verify step to be present')
  assert.ok(finishAt >= 0, 'expected finishTransaction to be called')
  assert.ok(verifyAt < finishAt, 'finishTransaction must come AFTER the server verifies')
  // And it is inside the `applied` branch, so an unverified purchase stays
  // unfinished and the store replays it.
  assert.match(SRC, /if \(applied\) \{[\s\S]{0,400}?finishTransaction/)
})

test('a failed verify leaves the transaction unfinished on purpose', () => {
  // The money moved and we could not confirm it. An unfinished transaction is
  // the ONLY mechanism that can still settle this without charging again, so
  // tidying up here would throw away the patient's money.
  assert.match(SRC, /return \{ status: 'purchased', productId: purchase\.productId \?\? productId, applied: false \}/)
})
