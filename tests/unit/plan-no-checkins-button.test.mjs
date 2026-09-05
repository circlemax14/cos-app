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
  assert.match(screen, /canSwitch\s*\?\s*\(\)\s*=>\s*setReopened\(true\)/)
  // COS-917 added the reachability check: `plans` aliases to the non-public
  // `billing` feature, so offering it unconditionally sent a patient whose
  // plan lacks billing.view straight into an enforcer bounce.
  assert.match(screen, /canSubscribe && canShowScreen\('plans'\)/)
  assert.match(screen, /router\.push\('\/Home\/plans'/)
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
  assert.match(status, /canSubscribe: subscribeEnabled && canPay/)
  assert.match(status, /canSwitch: selfSwitchEnabled && !canPay/)
})

test('the screen reads BOTH controls, not just canSwitch', () => {
  assert.match(screen, /const \{ canSwitch, canSubscribe \} = usePlanChoiceControls\(\)/)
})

test('router is imported — the paid path would otherwise throw at runtime', () => {
  // tsc caught this once already; the test keeps it caught.
  assert.match(screen, /import \{[^}]*\brouter\b[^}]*\} from 'expo-router'/)
})
