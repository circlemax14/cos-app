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

test('the retake case reaches the shared route builder, not a literal', () => {
  // One definition of the destination, shared with the card's "Start now".
  // Asserted on the CASE BODY — matching the file would also match the
  // import line, which is true even when the case returns null.
  const code = ROUTING.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const i = code.indexOf("case 'ASSESSMENT_RETAKE_REQUESTED'")
  assert.ok(i > 0, 'the retake case must be named, not left to the default')
  const body = code.slice(i, code.indexOf('case ', i + 10))
  assert.match(body, /retakeStartRoute\(/, 'the case must build the route, not return Home')
  assert.match(body, /instrumentKey/, 'the case must read the instrumentKey the backend sends')
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
