/**
 * COS-917 — a blocked route explains itself instead of teleporting you Home.
 *
 * useEnforceScreenAccess redirects any route the patient's plan does not
 * include. The guard is correct and stays — COS-859 added it because ~55
 * push-only screens were reachable regardless of plan. Where it SENT people
 * was the defect: `router.replace('/Home')`, silently.
 *
 * From the patient's side that is a button that does nothing. Vishal hit it
 * three times in one session — the plan pill, "view progress", and "Choose a
 * different plan" — reporting it each time as "nothing is happening" and
 * "it is taking me to the home screen. I don't know what is happening."
 *
 * A scan found 33 navigation targets it can bounce, so this is fixed at the
 * one choke point rather than at 33 call sites.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const hook = code('hooks/use-feature-permissions.ts')
const screen = code('app/Home/plan-feature-unavailable.tsx')
const layout = code('app/Home/_layout.tsx')
const plus = code('app/Home/care-plan-plus.tsx')

test('THE POINT: the enforcer no longer dumps you on Home without a word', () => {
  assert.match(hook, /pathname: '\/Home\/plan-feature-unavailable'/)
  assert.doesNotMatch(hook, /router\.replace\('\/Home'\)/)
})

test('the blocked route name travels with the redirect, so the screen can name it', () => {
  assert.match(hook, /params: \{ route \}/)
  assert.match(screen, /params\.route/)
})

test('THE POINT: the explanation screen can never itself be blocked', () => {
  // Otherwise the enforcer bounces you off the screen explaining the bounce.
  assert.match(hook, /if \(route === 'plan-feature-unavailable'\) return/)
})

test('and it is registered push-only, so it is not a stray tab', () => {
  // A screen file with no Tabs.Screen entry renders a bare filename label at
  // the end of the bar — COS-860.
  assert.match(layout, /name="plan-feature-unavailable"/)
  const block = layout.slice(layout.indexOf('name="plan-feature-unavailable"'))
  assert.match(block.slice(0, 200), /href: null/)
})

test('it does not offer a door it cannot open', () => {
  // Sending someone from one bounce to another is the bug this screen ends.
  // A plan granting no billing.view is exactly how Vishal got here.
  assert.match(screen, /const canSeePlans = canShowScreen\('plans'\)/)
  assert.match(screen, /\{canSeePlans && \(/)
})

test('and always offers a way out, even with nowhere else to go', () => {
  assert.match(screen, /accessibilityLabel="Back to home"/)
})

test('COS-918 — care-plan-plus reopens its own chooser rather than navigating', () => {
  // COS-916 sent a paying patient to /Home/plans, which his plan could not
  // open. COS-918 removed the hop entirely: the inline chooser handles both
  // modes, so there is no cross-screen navigation left to gate.
  assert.match(plus, /canSwitch \|\| canSubscribe \? \(\) => setReopened\(true\) : null/)
  assert.doesNotMatch(plus, /router\.push\('\/Home\/plans'/)
})
