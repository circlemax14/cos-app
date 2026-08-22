// tests/unit/assessment-gate.test.mjs — COS-761
//
// Assessments due are taken BEFORE the care plan is shown. The sweeper creates
// the request on the plan's cadence, the patient lands here instead of on
// their plan, results are stored, the loop repeats — which is what gives the
// progress graphs evenly spaced data points.
//
// Source assertions rather than rendering: `node --test` cannot resolve the
// `@/` alias these modules import through.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const gate = read('components/health-plan/AssessmentGate.tsx')
const screen = read('components/health-plan/BiopsychosocialPlanScreen.tsx')

test('THE POINT: the gate is the LAST early return', () => {
  // Loading, error, no-tier and no-plan must all win over it. Gating someone
  // who has no plan to gate, or swallowing a failed fetch behind a
  // questionnaire, strands them with no way forward.
  const iError = screen.indexOf('if (planQuery.isError)')
  const iNoPlan = screen.indexOf('if (!plan) {')
  const iGate = screen.indexOf('if (blockingAssessments.length > 0)')
  assert.ok(iError > -1 && iNoPlan > -1 && iGate > -1)
  assert.ok(iGate > iError, 'gate must come after the error branch')
  assert.ok(iGate > iNoPlan, 'gate must come after the no-plan branch')
})

test('the hook is declared unconditionally, above every early return', () => {
  // A conditional hook on this screen is the documented SIGABRT.
  const iHook = screen.indexOf('const retakeQuery = usePendingRetakeRequests()')
  const iFirstReturn = screen.indexOf('if (planQuery.isError)')
  assert.ok(iHook > -1)
  assert.ok(iHook < iFirstReturn, 'hook must precede the first early return')
})

test('AppWrapper is kept, so the drawer stays reachable', () => {
  // The drawer is the route to emergency contact and allergies. Dropping the
  // wrapper is exactly what makes those unreachable.
  const branch = screen.slice(screen.indexOf('if (blockingAssessments.length > 0)'))
  assert.match(branch.slice(0, 400), /<AppWrapper>/)
})

test('medications stay reachable from the gate', () => {
  // MedicationsBanner on the plan behind this is the only in-plan route to
  // them; what a patient takes today should not sit behind a questionnaire.
  assert.match(gate, /router\.push\('\/Home\/medications'/)
})

test('crisis support is on the gate', () => {
  // PCL-5 and ACE are seeded. A trauma screener with no route to help behind
  // it is the version of this screen that could do harm.
  assert.match(gate, /988/)
})

test('a snoozed request does not block', () => {
  assert.match(gate, /snoozeUntil && r\.snoozeUntil > nowIso/)
})

test('only pending requests block', () => {
  assert.match(gate, /r\.status === 'pending'/)
})

test('the gate routes into the real assessment, not a placeholder', () => {
  assert.match(gate, /retakeStartRoute\(first\.instrumentKey\)/)
})

test('the gate stays inside the iOS 26 primitive envelope', () => {
  const m = gate.match(/import \{([^}]+)\} from 'react-native'/)
  assert.ok(m)
  const allowed = new Set(['Pressable', 'ScrollView', 'StyleSheet', 'Text', 'View'])
  for (const n of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
    assert.ok(allowed.has(n), `unexpected primitive "${n}"`)
  }
})
