// tests/unit/care-plan-section-gates.test.mjs — COS-755
//
// The care plan is COMPOSED now, not a fixed tier. "Basic" and "Advanced"
// were hardcoded ladders with a fixed set of things in each; an admin builds
// a plan from these sections and can rename the result freely, so every gate
// has to sit on a SECTION and never on the plan's name.
//
// Source assertions rather than rendering, because `node --test` cannot
// resolve the `@/` alias this screen imports through.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const screen = read('components/health-plan/BiopsychosocialPlanScreen.tsx')

const SECTIONS = [
  ['canWellbeingMap',    'view-wellbeing-map',    'WellbeingMapGlimpse'],
  ['canSelfAssessments', 'view-self-assessments', 'SelfAssessmentTrends'],
  ['canDailyRoutines',   'view-daily-routines',   'HabitsBanner'],
  ['canNutrition',       'view-nutrition-plan',   'NutritionPlanSection'],
  ['canMedications',     'view-medications',      'MedicationsBanner'],
  ['canSharePdf',        'share-plan-pdf',        'SharePlanSection'],
]

for (const [flag, key, component] of SECTIONS) {
  test(`${component} is gated on ${key}`, () => {
    // COS-803 renamed the hook result to `raw<Flag>` and derives `<flag>` from
    // it through gate(), so the classic Care Plan tab can render this same
    // component with gating OFF. Both halves are asserted: the key is still
    // read, and the derived flag is still what guards the render site.
    assert.match(screen, new RegExp(`const raw${flag[0].toUpperCase()}${flag.slice(1)} = useCanRender\\('biopsychosocial-plan\\.${key}'\\)`))
    assert.match(screen, new RegExp(`const ${flag} = gate\\(raw${flag[0].toUpperCase()}${flag.slice(1)}\\)`))
    assert.match(screen, new RegExp(`\\{${flag} && `), `${component} render site is not gated`)
  })
}

test('THE POINT: no gate keys off the plan NAME', () => {
  // An admin can rename Advanced to anything. A tier check would silently
  // stop matching the moment they did, and nothing would report it.
  const body = screen.slice(screen.indexOf('const canWellbeingMap'))
  assert.doesNotMatch(body, /planType === ['"](basic|advanced)['"]/)
  assert.doesNotMatch(body, /planKey === ['"](basic|advanced)['"]/)
})

test('gates are plain conditionals — the iOS 26 rendering envelope', () => {
  // This screen has crashed production from cold-mount rendering. Gating must
  // not introduce wrapper components or new primitives.
  for (const [flag] of SECTIONS) {
    assert.match(screen, new RegExp(`\\{${flag} && `))
  }
  assert.doesNotMatch(screen, /<Gate[ >]/)
  assert.doesNotMatch(screen, /<EntitlementBoundary/)
})

test('useCanRender is used, not useHasExplicitGrant', () => {
  // useCanRender treats the wildcard as a grant, so these stay inert on prod
  // and staging where plan_tier_enabled is unset. Explicit-grant-only would
  // blank the care plan for every patient the moment it shipped.
  assert.match(screen, /useCanRender/)
  assert.doesNotMatch(screen, /useHasExplicitGrant/)
})
