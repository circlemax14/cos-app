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
const cards = read('components/plan/PlanCardsSection.tsx')
const billing = read('app/Home/billing.tsx')
const flagHook = read('hooks/use-subscription-upgrade-flag.ts')
const homeLayout = read('app/Home/_layout.tsx')
const menu = read('components/profile-content.tsx')

// ── reachability ───────────────────────────────────────────────────────────

test('the Plan tab mounts the cards in every branch, including both empty states', () => {
  // Three mounts: the generate-plan empty state, the assessments state, and
  // the main state. Miss one and that state becomes a dead end again.
  const mounts = planTab.match(/<PlanCardsSection\b/g) ?? []
  assert.equal(mounts.length, 3, 'expected PlanCardsSection in all three Plan tab branches')
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

test('the cards render nothing on error or when empty', () => {
  // The Plan tab's job is the health plan. A patient looking for today's
  // tasks must not meet a red box about billing.
  assert.match(cards, /if \(isError \|\| plans\.length === 0\) return null/)
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
  for (const [file, src] of [['PlanCardsSection', cards], ['billing-checkout', read('app/Home/billing-checkout.tsx')]]) {
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
