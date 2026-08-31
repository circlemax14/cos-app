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
const cards = read('components/plan/PlanStatusSection.tsx')

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

// ── COS-794: the iOS external purchase link ───────────────────────────────

test('THE POINT: the region is sent, and its absence blocks the link-out', () => {
  // Apple permits an external purchase link in the US storefront ONLY. The
  // server fails closed on an absent region, so the client must actually send
  // one — but sending nothing is safe, not broken.
  const code = stripComments(api)
  assert.match(code, /region: currentRegion\(\)/)
  assert.equal((code.match(/region: currentRegion\(\)/g) ?? []).length, 2,
    'both the gateway list and the start call must carry the region')
  assert.match(code, /export function currentRegion\(\): string \| undefined/)
})

test('THE POINT: the region comes from JS, never a native module', () => {
  // expo-localization is the obvious library and is neither installed nor in
  // the shipped binary — importing it would break the OTA bundle and crash
  // every device on load, which this app has already had happen once.
  const code = stripComments(api)
  assert.doesNotMatch(code, /['"]expo-localization['"]/)
  assert.match(code, /Intl\.DateTimeFormat\(\)/)
})

test('region detection never throws out to the caller', () => {
  // A locale lookup failing must cost the link-out, not the whole screen.
  const body = api.slice(api.indexOf('export function currentRegion'))
  assert.equal((body.match(/catch/g) ?? []).length >= 2, true)
  assert.match(body, /return undefined/)
})

// ── COS-797: switching plan with no payment ───────────────────────────────

test('THE POINT: free switching is hidden the moment Subscribe appears', () => {
  // Both flags are independent server-side, so leaving this on with payments
  // enabled means the free route still works over the API. Hiding it is the
  // safe half; the flag itself is meant to go off in the same change.
  const code = stripComments(cards)
  assert.match(code, /usePlanSelfSwitchFlag\(\) && !subscribeEnabled/)
})

test('the switch button is offered, and says which plan', () => {
  const code = stripComments(cards)
  assert.match(code, /Switch to this plan/)
  assert.match(code, /switchToPlan\(planKey\)/)
})

test('a refused switch is shown, not swallowed', () => {
  // PLAN_NOT_AVAILABLE and HAS_PAID_SUBSCRIPTION both come back as 409 with a
  // real message. Dropping it leaves a button that looks broken.
  const code = stripComments(cards)
  assert.match(code, /setSwitchError/)
  assert.match(code, /switchError !== null/)
})

test('the shelf refetches after a switch, so the badge moves', () => {
  const code = stripComments(cards)
  assert.match(code, /invalidateQueries\(\{ queryKey: \['patient-plans'\] \}\)/)
})
