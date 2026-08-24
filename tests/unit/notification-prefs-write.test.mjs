/**
 * COS-777 — a failed preference SAVE must not report success.
 *
 * ─── THE CHAIN THIS BREAKS ───────────────────────────────────────────
 *
 * updateNotificationCategories caught every error and RESOLVED with
 * `{ flagEnabled: false, preferences: defaults }`, commented as "defensive".
 * It was the opposite of defensive:
 *
 *   1. It resolved, so React Query treated a failed save as a SUCCESS.
 *   2. onError — the rollback — became unreachable dead code.
 *   3. onSuccess ran with the fabricated result.
 *   4. flagEnabled:false makes buildCategoryGateFromPrefs return `undefined`.
 *   5. plan-task-notifications reads an undefined gate as EVERY CATEGORY ON
 *      (`categoryPrefs?.medicationTask !== false`).
 *   6. onSuccess then calls reconcilePlanTaskNotifications with that gate.
 *
 * So a failed attempt to turn a category OFF re-scheduled the whole local
 * notification queue with everything ON. The switch showed off, nothing was
 * saved, and the device got MORE notifications than before it was touched.
 *
 * Source-read rather than executed: `node --test` here cannot resolve the `@/`
 * alias these modules import through, and what matters is structural — which
 * of the two functions has a catch.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const api = read('services/api/notification-prefs.ts')
const screen = read('app/Home/reminder-settings.tsx')

/**
 * Body of a named exported async function, up to the next top-level export,
 * WITH COMMENTS STRIPPED.
 *
 * Stripping matters: the fix's own comment explains why there is no try/catch,
 * so a naive search for "catch" matches the prose that documents its absence.
 * The first version of this test failed for exactly that reason.
 */
function bodyOf(src, name) {
  const start = src.indexOf(`export async function ${name}`)
  assert.ok(start > -1, `${name} not found`)
  const after = src.indexOf('\nexport ', start + 10)
  const body = src.slice(start, after === -1 ? src.length : after)
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/^\s*\/\/.*$/gm, '')        // line comments
}

test('THE POINT: the WRITE path has no catch — it must reject', () => {
  // A swallowed write is indistinguishable from a successful one, and here it
  // was actively worse than a visible failure.
  const write = bodyOf(api, 'updateNotificationCategories')
  assert.ok(!/\bcatch\b/.test(write), 'updateNotificationCategories must not swallow errors')
  assert.ok(!/flagEnabled:\s*false/.test(write), 'must not fabricate a disabled result')
})

test('the READ path still fails soft — that part was correct', () => {
  // A stale view is survivable; an error screen on a settings page is not an
  // improvement. Only the write changed.
  const readFn = bodyOf(api, 'fetchNotificationCategories')
  assert.match(readFn, /catch/)
  assert.match(readFn, /flagEnabled:\s*false/)
})

test('the rollback in the mutation is now reachable', () => {
  // It existed all along and could never run, because the mutationFn resolved.
  const hook = read('hooks/use-notification-categories.ts')
  assert.match(hook, /onError:/)
  assert.match(hook, /setQueryData\(NOTIFICATION_CATEGORIES_KEY, context\.previous\)/)
})

test('THE POINT: the patient is told the save failed', () => {
  // Otherwise the rollback just looks like the switch bouncing back on its own.
  assert.match(screen, /categoriesMutation\.isError/)
  assert.match(screen, /didn&apos;t save/)
})

test('the error stays inside the iOS 26 primitive envelope', () => {
  // This screen is reached from the care plan; a new wrapper here is the
  // documented crash class.
  const block = screen.slice(screen.indexOf('categoriesMutation.isError'))
  const firstTag = block.slice(0, 200).match(/<(\w+)/)
  assert.ok(firstTag, 'expected an element')
  assert.equal(firstTag[1], 'Text')
})
