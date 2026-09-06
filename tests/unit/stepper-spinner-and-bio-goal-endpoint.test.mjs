// tests/unit/stepper-spinner-and-bio-goal-endpoint.test.mjs — COS-C1 + COS-C4
//
// Two independent one-line bugs, one wire each. Both were invisible in
// production for the same reason: the failure looks like "nothing happened".
//
//   C1  app/Home/assessment-stepper.tsx spun forever on any instrumentId the
//       /instruments 200 didn't contain (dietary screener). The guard read
//       `isLoading || (!instrument && !error)` — on a settled, successful,
//       id-missing response all three legs are false/undefined-y in exactly
//       the way that keeps the spinner mounted, so the "Check-in not found"
//       screen below it (the ONLY exit) was unreachable dead code.
//
//   C4  hooks/use-biopsychosocial-plan.ts PUT a BIOPSYCHOSOCIAL goal id to the
//       LEGACY AI-plan endpoint. Separate DDB rows, independently minted
//       uuids → permanent 404, swallowed by fireAndForgetPut and papered over
//       by the optimistic onMutate.
//
// Source-level greps: both fixes are one token / one URL, so there is nothing
// to unit-test behaviourally without a React + axios harness. Comments are
// stripped before matching — the prose above names both bad patterns, and
// prose naming a pattern must never count as using it.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const readCode = (rel) =>
  fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const stepper = readCode('app/Home/assessment-stepper.tsx')
const bioHook = readCode('hooks/use-biopsychosocial-plan.ts')

// ── COS-C1: the stepper spinner must be settled-state only ────────────────

test('THE POINT: the stepper spinner is gated on isPending alone', () => {
  // isPending is true exactly while `data` is undefined, which still covers
  // the paused/offline case the old `!instrument && !error` clause was there
  // for. Once settled, control MUST reach the not-found screen.
  assert.match(stepper, /if \(instrumentsQuery\.isPending\)\s*\{/)
})

test('no leg of the spinner guard may test the resolved instrument', () => {
  // `!instrument` in the spinner condition is the whole bug: a settled 200
  // that lacks the id keeps you spinning and never reaches the exit.
  const guard = stepper.match(/if \([^)]*instrumentsQuery[^)]*\)\s*\{/g) ?? []
  assert.ok(guard.length > 0, 'expected a guard mentioning instrumentsQuery')
  for (const g of guard) {
    assert.ok(!/!\s*instrument\b/.test(g), `spinner guard tests !instrument: ${g}`)
    assert.ok(!/isLoading/.test(g), `spinner guard uses isLoading, not isPending: ${g}`)
  }
})

test('the not-found screen is reachable and keeps its way out', () => {
  // It is the only escape from a bad/retired instrumentId. Its button routes
  // via returnHref, which the plan gate sets — losing either makes the screen
  // a dead end again even once the spinner is fixed.
  const idx = stepper.indexOf('Check-in not found')
  assert.ok(idx > 0, 'not-found screen removed')
  assert.ok(
    stepper.lastIndexOf('if (!instrument) {', idx) > 0,
    'not-found screen must still be guarded by a plain !instrument check',
  )
  const tail = stepper.slice(idx, idx + 900)
  assert.match(tail, /router\.replace\(returnHref as never\)/)
  assert.match(tail, /Back to check-ins/)
})

// ── COS-C4: bio goal edits go to the bio plan ─────────────────────────────

test('THE POINT: useUpdateBioGoal PUTs to the biopsychosocial goal route', () => {
  assert.match(
    bioHook,
    /fireAndForgetPut\(\s*`\/v1\/health-plan\/biopsychosocial\/goals\/\$\{encodeURIComponent\(goalId\)\}`/,
  )
})

test('the hook never addresses the legacy AI-plan goal route', () => {
  // Separate DDB row, separate uuid space — a BPS goal id is never found
  // there, and the 404 is swallowed twice over.
  assert.ok(
    !/health-plan\/ai\/goals/.test(bioHook),
    'bio goal edit is pointed back at the legacy AI-plan endpoint',
  )
})

test('subdomain chip edits are still sent in the patch body', () => {
  // The BPS schema accepts `subdomains`; the AI schema does not, so these
  // were being dropped silently before the route swap. The editors compute
  // them, so the hook must forward the whole patch untouched.
  assert.match(bioHook, /patch as unknown as Record<string, unknown>/)
  for (const rel of [
    'components/health-plan/BioGoalEditorModal.tsx',
    'app/Home/health-plan.tsx',
    'app/Home/biopsychosocial-plan.tsx',
  ]) {
    assert.match(readCode(rel), /patch\.subdomains = /, `${rel} stopped sending subdomains`)
  }
})
