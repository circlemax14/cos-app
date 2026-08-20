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
const subscription = read('app/Home/subscription.tsx')
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
  assert.match(cards, /router\.push\(['"]\/Home\/subscription['"]/)
})

test('the side menu reaches the subscription screen without a health plan', () => {
  // The menu is the one route that works in every state, so it is the real
  // fix for the dead end. Losing it would put patients back where they were.
  assert.match(menu, /router\.push\(['"]\/Home\/subscription['"]/)
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
    subscription,
    /upgradeEnabled && !plan\.isCurrent && isPurchasable\(plan\)/,
    'all three conditions must gate the button',
  )
})

test('a plan with no price is not purchasable', () => {
  // Without a price there is nothing to charge, so an upgrade button would
  // lead to a checkout with no amount.
  assert.match(subscription, /function isPurchasable/)
  assert.match(subscription, /m !== null && m > 0/)
})

test('THE POINT: the flag is flippable — the checkout route exists and is registered', () => {
  // A dark button pointing at a missing route means the flag can never be
  // turned on without crashing. The gate would look ready and would not be.
  assert.match(subscription, /router\.push\(['"]\/Home\/subscription-checkout['"]/)
  assert.match(homeLayout, /name="subscription-checkout"/)
  assert.doesNotThrow(() => read('app/Home/subscription-checkout.tsx'))
})

test('the checkout screen does not pretend to take payment', () => {
  const checkout = read('app/Home/subscription-checkout.tsx')
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
  for (const [file, src] of [['PlanCardsSection', cards], ['subscription-checkout', read('app/Home/subscription-checkout.tsx')]]) {
    const m = src.match(/import \{([^}]+)\} from 'react-native'/)
    assert.ok(m, `${file}: expected a react-native import`)
    for (const name of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      assert.ok(allowed.has(name), `${file}: unexpected react-native primitive "${name}"`)
    }
  }
})
