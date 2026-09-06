/**
 * COS-778 / SCRUM-721 — inbound navigation must not walk past the PIN lock.
 *
 * The lock is a `router.replace` onto the stack, not a render gate, so anything
 * that changes the stack reaches live PHI. These pin the four entry points that
 * were closed. They are source assertions because `node --test` cannot resolve
 * the `@/` alias these modules import through — but each asserts a specific
 * structural fact, not the presence of a comment.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
/** Comments explain the fix; they must never BE the fix. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const notif = code(read('hooks/use-notifications.ts'))
const intent = code(read('app/+native-intent.ts'))
const layout = code(read('app/_layout.tsx'))
const applock = code(read('hooks/use-app-lock.ts'))
const lockScreen = code(read('app/(security)/lock-screen.tsx'))

test('BYPASS 2 — a notification tap defers instead of navigating while locked', () => {
  // The only one of the four needing NO precondition: a push arrives, the tap
  // pushed a PHI route on top of the lock screen. Verified in the ticket as
  // having zero references to any lock state.
  assert.match(notif, /isAppLocked\(\)/)
  assert.match(notif, /deferNavigation\(/)
  const i = notif.indexOf('isAppLocked()')
  const j = notif.indexOf('router.push(target')
  assert.ok(i > -1 && j > i, 'the lock check must come BEFORE the push')
})

test('BYPASS 2 — the catch-fallback push is gated too', () => {
  // It fell back to router.push('/Home') on any failure. A navigation error
  // must not become a way past the lock.
  const fallback = notif.slice(notif.indexOf('catch'))
  assert.match(fallback, /isAppLocked\(\)/)
})

test('BYPASS 3 — deep links go through redirectSystemPath and can be refused', () => {
  assert.match(intent, /export async function redirectSystemPath/)
  assert.match(intent, /return null/)
  assert.match(intent, /deferNavigation\(/)
})

test('THE POINT: a cold start decides from STORAGE, not the in-memory flag', () => {
  // On `initial: true` the lock flag is not yet authoritative — SecurityProvider
  // resolves it in an effect. Reading it there would wave every cold-start link
  // through, which is exactly the case someone holding the phone would use.
  assert.match(intent, /isPinSetup\(\)/)
  const coldBranch = intent.slice(intent.indexOf('if (initial)'), intent.indexOf('if (isAppLocked'))
  assert.match(coldBranch, /await isPinSetup\(\)/)
})

test('THE POINT: no PIN means the link PASSES — deferring it would strand it', () => {
  // Nothing drains the queue when no lock screen ever mounts, so deferring
  // here would silently break deep links on every cold start. This is the
  // difference between a fix and a regression.
  const coldBranch = intent.slice(intent.indexOf('if (initial)'), intent.indexOf('if (isAppLocked'))
  assert.match(coldBranch, /if \(!pinConfigured\) return path/)
})

test('an unreadable PIN state fails CLOSED', () => {
  // Deferring a link is recoverable; showing PHI is not.
  const coldBranch = intent.slice(intent.indexOf('if (initial)'), intent.indexOf('if (isAppLocked'))
  assert.match(coldBranch, /pinConfigured = true/)
})

test('BYPASS 1 — the security stack disables the iOS swipe-back gesture', () => {
  // headerShown:false does NOT disable it, and nothing in the repo set it.
  assert.match(layout, /name="\(security\)"[\s\S]{0,160}gestureEnabled:\s*false/)
})

test('BYPASS 1 — the stack is collapsed BEFORE the lock replace', () => {
  // replace() swaps only the top entry, leaving a root-level screen mounted
  // underneath for the gesture to return to.
  const i = applock.indexOf('dismissAll')
  const j = applock.indexOf("router.replace('/(security)/lock-screen'")
  assert.ok(i > -1, 'dismissAll missing')
  assert.ok(j > i, 'dismissAll must run BEFORE the replace')
})

test('dismissAll cannot throw the lock path open', () => {
  // It throws when there is nothing to dismiss, and this runs in the resume
  // path that produced the triple-Face-ID prompt. An unhandled throw would
  // leave _appLocked=true with no lock screen showing — worse than the bypass.
  const around = applock.slice(applock.indexOf('dismissAll') - 120, applock.indexOf('dismissAll') + 120)
  assert.match(around, /try\s*\{/)
})

test('THE POINT: unlock replays the deferred route', () => {
  // Without this the gate is just "notifications stop working".
  assert.match(lockScreen, /consumeDeferredNavigation\(\)/)
  const resume = lockScreen.slice(lockScreen.indexOf('async function resumeAfterUnlock'))
  const i = resume.indexOf('consumeDeferredNavigation')
  const j = resume.indexOf('router.replace')
  assert.ok(i > -1 && j > i, 'the drain must happen before the replace')
})

test('LockShield is still NOT wired — that edit needs a device', () => {
  // Deliberate. It sits inside every provider above the navigator; if it throws
  // on mount the app white-screens. Guarded so a later change does not wire it
  // silently without the device pass the ticket calls for.
  assert.ok(!/LockShield/.test(layout), 'LockShield wiring must remain a human+device step')
})
