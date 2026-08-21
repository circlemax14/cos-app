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
  const chosen = cards.indexOf('if (billing?.planName)')
  const shelf = cards.indexOf('Choose your plan')
  assert.ok(chosen > -1, 'expected a branch keyed off the current plan')
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
  assert.match(
    billing,
    /upgradeEnabled && !plan\.isCurrent && isPurchasable\(plan\)/,
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

test('the drawer says Billing, not a third meaning of "plan"', () => {
  assert.match(menu, /label="Billing"/)
  assert.doesNotMatch(menu, /label="Your plan"/)
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
  assert.match(status, /COMING SOON/)
  assert.match(status, /disabled=\{comingSoon\}/)
  assert.match(status, /borderStyle: 'dashed'/)
})

test('a coming-soon card is not tappable', () => {
  assert.match(status, /if \(!comingSoon\) router\.push/)
})

test('no price is quoted for a coming-soon tier', () => {
  // Inventing one would be a promise we have not made.
  assert.match(status, /!comingSoon && monthly/)
  assert.match(status, /!comingSoon && annual/)
})

test('coming-soon comes from the dashboard, not a hardcoded list in the app', () => {
  assert.match(status, /plan\.status === 'coming-soon'/)
  assert.doesNotMatch(status, /COMING_SOON_CARDS/)
})

test('the card icon is plan-driven with a fallback, so no plan renders iconless', () => {
  assert.match(status, /plan\.icon \?\? 'workspace-premium'/)
})
