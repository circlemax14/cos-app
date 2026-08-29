/**
 * COS-778 — the deferred-navigation queue behind the PIN lock fixes.
 *
 * This is the piece that lets inbound navigation be BLOCKED while locked
 * without breaking it. Dropping a notification tap outright would close the
 * bypass and produce "I tap the notification and nothing happens"; deferring
 * closes it and keeps the feature.
 *
 * The queue is plain TypeScript with no `@/` imports, so unlike most of this
 * suite it can be executed rather than source-read. Compiled on the fly with
 * the repo's own tsc so the test runs the real module.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let q
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lnq-'))
  const src = readFileSync(new URL('../../lib/locked-nav-queue.ts', import.meta.url), 'utf8')
  writeFileSync(join(dir, 'q.ts'), src)
  const out = join(dir, 'q.js')
  try {
    execFileSync(
      'npx',
      ['tsc', join(dir, 'q.ts'), '--module', 'esnext', '--target', 'es2020', '--skipLibCheck'],
      { cwd: process.cwd(), stdio: 'pipe' },
    )
  } catch {
    // tsc exits non-zero over unrelated ambient @types resolution noise in this
    // repo while still EMITTING. What matters is whether the JS came out, so
    // that is what we check — not the exit code.
  }
  assert.ok(existsSync(out), 'tsc did not emit — cannot run the real module')
  q = await import(`file://${out}`)
})

test('THE POINT: a deferred route survives to be replayed', () => {
  q.clearDeferredNavigation()
  q.deferNavigation('/Home/biopsychosocial-plan')
  assert.equal(q.consumeDeferredNavigation(), '/Home/biopsychosocial-plan')
})

test('THE POINT: consuming CLEARS it — a replay cannot fire twice', () => {
  // An unlock that fails partway must not leave a route armed for the next one.
  q.clearDeferredNavigation()
  q.deferNavigation('/Home/medications')
  q.consumeDeferredNavigation()
  assert.equal(q.consumeDeferredNavigation(), null)
})

test('the LATEST tap wins — three notifications are not three navigations', () => {
  q.clearDeferredNavigation()
  q.deferNavigation('/a')
  q.deferNavigation('/b')
  q.deferNavigation('/c')
  assert.equal(q.consumeDeferredNavigation(), '/c')
  assert.equal(q.consumeDeferredNavigation(), null)
})

test('THE POINT: it expires — an overnight route is not still wanted', () => {
  q.clearDeferredNavigation()
  let t = 1_000_000
  q.__setNowForTests(() => t)
  q.deferNavigation('/Home/labs')
  t += 6 * 60 * 1000 // TTL is 5 minutes
  assert.equal(q.consumeDeferredNavigation(), null)
  q.__setNowForTests()
})

test('just inside the TTL still replays', () => {
  q.clearDeferredNavigation()
  let t = 1_000_000
  q.__setNowForTests(() => t)
  q.deferNavigation('/Home/labs')
  t += 4 * 60 * 1000
  assert.equal(q.consumeDeferredNavigation(), '/Home/labs')
  q.__setNowForTests()
})

test('THE POINT: clearing on sign-out stops cross-account navigation', () => {
  // Without this, signing out and back in as someone else could land the new
  // session on the previous user's screen — a PHI leak dressed as convenience.
  q.clearDeferredNavigation()
  q.deferNavigation('/Home/health-summary')
  q.clearDeferredNavigation()
  assert.equal(q.consumeDeferredNavigation(), null)
})

test('a non-route is refused rather than stored', () => {
  q.clearDeferredNavigation()
  q.deferNavigation('javascript:alert(1)')
  q.deferNavigation('')
  assert.equal(q.consumeDeferredNavigation(), null)
})

test('hasDeferredNavigation does not consume', () => {
  q.clearDeferredNavigation()
  q.deferNavigation('/Home')
  assert.equal(q.hasDeferredNavigation(), true)
  assert.equal(q.hasDeferredNavigation(), true)
  assert.equal(q.consumeDeferredNavigation(), '/Home')
})
