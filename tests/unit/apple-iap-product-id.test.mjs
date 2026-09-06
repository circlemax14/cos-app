/**
 * COS-920 — StoreKit is asked for the APP STORE product id, not the plan key.
 *
 * The native branch passed `order.planKey` straight to the store. A plan key
 * is `advanced`; an App Store Connect product id is reverse-DNS, e.g.
 * `ai.circlesupporthealth.advanced.monthly`. Different namespaces, and only
 * the server knows the mapping — it is on plan.pricing.appleProductIdMonthly.
 *
 * So getSubscriptions() would have been asked for a product that does not
 * exist, returned [], and every Apple purchase would have failed with "That
 * plan is not available in the store yet" — however correctly the products
 * were configured in App Store Connect. It would have looked like an Apple
 * problem, on a build that takes hours to cut.
 *
 * POST /v1/payments/start already returned `{ kind: 'native', productId }`.
 * The endpoint existed for this and nothing called it.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const hook = code('hooks/use-payment-methods.ts')

test('THE POINT: the plan key never reaches the store', () => {
  assert.doesNotMatch(hook, /purchase\(order\.planKey\)/)
  // COS-925 — purchase() gained a second argument (the server verify step,
  // which must run while the store connection is open). The property is
  // unchanged and is what this asserts: the SERVER's product id is what
  // reaches the store, never `order.planKey`.
  assert.match(hook, /provider\?\.purchase\(productId,/)
})

test('the product id comes from the server, per plan AND cycle', () => {
  assert.match(hook, /await startPurchase\(\{/)
  assert.match(hook, /gateway: method\.id/)
  assert.match(hook, /planKey: order\.planKey/)
  assert.match(hook, /cycle: order\.cycle/)
})

test('a non-native answer is refused, not guessed at', () => {
  // A redirect handled as a native purchase charges nothing and reports
  // success — the worst possible failure for a payment path.
  assert.match(hook, /if \(started\.kind !== 'native'\)/)
})

test('a failed start does not leak the server message', () => {
  // payments.routes.ts builds NOT_CONFIGURED messages that name SSM parameter
  // paths. Those are for logs, never for a patient.
  const branch = hook.slice(hook.indexOf('await startPurchase'))
  assert.match(branch, /catch \{[\s\S]{0,200}We could not start that purchase/)
})

test('the receipt still goes to the server before anything is granted', () => {
  // The store charging a card grants nothing on its own.
  assert.match(hook, /verifyStorePurchase\(/)
})

test('and the redirect path is untouched — it has its own compliance guard', () => {
  assert.match(hook, /launchPurchase\(\{/)
})

/**
 * COS-921 — detect the store the way this library actually registers.
 *
 * react-native-iap 16.5 is a NITRO module. Its JS calls
 * NitroModules.createHybridObject('RnIap') and registers nothing on the legacy
 * bridge, so NativeModules.RNIapModule — the 12.x-era name this checked — is
 * undefined EVEN IN A CORRECT BUILD. Apple IAP would have said "not in this
 * version of the app" forever, on a binary that takes an archive to test.
 */
const billing = code('services/native-store-billing.ts')

test('THE POINT: it no longer looks for a bridge module that cannot exist', () => {
  assert.doesNotMatch(billing, /RNIapModule|RNIapIosModule|RNIapAmazonModule/)
  assert.doesNotMatch(billing, /NativeModules/)
})

test('it probes Nitro with get(), which returns null rather than throwing', () => {
  // getEnforcing throws on a miss — and nitro's own resolver uses it at module
  // scope, which is exactly why this must not import nitro to ask.
  assert.match(billing, /TurboModuleRegistry\.get\('NitroModules'\)/)
  assert.doesNotMatch(billing, /getEnforcing/)
})

test('the require stays wrapped — Nitro present does not prove NitroIap is', () => {
  // If Nitro is linked but the IAP pod is not, requiring react-native-iap
  // throws; caught, it gives the same honest "unavailable" answer.
  assert.match(
    billing,
    /try \{\s*iap = require\('react-native-iap'\) as IapLike;\s*\} catch \{\s*return \{ status: 'unavailable'/,
  )
})

test('and an unlinked build still reports unavailable rather than crashing', () => {
  assert.match(billing, /if \(!isStoreBillingLinked\(\)\) \{\s*\n\s*return \{ status: 'unavailable'/)
})
