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
  //
  // COS-924 — the flag this test is about is subscription_upgrade_enabled,
  // and the PAID control still hangs off the real gateway list: canSubscribe
  // is still `subscribeEnabled && canPay`, so the first dead end (Subscribe
  // offered, then "payments aren't available") still cannot happen.
  //
  // canSwitch dropped `&& !canPay` because switching costs nothing, so no
  // gateway has to exist for it — see the exclusivity test below, where the
  // card's own price now decides which control it gets. The second dead end
  // (a free plan showing nothing at all) is therefore further away than
  // before, not closer: a free card offers Switch whether or not a gateway is
  // live. The gateway list still drives the automatic chooser, which keeps
  // the old expression under its own name.
  assert.match(code, /const \{ canPay \} = usePaymentGateways\(\)/)
  assert.match(code, /canSubscribe: subscribeEnabled && canPay/)
  assert.match(code, /canSwitch: selfSwitchEnabled,/)
  assert.match(code, /autoOpenChooser: selfSwitchEnabled && !canPay/)
  assert.match(code, /const selfSwitchEnabled = usePlanSelfSwitchFlag\(\)/)
  // The regression this test exists to catch: the paid control keyed off the
  // un-darkening flag alone, with no gateway behind it.
  assert.doesNotMatch(
    code,
    /canSubscribe: subscribeEnabled[,\n]/,
    'canSubscribe must require canPay, not just subscription_upgrade_enabled',
  )
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
  //
  // COS-924 moved the exclusivity from the PLATFORM to the CARD, because the
  // platform-wide version could only ever say "nobody switches" or "nobody
  // buys" — turning on Apple IAP took Switch off the free plans too. The
  // property is unchanged and now holds by construction: one boolean per
  // card, `costsMoney`, and the two controls read opposite sides of it. No
  // combination of flags can put both on one card.
  const code = stripComments(cards)
  // Derived from the PRICE, not the formatted price line: trial-30d carries
  // monthlyPriceCents 0 and formats as "$0", so a truthiness test on the
  // label would call a free plan paid and offer to charge for it.
  assert.match(code, /const \{ monthlyPaid, annualPaid, costsMoney, isFree \} = planChoice\(plan\.pricing\)/)
  // COS-925 — the money rule moved into planChoice() in lib/plan-price.ts so
  // the shelf and the Billing screen stop keeping separate copies of it.
  assert.match(stripComments(read('lib/plan-price.ts')), /\(pricing\?\.monthlyPriceCents \?\? 0\) > 0/)
  assert.match(stripComments(read('lib/plan-price.ts')), /\(pricing\?\.annualPriceCents \?\? 0\) > 0/)
  assert.match(code, /monthlyPaid && monthly/)
  // Each button is gated on ITS OWN cycle now: a plan free monthly and priced
  // annually rendered "Subscribe monthly · $0" and started a real charge.
  assert.match(code, /annualPaid && annual/)
  assert.match(code, /!current && !comingSoon && isFree && canSwitch && \(/)
  assert.match(code, /!current && !comingSoon && costsMoney && canSubscribe && \(/)
  // The rot guard for the property: a Switch control not gated on the card's
  // own price would render alongside Subscribe on a paid plan, which is the
  // exact "two ways to get one plan, one of them paid" this test forbids.
  assert.doesNotMatch(
    code,
    /!current && !comingSoon && canSwitch && \(/,
    'the Switch control must be gated on !costsMoney, or a paid card offers both',
  )
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
  //
  // COS-924 — same rule, asked per card instead of for the whole shelf. A
  // card only ever has ONE control now (its price picks it), so "neither
  // control is available" is "the one control this card would get is not
  // available": !canSubscribe for a paid card, !canSwitch for a free one.
  // The old `!canSubscribe && !canSwitch` would leave a free card silent
  // whenever a gateway happened to be live, which is the dead end itself.
  const code = stripComments(cards)
  assert.match(
    code,
    /\{!current && !comingSoon && \(costsMoney \? !canSubscribe : !\(isFree && canSwitch\)\) && \(/,
  )
  // And it still says something. Both branches, so neither price shape is mute.
  assert.match(code, /Your care team can move you to this plan — in-app subscribing is not available yet\./)
  assert.match(code, /'Your care team can move you to this plan\.'/)
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
  //
  // COS-924 — the control is still here; it moved to the OTHER side of the
  // price test. It was gated on isPurchasable(plan), i.e. offered only on
  // plans that cost money and hidden on the free ones — the only plans a
  // patient can actually move themselves onto. Combined with the `&& !canPay`
  // this screen also carried, a free plan here had no control at all, which
  // is the dead end this test was written to prevent. Reachability is what
  // the property is, and it is greater now, not smaller.
  const code = stripComments(billing)
  assert.match(code, /canSwitch && !plan\.isCurrent && planChoice\(plan\.pricing\)\.isFree/)
  assert.match(code, /onSwitchPlan\(plan\.planKey\)/)
  // Same per-card exclusivity as the shelf: price picks the control, so the
  // two can never both appear on one plan.
  assert.match(code, /canSubscribe && !plan\.isCurrent && planChoice\(plan\.pricing\)\.costsMoney/)
  assert.doesNotMatch(
    code,
    /canSwitch && !plan\.isCurrent && isPurchasable\(plan\)/,
    'Switch gated on isPurchasable hides it from exactly the free plans it is for',
  )
})

test('the Billing screen uses the same canPay rule as the shelf', () => {
  // COS-798 fixed this in PlanStatusSection only; billing.tsx still had the
  // un-darkening flag on its own, which is the same dead end.
  //
  // COS-924 — the shelf's rule changed and this screen followed it, which is
  // the property: the two surfaces render the same cards and must not drift.
  // So assert them against EACH OTHER rather than freezing one spelling. The
  // paid control still requires the real gateway list on both; the free
  // control requires only the self-switch flag on both, because switching
  // costs nothing and needs no gateway.
  const shelf = stripComments(cards)
  const screen = stripComments(billing)
  assert.match(screen, /const canSubscribe = upgradeEnabled && canPay/)
  assert.match(shelf, /canSubscribe: subscribeEnabled && canPay/)
  assert.match(screen, /const canSwitch = usePlanSelfSwitchFlag\(\);/)
  assert.match(shelf, /canSwitch: selfSwitchEnabled,/)
  // Neither surface may key a paid control off the un-darkening flag alone.
  assert.doesNotMatch(screen, /const canSubscribe = upgradeEnabled;/)
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
  const tab = stripComments(read('app/Home/care-plan-plus.tsx'))
  // COS-918: the guarantee this defends — while switching is on, the tab opens
  // on the chooser — is carried by firstRunDoor, which still requires
  // canSwitch. The expression was split so that a patient who ASKS for the
  // chooser is not also gated on canSwitch; see the COS-918 test below.
  //
  // COS-924 renamed what firstRunDoor reads, and nothing else. `canSwitch`
  // stopped meaning "switching is on AND nobody can pay" when exclusivity
  // went per-card, so the hook now exports that exact expression separately
  // as autoOpenChooser and the door reads THAT. Same operands, same door —
  // the split test below pins the expression itself.
  assert.match(tab, /const firstRunDoor = autoOpenChooser && seen === false;/)
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
  assert.match(tab, /onGoToPlan=\{dismissChooser\}/)
  assert.match(cards, /Go to your plan/)
  // Switching closes it too — "once the plan is switched ... show that
  // original screen". Without this the patient picks and stays on the shelf.
  assert.match(tab, /onSwitched=\{dismissChooser\}/)
  assert.match(cards, /onSwitched\?\.\(\)/)
})

test('the door stops appearing on its own when payments land', () => {
  // canSwitch is `selfSwitch && !canPay`, so enabling a gateway removes the
  // gate and restores COS-788's chip with no code change. That is the property
  // worth having — not a flag someone has to remember to unset.
  //
  // COS-918 kept this EXACTLY, and separated it from a second thing that was
  // riding on the same expression. The door that opens ITSELF still requires
  // canSwitch. What changed is the patient explicitly tapping "Choose a
  // different plan": gating that on canSwitch too made the chooser unreachable
  // the moment Stripe was enabled, which is a different bug wearing this
  // property as cover.
  //
  // COS-924 kept it EXACTLY again, and had to give it a name to do so. The
  // expression `selfSwitchEnabled && !canPay` is unchanged; it just is not
  // called canSwitch any more, because per-card exclusivity needed canSwitch
  // to mean "self-switching is on" and nothing else. The door is the ONLY
  // reader of autoOpenChooser, so this is still one rule with one owner —
  // and enabling a gateway still closes it with no flag to unset.
  const code = stripComments(cards)
  assert.match(code, /autoOpenChooser: selfSwitchEnabled && !canPay/)
  const tab = stripComments(read('app/Home/care-plan-plus.tsx'))
  assert.match(tab, /const firstRunDoor = autoOpenChooser && seen === false;/)
  // The rot guard: canSwitch no longer carries !canPay, so a door pointed
  // back at it would keep opening itself forever after a gateway went live.
  assert.doesNotMatch(
    tab,
    /const firstRunDoor = canSwitch &&/,
    'firstRunDoor must read autoOpenChooser — canSwitch no longer implies !canPay',
  )
})

test('COS-918 — asking for the chooser still works once payments are on', () => {
  // The other half of the split. PlanStatusSection has rendered both modes
  // since COS-812 (Switch at :724, Subscribe at :758), so the chooser is
  // correct for a paying patient — it was simply never shown to one.
  const tab = stripComments(read('app/Home/care-plan-plus.tsx'))
  assert.match(tab, /const askedForIt = \(canSwitch \|\| canSubscribe\) && reopened;/)
  // And it reopens the SAME chooser rather than navigating to another screen.
  assert.doesNotMatch(tab, /router\.push\('\/Home\/plans'/)
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
