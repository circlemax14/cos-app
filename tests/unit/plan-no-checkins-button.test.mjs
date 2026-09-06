/**
 * COS-916 — "Choose a different plan" must go somewhere, or not be there.
 *
 * Vishal, after enabling Stripe: "there's a button that choose a different
 * plan. When I click on it, nothing is happening."
 *
 * The screen passed `() => setReopened(true)` unconditionally. `reopened` only
 * drives `showPlanGate`, which is gated on `canSwitch` — and canSwitch is
 * `selfSwitchEnabled && !canPay`. Enabling a gateway flipped canPay true,
 * canSwitch false, and the button set a flag nothing read.
 *
 * The two modes are deliberate and mutually exclusive — free-switch when
 * nobody can pay, subscribe when they can. PlanStatusSection's own comment
 * says the point of keying them off the server's gateway list is that
 * "exactly one of them shows and neither dead-ends". This button was the one
 * that dead-ended.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const screen = code('app/Home/care-plan-plus.tsx')
const comp = code('components/plan/PlanHasNoCheckIns.tsx')
const status = code('components/plan/PlanStatusSection.tsx')

test('THE POINT: the handler branches on which mode is actually available', () => {
  assert.match(screen, /canSwitch \|\| canSubscribe/)
  // COS-918: it does NOT navigate anywhere. The inline chooser handles both
  // modes (PlanStatusSection renders Switch or Subscribe), so sending a paying
  // patient to a different screen was the wrong fix — Vishal spotted it at
  // once: "it doesn't look like the plan screen I was actually using."
  assert.match(screen, /canSwitch \|\| canSubscribe \? \(\) => setReopened\(true\) : null/)
  assert.doesNotMatch(screen, /router\.push\('\/Home\/plans'/)
})

test('and is NULL when neither mode is available — no button at all', () => {
  assert.match(screen, /:\s*null\n?\s*\}/)
  assert.match(comp, /onChoosePlan: \(\(\) => void\) \| null/)
  assert.match(comp, /\{onChoosePlan \? \(/)
})

test('a patient with nowhere to go is told so, not shown a dead button', () => {
  assert.match(comp, /Changing plans is not available on this account right now/)
})

test('the two modes are still mutually exclusive — this is not a bypass', () => {
  // If both could be true the button would silently prefer switching, which
  // would be wrong for a paying patient.
  //
  // COS-924 kept that property and moved WHERE it is enforced. It used to be
  // `canSwitch: selfSwitchEnabled && !canPay` — exclusivity across the whole
  // shelf, so turning on Apple IAP took Switch away from the FREE plans too.
  // Now a card picks its control from its own price, and the two gates below
  // are the same `costsMoney` boolean read in opposite senses, so exactly one
  // of them can ever be true for a given plan. That is stronger than the old
  // version, which could only say "nobody switches" or "nobody buys".
  assert.match(status, /canSubscribe: subscribeEnabled && canPay/)
  assert.match(status, /canSwitch: selfSwitchEnabled,/)

  // The one boolean, derived from the plan's own price — not from the platform.
  assert.match(status, /const \{ monthlyPaid, annualPaid, costsMoney, isFree \} = planChoice\(plan\.pricing\)/)
  // COS-925 — one definition, in lib/plan-price.ts. See planChoice().
  assert.match(
    code('lib/plan-price.ts'),
    /\(pricing\?\.monthlyPriceCents \?\? 0\) > 0/,
  )
  assert.match(
    code('lib/plan-price.ts'),
    /\(pricing\?\.annualPriceCents \?\? 0\) > 0/,
  )

  // Exclusivity by construction: free card -> Switch, paid card -> Subscribe.
  assert.match(status, /!current && !comingSoon && isFree && canSwitch &&/)
  assert.match(status, /!current && !comingSoon && costsMoney && canSubscribe &&/)
  // ...and the "neither" explanation branches on the same boolean, so a card
  // can never fall through with no action and no reason.
  assert.match(status, /!current && !comingSoon && \(costsMoney \? !canSubscribe : !\(isFree && canSwitch\)\)/)

  // COS-918's first-run door kept the OLD expression under its own name rather
  // than silently inheriting canSwitch's new meaning. The chooser that opens
  // ITSELF still stops opening the moment a gateway goes live.
  assert.match(status, /autoOpenChooser: selfSwitchEnabled && !canPay/)
})

test('the screen reads BOTH controls, not just canSwitch', () => {
  // COS-924 added a third member, autoOpenChooser, so the destructure is no
  // longer an exact two-name literal. The property is unchanged: the screen
  // reads BOTH controls, and the button branches on both (asserted above).
  assert.match(screen, /const \{ canSwitch, canSubscribe(?:, \w+)* \} = usePlanChoiceControls\(\)/)

  // And the two readers stayed separate: the door the patient opens reads the
  // controls, the door that opens ITSELF reads autoOpenChooser. Swapping either
  // back would re-break one of COS-916 or COS-918.
  assert.match(screen, /const firstRunDoor = autoOpenChooser && seen === false/)
  assert.match(screen, /const askedForIt = \(canSwitch \|\| canSubscribe\) && reopened/)
})

test('COS-918 — it navigates nowhere at all now', () => {
  // The paid path used to push /Home/plans. It reopens the inline chooser
  // instead, so care-plan-plus needs no router import and cannot send anyone
  // to a screen they did not ask for.
  assert.doesNotMatch(screen, /router\.push/)
})
