// tests/unit/payments-compliance.test.mjs — COS-791
//
// Structural guards on the payment path. These are not style checks: each one
// corresponds to a way this app can be REJECTED or CRASHED, and each has
// already happened to someone (one of them to us).
//
// 1. NO IN-APP BROWSER FOR CHECKOUT.
//    Opening a payment URL in a webview or SFSafariViewController collects
//    payment for digital content inside the binary — App Store Guideline
//    3.1.1, and the most common way apps fail review for payments. It works
//    perfectly in the simulator, so nothing else catches it before submission.
//    Both offending libraries are ALREADY INSTALLED here
//    (react-native-webview 13.16.0, expo-web-browser ~55.0.14), so the wrong
//    import is one autocomplete away and would build clean.
//
// 2. NO EAGER STORE-SDK IMPORT.
//    Metro resolves require() statically, so importing a package that is not
//    in the shipped binary breaks the BUNDLE — every device crashes on load,
//    not just the screen. That is not hypothetical: an About-screen change
//    imported expo-clipboard, which was not in build 62, and the screen
//    crashed on module load until it was rewritten to use RN's own Share.
//
// 3. THE SERVER DECIDES WHICH GATEWAY.
//    Which gateway is legal on which platform is a compliance decision. A
//    hardcoded client list drifts, and a drifted compliance decision is a
//    rejection.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const launcher = read('lib/launch-purchase.ts')
const api = read('services/api/payments.ts')
const hook = read('hooks/use-payment-gateways.ts')

/** Comments discuss the forbidden libraries at length; only code counts. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

const PAYMENT_PATH = { launcher, api, hook }

test('THE POINT: checkout never opens in an in-app browser', () => {
  for (const [name, src] of Object.entries(PAYMENT_PATH)) {
    const code = stripComments(src)
    assert.doesNotMatch(
      code,
      /from ['"]expo-web-browser['"]|require\(['"]expo-web-browser['"]\)/,
      `${name} imports expo-web-browser — openBrowserAsync is SFSafariViewController, which is still in-process and still Guideline 3.1.1`,
    )
    assert.doesNotMatch(
      code,
      /from ['"]react-native-webview['"]|require\(['"]react-native-webview['"]\)/,
      `${name} imports react-native-webview — a checkout in a webview is collected inside the binary`,
    )
  }
})

test('the redirect path hands off out of process', () => {
  const code = stripComments(launcher)
  assert.match(code, /import \{[^}]*\bLinking\b[^}]*\} from 'react-native'/)
  assert.match(code, /Linking\.openURL\(/)
  // canOpenURL first, so a device with no browser gets a message rather than
  // a silent no-op that reads as a broken button.
  assert.match(code, /Linking\.canOpenURL\(/)
})

test('there is exactly ONE place a payment URL is opened', () => {
  // Several call sites is how one of them ends up using the wrong opener.
  const opens = (stripComments(launcher).match(/Linking\.openURL\(/g) ?? []).length
  assert.equal(opens, 1, 'expected a single openURL call in the launcher')
})

test('THE POINT: no store SDK is imported until a binary ships with it', () => {
  const code = stripComments(launcher)
  for (const pkg of ['expo-in-app-purchases', 'react-native-iap', 'react-native-purchases']) {
    assert.doesNotMatch(
      code,
      new RegExp(`['"]${pkg}['"]`),
      `${pkg} is imported but is a NATIVE module — an OTA carrying this crashes every device on load`,
    )
  }
  // And the honest status the UI renders instead.
  assert.match(code, /needs-store-sdk/)
})

test('THE POINT: the server decides which gateways are available', () => {
  const code = stripComments(hook)
  // No hardcoded gateway list on the client.
  assert.doesNotMatch(code, /'apple-iap'\s*,\s*'google-play'/)
  assert.match(code, /fetchAvailableGateways/)
})

test('the platform is always sent, so the server can enforce legality', () => {
  const code = stripComments(api)
  assert.match(code, /platform: currentPlatform\(\)/)
  // Both the "what may I use" and the "start it" call must carry it —
  // enforcement on one and not the other is a hole.
  assert.equal((code.match(/currentPlatform\(\)/g) ?? []).length >= 2, true)
})

test('no way to pay is the DEFAULT, not an error state', () => {
  // A Subscribe button that cannot complete is worse than none, and on iOS it
  // is the thing that gets an app rejected.
  const code = stripComments(hook)
  assert.match(code, /const gateways = q\.data \?\? \[\]/)
  assert.match(code, /canPay: gateways\.length > 0/)
})

// ── COS-792: cancellation semantics on the client ─────────────────────────

const billing = read('app/Home/billing.tsx')

test('THE POINT: a cancelling patient is shown the DATE, not just "cancelled"', () => {
  // They keep everything until the period ends — up to eleven months for an
  // annual plan. The word "cancelled" alone would alarm someone who has lost
  // nothing yet, and hide the one fact that matters.
  assert.match(billing, /cancelAtPeriodEnd === true/)
  assert.match(billing, /Ends on \$\{endsOn\}/)
  assert.match(billing, /you keep everything until then/)
})

test('a pending cancellation can be undone', () => {
  assert.match(billing, /Keep my plan/)
  assert.match(billing, /resumeSubscription/)
})

test('the free default plan offers no cancel control', () => {
  // Nothing to cancel, and offering it implies there is something to lose.
  assert.match(billing, /!cancelling && !billing\.isDefaultPlan/)
})

test('a store cancellation sends the patient to the store, not a dead message', () => {
  // Apple and Google cannot be cancelled server-side, so a message the patient
  // has to act on later is a subscription that never actually stops.
  assert.match(billing, /out\.manageUrl/)
  assert.match(billing, /Linking\.openURL\(out\.manageUrl\)/)
})
