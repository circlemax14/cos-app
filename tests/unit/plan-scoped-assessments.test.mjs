/**
 * COS-822 — the plan owns its assessments section, and the rebuild blocks.
 *
 * Both come from the same complaint: the app kept showing content belonging to
 * a plan the patient no longer held, and it looked entirely current.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const trends = read('components/health-plan/SelfAssessmentTrends.tsx')
const plus = read('app/Home/care-plan-plus.tsx')
const banner = read('components/plan/PlanBuildingBanner.tsx')

test('THE POINT: the section shows only what THIS plan asks for', () => {
  // It listed everything ever completed, so moving from a plan requiring PHQ-2
  // to one requiring nothing kept the psychological results on screen under a
  // heading belonging to the new plan.
  assert.match(trends, /assignments\.data\?\.assignedInstrumentIds/)
  assert.match(trends, /inPlan\.has\(r\.instrumentId\)/)
})

test('nothing assigned shows nothing — no fallback to "everything"', () => {
  // Most plans name no assessments. Falling back would restore the exact bug.
  const scoped = trends.slice(trends.indexOf('const scoped ='), trends.indexOf('const records ='))
  assert.doesNotMatch(scoped, /\|\|\s*query\.data/)
})

test('it waits for the assignment query rather than flashing everything', () => {
  // Showing all of them for a beat and then removing most reads as a glitch.
  assert.match(trends, /assignments\.data === undefined/)
})

test('THE POINT: the rebuild BLOCKS, it does not banner over the old plan', () => {
  // Behind it sits a complete, confident care plan built for the plan just
  // left. A banner above it would leave the wrong goals and tasks tappable.
  assert.match(plus, /if \(rebuilding\) return <PlanBuildingBanner \/>;/)
  const at = plus.indexOf('if (rebuilding)')
  // It outranks the ASSESSMENT gate and the plan — but NOT the chooser.
  // Blocking the chooser mid-rebuild would trap someone who had just switched
  // with no way to switch again; the chooser is the way out, not the problem.
  assert.ok(at > -1, 'no rebuild block')
  assert.ok(at < plus.indexOf('assignments.canGenerate === false'), 'the rebuild must outrank the assessment gate')
  assert.ok(at < plus.indexOf('planQuery.data?.plan == null'), 'the rebuild must outrank the plan')
  assert.ok(at > plus.indexOf('if (showPlanGate)'), 'the chooser stays reachable during a rebuild')
})

test('the blocked screen polls its own way out', () => {
  // No push exists for this, and a screen needing a manual refresh to leave is
  // worse than a few requests.
  assert.match(plus, /setInterval\(\(\) => void assignmentsQuery\.refetch\(\), 5000\)/)
  assert.match(plus, /return \(\) => clearInterval\(id\)/)
})

test('the banner says WHY the old plan is not shown', () => {
  // Without that, a blocked screen reads as the app being stuck rather than a
  // deliberate wait.
  assert.match(banner, /built for a different\s*\n?\s*plan/)
})
