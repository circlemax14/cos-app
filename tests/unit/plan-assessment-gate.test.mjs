/**
 * COS-813 — the assessment gate on Plan+.
 *
 * This is a HARD gate on care-plan access, so the failure mode is a patient
 * locked out with nothing to tap. These pin the conditions that keep that from
 * happening rather than the copy.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const gate = read('components/plan/PlanAssessmentGate.tsx')
const plus = read('app/Home/care-plan-plus.tsx')

test('THE POINT: the gate needs something to DO, not just a false flag', () => {
  // canGenerate is also false for an advanced-tier patient with nothing
  // assigned — their answer is "your care team will assign these" and they
  // have nothing to tap. Gating on the flag alone strands them.
  assert.match(plus, /assignments\.canGenerate === false && remaining\.length > 0/)
})

test('a slow query never flashes the gate', () => {
  // `assignments` is undefined while loading; the truthiness check is what
  // stops the plan being replaced by a questionnaire for a frame.
  assert.match(plus, /const assignments = assignmentsQuery\.data/)
  assert.match(plus, /if \(assignments && assignments\.canGenerate === false/)
})

test('the gate sits after the chooser and before the plan', () => {
  // Order is the design: you cannot be gated on a plan you have not picked,
  // and "no plan yet, tap to generate" while refusing to generate is a dead
  // end wearing a CTA.
  const chooser = plus.indexOf('if (showPlanGate)')
  const assess = plus.indexOf('assignments.canGenerate === false')
  const empty = plus.indexOf('planQuery.data?.plan == null')
  assert.ok(chooser > -1 && assess > chooser, 'the chooser must come first')
  assert.ok(empty > assess, 'the gate must precede the empty state')
})

test('THE POINT: the escape REVERTS the switch', () => {
  // A plain "later" leaves a patient holding a plan whose requirements they
  // have not met, with no plan to show — a state nothing else can resolve.
  assert.match(gate, /switchToPlan\(previousPlanKey\)/)
  assert.match(gate, /invalidateQueries\(\{ queryKey: \['health-plan-assignments'\] \}\)/)
  assert.match(gate, /invalidateQueries\(\{ queryKey: \['patient-plans'\] \}\)/)
})

test('no revert button when there is nowhere to revert to', () => {
  // A first-ever choice has no previous plan. A button that fails when
  // pressed is worse than an absent one.
  assert.match(gate, /\{previousPlanKey \? \(/)
})

test('one instrument at a time, returning here', () => {
  // A list of four launchers lets someone start the third, abandon it and
  // lose their place. A queue of one has no place to lose.
  assert.match(gate, /const next = remaining\[0\] \?\? null/)
  assert.match(gate, /instrumentId: next, returnTo: '\/Home\/care-plan-plus'/)
})

test('the count is shown, so the ask is bounded', () => {
  // "A few questions" with no number is the thing people abandon.
  assert.match(gate, /of \$\{String\(totalCount\)\} complete/)
})

test('the classic Care Plan tab is not gated', () => {
  // Same rule as every other part of this work: whatever is still being
  // figured out cannot reach the tab patients already rely on.
  assert.doesNotMatch(read('app/Home/health-plan.tsx'), /PlanAssessmentGate/)
})
