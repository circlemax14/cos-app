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

test('THE POINT: the rebuild blocks the PLAN but never the assessment gate', () => {
  /*
   * COS-846 — this assertion is the inverse of what it used to be, and the
   * old one encoded a deadlock.
   *
   * COS-822 put the rebuild above BOTH the gate and the plan, reasoning that
   * behind it sits a complete, confident care plan built for the plan just
   * left. That reasoning is still right about the PLAN and was wrong about
   * the gate.
   *
   * A switch sets planRegenPending=true and stamps assessmentsRequiredSince
   * =now in the same block, so every prior answer goes stale and something is
   * always owed. The one and only clearer of the flag is unreachable while
   * anything is owed. So the banner covered the gate, and the gate was the
   * only thing that could clear the banner: every switch ended on "Building
   * your plan" forever, on all six patient-visible plans.
   *
   * The gate is not stale content. It is the list of things to do.
   */
  const at = plus.indexOf('if (rebuilding) return <PlanBuildingBanner')
  assert.ok(at > -1, 'no rebuild block')
  assert.ok(
    at > plus.indexOf('assignments.canGenerate === false'),
    'the assessment gate must outrank the rebuild, or a switch deadlocks',
  )
  assert.ok(at < plus.indexOf('planQuery.data?.plan == null'), 'the rebuild must outrank the plan')
  assert.ok(at > plus.indexOf('if (showPlanGate)'), 'the chooser stays reachable during a rebuild')
})

test('THE POINT: the wait is bounded and has an exit', () => {
  // planRegenPending has one clearer, and it is skipped when the patient has
  // no FHIR id and when generation throws — both swallowed. A spinner that
  // cannot end is worse than an honest failure.
  assert.match(banner, /PATIENCE_MS/)
  assert.match(banner, /taking longer than it should/)
  assert.match(banner, /onChoosePlan/)
  assert.match(plus, /<PlanBuildingBanner onChoosePlan=/)
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

// ── COS-828: the catalog is the plan's too ───────────────────────────────

const catalog = read('components/health-plan/AssessmentCatalogContent.tsx')

test('THE POINT: the catalog offers only what the plan asks for', () => {
  // COS-822 scoped the section on the care plan and stopped there. Its "Take a
  // check-in" button opens this screen, which kept offering the whole library —
  // 31 instruments to a patient on a plan that names none. A patient could
  // complete twenty check-ins their plan never wanted, and none would satisfy
  // its gate.
  assert.match(catalog, /raw\.filter\(\(it\) => assignedIds\.has\(it\.instrumentId\)\)/)
})

test('the ORDER backfill cannot put the library back', () => {
  // It re-adds ids from a static list to fix ordering. Built from the RAW
  // list it would undo the scoping one line later.
  const at = catalog.indexOf('for (const id of ORDER)')
  const byId = catalog.indexOf('const byId = new Map(all.map(')
  assert.ok(byId > -1 && at > byId, 'byId must be built from the scoped list before the backfill')
})

test('it waits for the assignments rather than flashing 31', () => {
  assert.match(catalog, /const assignmentsKnown = assignmentsQuery\.data !== undefined/)
  assert.match(catalog, /assignmentsKnown\s*\n?\s*\? raw\.filter/)
})

test('THE POINT: "asks for none" is a different empty from "not loaded"', () => {
  // "Check back later" on a plan that asks for nothing sends someone back to a
  // screen that will never change.
  assert.match(catalog, /const planAsksForNone = assignmentsKnown && assignedIds\.size === 0/)
  assert.match(catalog, /does not ask for any check-ins right now/)
})

test('a FAILED assignments read does not claim the plan asks for none', () => {
  // Asserting something about a plan we could not read is the one claim worth
  // avoiding here.
  assert.match(catalog, /assignmentsKnown && assignedIds\.size === 0/)
})
