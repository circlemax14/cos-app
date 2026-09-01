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

test('THE POINT: both controls hang off the REAL gateway list, not a flag', () => {
  // COS-798. subscription_upgrade_enabled means "the upgrade button is
  // un-darked", NOT "a patient can pay". On dev it has been true since COS-740
  // with every gateway off, and keying off it produced two dead ends: a paid
  // plan offered Subscribe and landed on "payments aren't available", and a
  // free plan showed nothing at all.
  const code = stripComments(cards)
  //
  // COS-801 moved both expressions into the exported usePlanChoiceControls
  // hook so the Care Plan tab can ask the same question. Same two rules,
  // one definition — asserted on the hook rather than on inline consts.
  assert.match(code, /const \{ canPay \} = usePaymentGateways\(\)/)
  assert.match(code, /canSubscribe: subscribeEnabled && canPay/)
  assert.match(code, /canSwitch: selfSwitchEnabled && !canPay/)
  assert.match(code, /const selfSwitchEnabled = usePlanSelfSwitchFlag\(\)/)
})

test('THE POINT: exactly one of Subscribe / Switch can ever be offered', () => {
  // canSubscribe requires canPay; canSwitch requires !canPay. They cannot both
  // be true, so a patient is never shown two ways to get the same plan — one
  // of which charges them.
  //
  // COS-804 moved the Switch control out of the expander and onto the card,
  // so the shape changed but the exclusivity did not: Subscribe still lives
  // behind canSubscribe, Switch behind canSwitch, and the two flags cannot
  // both be true.
  const code = stripComments(cards)
  assert.match(code, /canSubscribe && monthly/)
  assert.match(code, /canSubscribe && annual/)
  assert.match(code, /!current && !comingSoon && canSwitch && \(/)
  // ...and exactly ONE control fires the switch. Two would be VoiceOver
  // reading the same action twice, which is what COS-804 removed.
  assert.equal(
    (code.match(/onSwitch\(plan\.planKey\)/g) ?? []).length,
    1,
    'expected exactly one Switch control per card',
  )
})

test('a free plan is never a dead end', () => {
  // The Subscribe buttons need a price, so on a free plan they never render.
  // The fallback explanation must therefore not be gated on the subscribe
  // flag — it is gated on neither control being available.
  // COS-809 hoisted it out of the expander, which switch-mode no longer has.
  const code = stripComments(cards)
  assert.match(code, /\{!current && !comingSoon && !canSubscribe && !canSwitch && \(/)
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

// ── COS-799: switching stays reachable after the first switch ─────────────

test('THE POINT: the Billing screen can switch, not just subscribe', () => {
  // The Plan tab collapses to a chip once a patient has chosen a plan
  // (COS-788, still right — that tab is about care, not shopping). Its
  // "Change plan" lands here. If this screen cannot switch, a patient who
  // switches once can never switch again.
  assert.match(billing, /canSwitch && !plan\.isCurrent && isPurchasable\(plan\)/)
  assert.match(billing, /onSwitchPlan\(plan\.planKey\)/)
})

test('the Billing screen uses the same canPay rule as the shelf', () => {
  // COS-798 fixed this in PlanStatusSection only; billing.tsx still had the
  // un-darkening flag on its own, which is the same dead end.
  assert.match(billing, /const canSubscribe = upgradeEnabled && canPay/)
  assert.match(billing, /const canSwitch = usePlanSelfSwitchFlag\(\) && !canPay/)
})

test('THE POINT: a refusal shows the server\'s sentence, not a status code', () => {
  // "Request failed with status code 409" is what axios gives you. The server
  // wrote "You have an active paid subscription. Cancel it first…" for exactly
  // this moment.
  const helper = read('lib/server-message.ts')
  assert.match(helper, /status >= 400 && status < 500/)
  assert.match(helper, /return fallback/)
  for (const [name, src] of [['billing', billing], ['cards', cards]]) {
    assert.match(stripComments(src), /serverMessage\(err,/, `${name} should use serverMessage`)
    assert.doesNotMatch(
      stripComments(src),
      /err instanceof Error \? err\.message :/,
      `${name} still swallows the server message`,
    )
  }
})

test('a 5xx body is never shown to a patient', () => {
  // Server error text is for us and may carry internals.
  const helper = read('lib/server-message.ts')
  assert.doesNotMatch(helper, /status >= 500/)
})

// ── COS-801: the chooser is a door, not a header ──────────────────────────

test('THE POINT: a chosen plan does not hide the chooser while switching is on', () => {
  // Collapsing to a chip made leaving the default plan a ONE-WAY DOOR — the
  // chooser vanished the moment a patient used it, and the only route back was
  // two taps away on a screen most never open.
  //
  // COS-800 held the door open by never collapsing the strip, which put a
  // price list back on top of the care plan. COS-801 keeps the door open
  // somewhere better: the Care Plan tab OPENS on the chooser while switching
  // is on. Same guarantee — a patient can always reach the other plans from
  // the tab — without the shelf living on the plan screen.
  // COS-803 moved the door off the classic Care Plan tab and onto Plan+, so
  // the tab patients already rely on is untouched while this is figured out.
  const tab = read('app/Home/care-plan-plus.tsx')
  assert.match(tab, /const showPlanGate =\s*\n\s*canSwitch &&/)
  assert.match(tab, /if \(showPlanGate\) \{/)
  // And the shelf must actually render its cards there, not collapse to the
  // one-line strip — which is exactly what it would do for a patient who has
  // already picked.
  assert.match(tab, /variant="chooser"/)
  assert.match(cards, /variant === 'strip' && billing\?\.planName && billing\.isDefaultPlan !== true/)
})

test('THE POINT: the door is alive in PRODUCTION, not just on dev', () => {
  // The Care Plan tab has two completely different bodies behind
  // isTabSwapBpsEnabled() — BPS in production, the legacy screen on dev — and
  // every PlanStatusSection mount below that branch is dead code in prod.
  // Two OTAs have already shipped UI into that dead arm. The gate returns
  // ABOVE the branch so it serves both.
  // COS-803: Plan+ is its own route and always renders the BPS screen, so
  // there is no tab-swap branch here to get behind. What has to hold now is
  // that the CLASSIC tab carries no gate at all — that is the guarantee the
  // second tab exists to provide.
  const classic = read('app/Home/health-plan.tsx')
  assert.doesNotMatch(classic, /showPlanGate/)
  assert.doesNotMatch(classic, /entitlementGating/)
  assert.match(read('app/Home/care-plan-plus.tsx'), /entitlementGating\s*\/>|entitlementGating$/m)
})

test('nobody is held at the door', () => {
  // A chooser you cannot walk past is worse than no chooser. Two ways out:
  // pick a plan, or skip.
  // COS-806 moved the exit out of a corner pill and onto the card badged
  // YOUR PLAN, so the copy now lives in the shelf component.
  const tab = read('app/Home/care-plan-plus.tsx')
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(tab, /onGoToPlan=\{\(\) => setPlanGateBypassed\(true\)\}/)
  assert.match(cards, /Go to your plan/)
  // Switching closes it too — "once the plan is switched ... show that
  // original screen". Without this the patient picks and stays on the shelf.
  assert.match(tab, /onSwitched=\{\(\) => setPlanGateBypassed\(true\)\}/)
  assert.match(cards, /onSwitched\?\.\(\)/)
})

test('the door stops appearing on its own when payments land', () => {
  // canSwitch is `selfSwitch && !canPay`, so enabling a gateway removes the
  // gate and restores COS-788's chip with no code change. That is the property
  // worth having — not a flag someone has to remember to unset.
  const code = stripComments(cards)
  assert.match(code, /canSwitch: selfSwitchEnabled && !canPay/)
  const tab = stripComments(read('app/Home/care-plan-plus.tsx'))
  assert.match(tab, /const showPlanGate =\s*\n\s*canSwitch &&/)
})

test('an empty shelf is not a wall', () => {
  // No cards means nothing to choose between. Showing the door anyway would
  // put a blank screen in front of the care plan.
  const tab = read('app/Home/care-plan-plus.tsx')
  assert.match(tab, /patientPlansQuery\.data\?\.plans\?\.length \?\? 0\) > 0/)
})

test('the heading says Change, not Choose, once they have a plan', () => {
  assert.match(cards, /isDefaultPlan === false \? 'Change your plan' : 'Choose your plan'/)
})
