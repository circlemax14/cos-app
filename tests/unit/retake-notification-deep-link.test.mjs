/**
 * COS-1166 — the retake push now opens the assessment, and the tap survives
 * a cold start.
 *
 * Vishal, 2026-09-29: "I clicked on the notification. Then it took me to the
 * app, and it stuck on the splash screen. Nothing happened."
 *
 * Two defects sat behind that.
 *
 * 1. ROUTING. `ASSESSMENT_RETAKE_REQUESTED` returned null → Home. Phase 1
 *    chose that on purpose (land on Home, let the inbox card be the
 *    destination), and it is now reversed.
 *
 * 2. ORDERING. On a cold launch the OS delivers the launching tap to BOTH
 *    the response listener (registered on mount, ungated) AND
 *    useLastNotificationResponse (gated on `isOnHome` by COS-437). Both call
 *    navigateForNotification, which deduped on the notification id as its
 *    FIRST statement — so the ungated listener claimed the tap, navigated
 *    before SplashGate had routed, and splash's `router.replace` wiped it.
 *    The gated path then found the id already claimed and did nothing.
 *
 * These are source-read assertions on purpose: the ordering is the whole
 * defect, `node --test` has no React renderer, and a renderer would not
 * reproduce the Lambda-free-but-still-real cold-start race anyway. What can
 * be proven here is the order of the statements, which IS the invariant.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (...p) => readFileSync(join(HERE, '..', '..', ...p), 'utf8')

const HOOK = read('hooks', 'use-notifications.ts')
const ROUTING = read('lib', 'notification-routing.ts')

/** The body of navigateForNotification, comments stripped. */
function navBody() {
  const start = HOOK.indexOf('function navigateForNotification')
  assert.ok(start > 0, 'navigateForNotification not found — was it renamed?')
  const end = HOOK.indexOf('\n}', start)
  return HOOK.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

test('the retake case routes to the shared GATE constant, not a literal', () => {
  /*
   * COS-1180 reversed what this asserted. It used to require
   * `retakeStartRoute(instrumentKey)` in the case body — open the work itself.
   *
   * Vishal, 2026-09-30: tapping the push "took me to that check-in screen
   * again ... ideally it should take me to that screen that I was seeing when I
   * click on the plan nav button." For a SCOPE key retakeStartRoute resolves to
   * the catalog, so the push and the Plan tab disagreed about where a pending
   * retake lives.
   *
   * Still one shared definition, still not a literal — the constant is just
   * the gate now, and the gate's own "Start now" calls retakeStartRoute.
   */
  const code = ROUTING.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const i = code.indexOf("case 'ASSESSMENT_RETAKE_REQUESTED'")
  assert.ok(i > 0, 'the retake case must be named, not left to the default')
  const body = code.slice(i, code.indexOf('case ', i + 10))
  assert.match(body, /RETAKE_GATE_ROUTE/, 'the case must return the shared gate constant')
  assert.doesNotMatch(
    body,
    /assessments-catalog/,
    'never hard-code the catalog here — that is the screen he was dumped on',
  )
})

test('COS-1180: the gate constant is the VISIBLE plan tab', () => {
  // '/Home/plan' is the Health Status screen. '/Home/health-plan' is retired
  // from the tab bar (COS-915) and can render PlanScreenRedesignedV2, which has
  // neither the retake card nor the gate.
  assert.match(ROUTING, /RETAKE_GATE_ROUTE = '\/Home\/care-plan-plus'/)
})

test('THE ORDERING: the tap is claimed only AFTER a navigation happens', () => {
  const body = navBody()
  const claim = body.indexOf('lastNavigatedNotificationId = id')
  const push = body.indexOf('router.push(target')
  assert.ok(claim > 0, 'the dedupe claim must still exist')
  assert.ok(push > 0, 'the navigation must still exist')
  assert.ok(
    claim > push,
    'claiming the id before navigating is the bug: the gated cold-start retry is then a no-op',
  )
})

test('THE ORDERING: nothing navigates before the router has left splash', () => {
  const body = navBody()
  const gate = body.indexOf('hasSettledRoute()')
  const push = body.indexOf('router.push(target')
  assert.ok(gate > 0, 'the settled-route gate must exist')
  assert.ok(gate < push, 'the gate must precede the navigation')
})

test('THE ORDERING: the intent is queued even when we cannot navigate yet', () => {
  // COS-947 — a tap must survive a sign-in. Gating above deferNavigation
  // would lose it on exactly the cold starts where the session expired.
  const body = navBody()
  const defer = body.indexOf('deferNavigation(target)')
  const gate = body.indexOf('hasSettledRoute()')
  assert.ok(defer > 0, 'deferNavigation must still be called')
  assert.ok(defer < gate, 'the intent must be queued before the settled-route gate')
})

test('hasSettledRoute reads SEGMENTS, not a pathname', () => {
  // COS-942: usePathname() strips group segments, so it can never tell
  // '/(auth)/sign-in' from '/sign-in'. Everything here compares segments.
  const gate = read('lib', 'lock-gate.ts')
  const fn = gate.slice(gate.indexOf('export function hasSettledRoute'))
  assert.match(fn.slice(0, 200), /_currentSegments/)
})

test('COS-1167: the full-intake route carries retake=1, the param the wizard reads', () => {
  // The wizard gates on `params.retake === '1'`. `source=retake-request` is
  // read by NOTHING in the app — it was decorative, and on its own it left a
  // completed-intake patient staring at IntakeCompleteView.
  const routes = read('lib', 'retake-routes.ts')
  const wizard = read('components', 'health-plan', 'patient-intake', 'IntakeWizardScreen.tsx')
  assert.match(wizard, /params\.retake === '1'/, 'the wizard still gates on retake=1')
  assert.match(routes, /patient-intake\?retake=1/, 'the route must send retake=1')
})

test('COS-1169: a domain scope opens the catalog on that domain bucket', () => {
  // No new screen — the catalog's CHUNK-69 ?focus= deep link already does this,
  // and its grouping already obeys the COS-851 single oracle.
  const routes = read('lib', 'retake-routes.ts')
  // CODE only — the comments in that file name the spiritual roll-up in prose,
  // and the last assertion here would otherwise flag its own explanation.
  const code = routes.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const [key, focus] of [
    ["'domain:biological'", 'bio'],
    ["'domain:psychological'", 'psy'],
    ["'domain:social'", 'soc'],
  ]) {
    assert.ok(code.includes(`${key}: '${focus}'`), `${key} must map to ${focus}`)
  }
  // spiritual rolls up to social; a fourth bucket must not appear here either.
  assert.doesNotMatch(code, /domain:spiritual/)
})

test('COS-1169: all-assessments opens the catalog unfiltered', () => {
  const routes = read('lib', 'retake-routes.ts')
  assert.match(routes, /all-assessments'\)\s*\{[\s\S]{0,120}assessments-catalog\?source=retake-request/)
})
