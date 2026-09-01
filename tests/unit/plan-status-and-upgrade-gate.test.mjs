// tests/unit/plan-cards-upgrade-gate.test.mjs — COS-740
//
// Source-drift trip wires for the plan cards and the dark Upgrade button.
//
// BACKGROUND
//   The subscription screen had exactly one entry point: a button on the
//   plan-type chooser, itself only reachable from a card that renders AFTER a
//   health plan exists. health-plan.tsx returns its "Generate your Health
//   Plan" empty state early, so a patient with no plan could not reach their
//   own plan or price by any route in the app.
//
//   The Upgrade button ships DARK because there is no payment integration —
//   cos-backend has Stripe schema fields and nothing else. A premium surface
//   that cannot transact is App Store Guideline 2.1 placeholder content, which
//   is exactly why SCRUM-319 pulled the Services menu entry before shipping.
//
// These assert source structure rather than rendering, because `node --test`
// cannot resolve the `@/` alias these modules import through.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const planTab = read('app/Home/health-plan.tsx')
const cards = read('components/plan/PlanStatusSection.tsx')
const billing = read('app/Home/billing.tsx')
const flagHook = read('hooks/use-subscription-upgrade-flag.ts')
const homeLayout = read('app/Home/_layout.tsx')
const menu = read('components/profile-content.tsx')

// ── reachability ───────────────────────────────────────────────────────────

test('the Plan tab mounts the cards in every branch, including both empty states', () => {
  // Three mounts: the generate-plan empty state, the assessments state, and
  // the main state. Miss one and that state becomes a dead end again.
  //
  // COS-801 added a fourth here; COS-803 moved it to app/Home/care-plan-plus.tsx
  // so the classic tab is exactly what production ships. Back to three, and
  // the gate's own mount is pinned by payments-compliance instead.
  const mounts = planTab.match(/<PlanStatusSection\b/g) ?? []
  assert.equal(mounts.length, 3, 'expected PlanStatusSection in all three Plan tab branches')
})

test('the cards open the subscription screen', () => {
  assert.match(cards, /router\.push\(['"]\/Home\/billing['"]/)
})

test('the side menu reaches the subscription screen without a health plan', () => {
  // The menu is the one route that works in every state, so it is the real
  // fix for the dead end. Losing it would put patients back where they were.
  assert.match(menu, /router\.push\(['"]\/Home\/billing['"]/)
})

// ── failing quietly on the Plan tab ────────────────────────────────────────

test('the plan strip renders nothing on a failed request', () => {
  // The Plan tab's job is the health plan. A patient looking for today's
  // tasks must not meet a red box about billing.
  assert.match(cards, /if \(isError\) return null/)
})

// ── COS-744: chosen vs not-chosen ──────────────────────────────────────────

test('THE POINT: a patient WITH a plan gets one line, not the price shelf', () => {
  // COS-740 rendered the shelf unconditionally, so someone already on
  // Advanced opened their care plan every morning to a four-item price list
  // and had to scroll past everything they had bought to reach today's tasks.
  //
  // COS-788 narrowed the condition without changing this point: a patient on a
  // plan they CHOSE still gets the one line. What changed is that sitting on
  // the default no longer counts as having chosen — see the isDefaultPlan test
  // below. The ordering assertion is the load-bearing half and is unchanged.
  //
  // COS-800 added a second condition rather than removing this one. The chip
  // is still what a patient with a settled plan gets — but only when they
  // CANNOT switch. With payments parked and free switching on, collapsing to
  // a chip made leaving the default plan a one-way door: the chooser vanished
  // the moment they used it.
  //
  // The day payments land, canSwitch goes false and this branch takes over
  // again with no code change. That is the property being pinned here.
  //
  // COS-801 dropped `&& !canSwitch` again — the one-way door it guarded
  // against is now held open by the Care Plan tab's chooser gate instead of
  // by refusing to collapse this strip. `variant === 'strip'` replaced it,
  // which is what lets the gate render the cards while this stays one line.
  const chosen = cards.indexOf(
    "if (variant === 'strip' && billing?.planName && billing.isDefaultPlan !== true)",
  )
  const shelf = cards.indexOf('Choose your plan')
  assert.ok(chosen > -1, 'expected a branch keyed off a CHOSEN plan that cannot switch')
  assert.ok(chosen < shelf, 'the chosen-plan branch must return BEFORE the shelf renders')
})

test('the chip keys off the billing summary, not a card isCurrent flag', () => {
  // A patient can be on a plan that is not for sale (free, or care-team
  // assigned); those are filtered out of `plans` entirely, so isCurrent would
  // be false for everyone and they would be shown a chooser they already used.
  assert.match(cards, /billing\?\.planName/)
  const chosenBranch = cards.slice(cards.indexOf('if (billing?.planName)'), cards.indexOf('Choose your plan'))
  assert.doesNotMatch(chosenBranch, /isCurrent/)
})

test('the plan strip sits at the TOP in all three branches', () => {
  // In the main branch it used to be pinned to the very bottom, because a
  // price shelf outranked the daily tasks. A one-line chip does not, and at
  // the bottom it was unfindable.
  const scrollIdx = planTab.indexOf('ref={planScrollRef}')
  const mountIdx = planTab.indexOf('<PlanStatusSection', scrollIdx)
  const medsIdx = planTab.indexOf('<MedicationsReviewPrompt', scrollIdx)
  assert.ok(mountIdx > -1 && medsIdx > -1)
  assert.ok(mountIdx < medsIdx, 'the plan strip must render first in the main branch')
})

// ── the Upgrade button is dark ─────────────────────────────────────────────

test('the flag hook demands an exact true', () => {
  // A missing flag, a failed fetch and an unparsed value must all read OFF.
  assert.match(flagHook, /=== true/)
  assert.doesNotMatch(flagHook, /\|\|\s*true/)
})

test('the Upgrade button is gated on the flag, not-current, and purchasable', () => {
  // COS-798/799 tightened the first condition rather than removing it:
  // upgradeEnabled is now ANDed with the server's real gateway list, so an
  // un-darked button with no working gateway behind it cannot be rendered.
  // The other two are unchanged and still load-bearing.
  assert.match(billing, /const canSubscribe = upgradeEnabled && canPay/)
  assert.match(
    billing,
    /canSubscribe && !plan\.isCurrent && isPurchasable\(plan\)/,
    'all three conditions must gate the button',
  )
})

test('a plan with no price is not purchasable', () => {
  // Without a price there is nothing to charge, so an upgrade button would
  // lead to a checkout with no amount.
  assert.match(billing, /function isPurchasable/)
  assert.match(billing, /m !== null && m > 0/)
})

test('THE POINT: the flag is flippable — the checkout route exists and is registered', () => {
  // A dark button pointing at a missing route means the flag can never be
  // turned on without crashing. The gate would look ready and would not be.
  assert.match(billing, /router\.push\(['"]\/Home\/billing-checkout['"]/)
  assert.match(homeLayout, /name="billing-checkout"/)
  assert.doesNotThrow(() => read('app/Home/billing-checkout.tsx'))
})

test('the checkout screen does not pretend to take payment', () => {
  const checkout = read('app/Home/billing-checkout.tsx')
  // It must be honest about the state AND give a route that works today,
  // rather than a dead end or a fake "processing" state.
  assert.match(checkout, /aren&apos;t available yet/)
  assert.match(checkout, /talk to your care team/)
})

// ── iOS 26 rendering envelope ──────────────────────────────────────────────

test('new plan surfaces stay inside the iOS 26 primitive envelope', () => {
  // This app has crashed in production from cold-mount rendering, and the
  // Plan tab is a cold-mount surface.
  const allowed = new Set(['Pressable', 'StyleSheet', 'Text', 'View'])
  for (const [file, src] of [['PlanStatusSection', cards], ['billing-checkout', read('app/Home/billing-checkout.tsx')]]) {
    const m = src.match(/import \{([^}]+)\} from 'react-native'/)
    assert.ok(m, `${file}: expected a react-native import`)
    for (const name of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      assert.ok(allowed.has(name), `${file}: unexpected react-native primitive "${name}"`)
    }
  }
})

// ── the dead end that started COS-742 ──────────────────────────────────────

test('THE POINT: Billing has a back affordance at the TOP of the scroll', () => {
  // It had only a "Close" button at the bottom, below every plan card, so with
  // more than one plan it sat off the fold. `headerShown: false` means there is
  // no native chrome either, so tapping a card from the Plan tab dropped
  // patients somewhere with no visible way out.
  // Measured inside the render body: the file header discusses the old
  // "Close" button, and matching that comment would pass for the wrong reason.
  const body = billing.slice(billing.indexOf('export default function BillingScreen'))
  const headerIdx = body.indexOf('styles.header')
  const closeIdx = body.indexOf('>Close<')
  assert.ok(headerIdx > -1, 'expected a header row with a back control')
  assert.ok(closeIdx > -1, 'expected the bottom Close button to still exist')
  assert.ok(headerIdx < closeIdx, 'the back control must come before the bottom Close button')
  assert.match(body, /router\.back\(\)/)
})

// COS-742 banned a drawer row called "Your plan" because "plan" already meant
// the daily health plan and the assessment intensity. COS-784 then added the
// read-only plan shelf on a branch where COS-742 did not exist, and Vishal
// chose on 2026-08-29 to keep both rows rather than block the shelf on a
// rename. So the ban is lifted DELIBERATELY, not forgotten.
//
// What still matters, and is what this now pins: Billing must remain, and it
// must stay the row that reaches /Home/billing. The shelf is a separate,
// flag-gated row and must not quietly replace it.
test('Billing remains the entry point to the patient\'s own plan', () => {
  assert.match(menu, /label="Billing"/)
  assert.match(menu, /router\.push\('\/Home\/billing' as never\)/)
})

test('the old subscription routes are gone everywhere', () => {
  // A stale '/Home/subscription' push would 404 at runtime after the rename.
  for (const [name, src] of [['billing', billing], ['cards', cards], ['menu', menu], ['layout', homeLayout]]) {
    assert.doesNotMatch(src, /Home\/subscription/, `${name} still references the old route`)
  }
})

// ── COS-745: the Generate button is gone ───────────────────────────────────

const features = read('components/plan/PlanFeaturesSection.tsx')


test('removing the button did not leave a dead screen', () => {
  // The whole risk of dropping the CTA: a patient with no plan and nothing to
  // tap. Both no-plan reasons must be explained, and the fixable one must
  // offer the screen that fixes it.
  assert.match(features, /Connect your health records/)
  assert.match(features, /Building your daily plan/)
  assert.match(features, /router\.push\('\/Home\/connect-clinics'/)
})

test('the flexGrow that caused the dead gap is gone from the empty branch', () => {
  // emptyWrap is flex:1 + minHeight:500 + centred; with flexGrow:1 above it
  // the content floated in the middle of its own empty box.
  const branch = planTab.slice(planTab.indexOf('<PlanStatusSection'), planTab.indexOf('<PlanFeaturesSection'))
  assert.doesNotMatch(branch, /flexGrow: 1/)
})


test('the features list stays inside the iOS 26 primitive envelope', () => {
  const m = features.match(/import \{([^}]+)\} from 'react-native'/)
  assert.ok(m)
  const allowed = new Set(['Pressable', 'StyleSheet', 'Text', 'View'])
  for (const n of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
    assert.ok(allowed.has(n), `unexpected primitive "${n}"`)
  }
})

// ── COS-748: the hero tiles read PLANS, not the legacy permission table ────

const hero = read('components/home/HeroInsightsRow.tsx')

test('THE POINT: Health Age and Wellbeing gate on entitlements, not cos-feature-permissions', () => {
  // They were on useIsFeatureEnabled — a separate table with its own admin
  // screen — so a plan could tick "Health Age" and nothing would happen.
  assert.match(hero, /useCanRender\('home\.health-age-dial'\)/)
  assert.match(hero, /useCanRender\('home\.wellbeing-score'\)/)
  assert.doesNotMatch(hero, /useIsFeatureEnabled\('HEALTH_AGE'\)/)
})

test('the Wellbeing tile is no longer unconditional', () => {
  // It previously rendered with no permission layer at all, so no plan could
  // ever withhold it.
  assert.match(hero, /\{wellbeingPerm && <WellbeingTile/)
})

test('Health Age keeps BOTH layers — dark-launch flag AND plan', () => {
  // Losing the flag would make the tile un-killable without a release.
  assert.match(hero, /healthAgeFlag && healthAgePerm/)
})

// ── COS-750: locked features greyed, not hidden ────────────────────────────





// ── COS-752: the feature list is gone from the patient's screen ───────────

test('THE POINT: the Care Plan tab does not list app sections back at the patient', () => {
  // "Your care plan / Medications / Appointments" are internal plumbing — the
  // names the app is built out of, not things a patient thinks of as theirs.
  assert.doesNotMatch(features, /YOUR PLAN INCLUDES/)
  assert.doesNotMatch(features, /NOT IN YOUR PLAN/)
})

test('the Generate CTA stays gone', () => {
  const body = planTab.slice(planTab.indexOf('export default function'))
  assert.doesNotMatch(body, /Generate your Health Plan/)
})

test('what remains is the only thing the patient needs here', () => {
  // Why there is no plan yet, and the one action that fixes it.
  assert.match(features, /Connect your health records/)
  assert.match(features, /Building your daily plan/)
  assert.match(features, /router\.push\('\/Home\/connect-clinics'/)
})

test('the screen still fetches nothing it does not render', () => {
  // The component stopped calling usePlanFeatures when the list went; leaving
  // the call would spend a request per open on data nobody sees.
  const body = features.slice(features.indexOf('export default function PlanFeaturesSection'))
  assert.doesNotMatch(body, /usePlanFeatures\(\)/)
})

// ── COS-753: prod-style plan cards, coming-soon included ──────────────────

const status = read('components/plan/PlanStatusSection.tsx')

test('THE POINT: a coming-soon plan renders disabled and badged, not hidden', () => {
  // Family shipped this way on the prod chooser (COS-432). Hiding it defeats
  // the point of advertising the roadmap.
  //
  // COS-811 dropped the dashes. The card has to look like a CARD first: the
  // dashed border sat at 12% alpha under opacity 0.7 — roughly 8% against the
  // background — so it had no visible edge and the content floated on the
  // page. On the prod chooser the dashes were the only "unavailable" signal;
  // here the badge already says it, so the outline is free to bound the card.
  //
  // What this wire is actually for is unchanged: shown, badged, muted, and
  // impossible to choose.
  assert.match(status, /COMING SOON/)
  assert.match(status, /cardSoon: \{ opacity: 0\.\d+ \}/)
  assert.match(status, /comingSoon\s*\?\s*\(colors\.text \?\? '#11181C'\) \+ '38'/)
})

test('a coming-soon card is not tappable', () => {
  // COS-788 made this stronger rather than weaker. The card used to be a
  // Pressable with `disabled={comingSoon}`; now the card is a plain View and
  // the ONLY control on it is the upgrade button, which a coming-soon tier
  // never renders. There is nothing to disable because there is nothing there.
  //
  // COS-809: the controls are now split by mode (Switch / Upgrade / note), so
  // assert the PROPERTY instead of one shape — every control on the card is
  // guarded on !comingSoon. A new one added without the guard fails here.
  const controls = [...status.matchAll(/\{!current && !comingSoon && ([^\n]*)\(/g)]
  assert.ok(controls.length >= 3, `expected the card's controls, found ${controls.length}`)
  assert.doesNotMatch(
    status,
    /<Pressable[\s\S]{0,200}key=\{plan\.planKey\}/,
    'the whole-card tap target is back — a coming-soon card would be tappable again',
  )
})

test('no price is quoted for a coming-soon tier', () => {
  // Inventing one would be a promise we have not made.
  //
  // COS-807 added two more price lines (the admin's own label, and the trial
  // pill). Rather than list them, assert the property: EVERY price render site
  // is guarded on !comingSoon. A new one added without the guard fails here.
  const priceTokens = ['priceLabel ?? monthly', 'priceLabel && monthly', 'annual ?', 'plan.trialDays']
  for (const tok of priceTokens) {
    const at = status.indexOf(tok)
    assert.ok(at > -1, `price line "${tok}" not found — did it get renamed?`)
    const line = status.slice(status.lastIndexOf('{', at), at + tok.length)
    assert.match(line, /!comingSoon/, `price line "${tok}" is not gated on !comingSoon`)
  }
})

test('coming-soon comes from the dashboard, not a hardcoded list in the app', () => {
  assert.match(status, /plan\.status === 'coming-soon'/)
  assert.doesNotMatch(status, /COMING_SOON_CARDS/)
})

test('the card icon is plan-driven with a fallback, so no plan renders iconless', () => {
  assert.match(status, /plan\.icon \?\? 'workspace-premium'/)
})

// ── COS-754: nothing about the daily plan while still choosing ────────────

test('THE POINT: the daily-plan status is silent until a plan is chosen', () => {
  // "Building your daily plan" under the chooser answered a question the
  // patient had not reached, and implied work was under way on a plan they
  // had not selected.
  assert.match(features, /if \(!data\?\.billing\?\.planName\) return null/)
})

test('both sections read the SAME signal, so they cannot disagree on state', () => {
  // One shows the chooser, the other hides itself. Two sources for "has a
  // plan?" would eventually render the shelf and the status block together.
  assert.match(features, /usePatientPlans\(\)/)
  assert.match(status, /billing\?\.planName/)
})

test('the removed list took its fetch with it', () => {
  // Scoped to the code body: the header comment still DESCRIBES the endpoint,
  // which is worth keeping and is not a call.
  // `apiClient` is the real signal — a comment further down still explains
  // where the data lives, which is worth keeping and is not a call.
  const body = features.slice(features.indexOf('export default function PlanFeaturesSection'))
  assert.doesNotMatch(body, /apiClient/)
  assert.doesNotMatch(features, /useQuery\(/)
})

// ── COS-788: the first-time chooser, and the background circles ────────────

test('THE POINT: the chooser is decided by isDefaultPlan, not by having a name', () => {
  // COS-787 made the backend name the default plan for a patient who had never
  // chosen one. Correct — but this component switched on `billing?.planName`,
  // so overnight every patient looked "chosen" and the first-time chooser
  // disappeared behind a one-line chip. Being parked on the default IS the
  // un-chosen state; it just has a name now.
  assert.match(cards, /billing\?\.planName && billing\.isDefaultPlan !== true/)
  assert.doesNotMatch(
    cards,
    /if \(billing\?\.planName\) \{/,
    'the old name-only condition is back — first-time users lose the chooser',
  )
})

test('the default plan is marked as theirs and offers nothing to upgrade to', () => {
  assert.match(cards, /YOUR PLAN/)
  // The upgrade control is withheld from the current plan AND from coming-soon.
  // COS-809 split it by mode; every branch still carries both guards.
  assert.match(cards, /\{!current && !comingSoon && canSwitch && \(/)
  assert.match(cards, /\{!current && !comingSoon && canSubscribe && \(/)
})

test('every other plan offers an explicit upgrade control', () => {
  // COS-789 changed what this control DOES: it used to push /Home/billing,
  // it now expands the detail in place. The earlier version of this test
  // searched BACKWARDS from the button and kept finding the chip's push
  // further up the file, so it passed while asserting nothing about the
  // button at all. Assert the toggle instead.
  assert.match(cards, /Upgrade to this plan/)
  assert.match(cards, /setOpenKey\(open \? null : plan\.planKey\)/)
})

test('isDefaultPlan is optional, so an older backend degrades to the chip', () => {
  // A stale app may under-offer the chooser; it must never mis-state which
  // plan someone is on. `!== true` gives that, `=== false` would not.
  assert.match(cards, /isDefaultPlan\?: boolean/)
})

// ── the background circles ─────────────────────────────────────────────────

test('THE POINT: the Plan tab paints no background of its own', () => {
  // AppWrapper fills the screen and then draws two faint brand circles on top.
  // Anything below that setting its own backgroundColor repaints the same
  // colour ABOVE the circles, clipping them into hard rectangles — most
  // visibly the loading spinner, which showed as a white block with two
  // quarter-circles sliced off.
  assert.doesNotMatch(
    planTab,
    /backgroundColor: colors\.background/,
    'health-plan.tsx must not repaint the background over AppWrapper decoration',
  )
})

test('the plan cards are transparent, not filled', () => {
  assert.doesNotMatch(cards, /backgroundColor: colors\.card/)
  assert.match(cards, /backgroundColor: 'transparent'/)
})

test('billing has the same chrome as every other screen', () => {
  assert.match(billing, /<AppWrapper>/)
  assert.match(billing, /<\/AppWrapper>/)
  assert.doesNotMatch(
    billing,
    /backgroundColor: colors\.background/,
    'billing must not repaint over AppWrapper decoration either',
  )
})

// ── COS-789: order, and the detail that opens in place ────────────────────

test('THE POINT: the detail opens in place and does not navigate away', () => {
  // The value of a shelf is comparing plans side by side. Pushing a screen to
  // read one of them throws that away, which is why the upgrade control is a
  // toggle and not a router.push.
  //
  // COS-804: the label is now mode-dependent. When switching is how plans
  // change, the card's primary button DOES the switch and this one is a quiet
  // "What's included" toggle — it used to say "Upgrade to this plan" and only
  // expand, which read as a dead button. Still a toggle, still no navigation,
  // which is what this wire is for.
  //
  // COS-809 deleted the switch-mode toggle entirely: COS-808 put everything on
  // the face of the card, so it opened a panel containing nothing new. It
  // survives only where it still earns its place — with payments on, the panel
  // holds the monthly and annual buttons.
  assert.match(cards, /accessibilityState=\{\{ expanded: open \}\}/)
  assert.match(cards, /open \? 'Hide details' : 'Upgrade to this plan'/)
  // Scoped to the label position: the comment above the toggle still names
  // what was removed, and that prose is the reason the change is legible.
  assert.doesNotMatch(cards, /: "What's included"/)
  // The disclosure control must never navigate.
  const toggle = cards.slice(
    cards.indexOf('onPress={() => setOpenKey(open ? null : plan.planKey)}'),
  ).slice(0, 900)
  assert.doesNotMatch(toggle, /router\.push/)
})

test('one card open at a time', () => {
  // Collapsing the detail exists to stop this section pushing the daily tasks
  // off screen; several open at once puts it straight back.
  assert.match(cards, /const \[openKey, setOpenKey\] = useState<string \| null>\(null\)/)
  assert.match(cards, /const open = openKey === plan\.planKey/)
})

test('your own plan shows what you get without being asked', () => {
  // COS-807 widened this: the whole CHOOSER shows highlights now. COS-789 hid
  // them because the shelf sat above the daily tasks and four open cards
  // buried them; the chooser is its own screen, so that reason is gone. The
  // strip variant still collapses, because it is still inline above content.
  // COS-808 replaced the flat list with a feature TABLE, so the guard now
  // covers all three groups it can render: derived plan config, labelled
  // highlights, and unlabelled ones.
  assert.match(cards, /\(variant === 'chooser' \|\| current \|\| open\) &&/)
  assert.match(cards, /labelled\.length > 0 \|\| plain\.length > 0 \|\| derived\.length > 0/)
})

test('subscribing rides the SAME dark-launch gate as the Billing screen', () => {
  // There is no payment integration. This must not become a second, ungated
  // way to reach a premium surface — that is what Guideline 2.1 pulled.
  //
  // COS-798 tightened it: the flag is now ANDed with the server's real gateway
  // list, so an un-darked button with no working gateway behind it is no
  // longer possible.
  //
  // COS-801: the expression moved into usePlanChoiceControls, unchanged.
  assert.match(cards, /useSubscriptionUpgradeFlag/)
  assert.match(cards, /canSubscribe: subscribeEnabled && canPay/)
  assert.match(cards, /canSubscribe && monthly/)
  assert.match(cards, /canSubscribe && annual/)
})

test('with the gate off it explains itself instead of showing a dead button', () => {
  // COS-797 narrowed the condition: the explanation now shows only when there
  // is neither a Subscribe button NOR a free Switch one, so it never sits
  // under a control that works.
  // COS-809 moved it OUT of the expander — there is no longer one to hide it
  // behind, and a card with no action and no explanation reads as broken.
  assert.match(cards, /\{!current && !comingSoon && !canSubscribe && !canSwitch && \(/)
  assert.match(cards, /in-app subscribing is not available yet/)
})

test('annual is offered only when the plan actually has an annual price', () => {
  // Two buttons both quoting the monthly figure would be a worse lie than one.
  const annualIdx = cards.indexOf("cycle: 'annual'")
  assert.ok(annualIdx > -1, 'expected an annual subscribe path')
  assert.match(cards.slice(0, annualIdx), /canSubscribe && annual \? \(/)
})

test('the checkout seam is told which plan and which cycle', () => {
  const checkout = read('app/Home/billing-checkout.tsx')
  assert.match(cards, /params: \{ planKey: plan\.planKey, planName: plan\.name, cycle: 'monthly' \}/)
  assert.match(cards, /params: \{ planKey: plan\.planKey, planName: plan\.name, cycle: 'annual' \}/)
  // And it must actually READ them — otherwise the two buttons land on an
  // identical screen and the app looks like it ignored the tap.
  assert.match(checkout, /useLocalSearchParams/)
  assert.match(checkout, /billed \$\{cycleLabel\}/)
})
