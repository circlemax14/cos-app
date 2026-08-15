/**
 * Today's adherence is computed in exactly ONE place.
 *
 * Ken 2026-08-13, holding the Care Plan screen next to the schedule screen:
 * "Does not match with patient page."
 *
 * They did not match because each screen had its own arithmetic. The Care Plan
 * hero divided by every task in the day; the schedule screen divides by the
 * tasks due so far. At 9am, two of six done and two due, one surface read 33%
 * and the other 100%.
 *
 * This is the second time a duplicated definition has drifted into a
 * user-visible contradiction on this app — pickWellbeingDisplayScore was
 * extracted for the same reason a day earlier. Behavioural tests cannot catch
 * it: both copies pass their own tests happily, and the defect only exists in
 * the gap between them. So this reads the source and asserts there is no
 * second copy to drift.
 *
 * If you are here because this test failed: do not add a local percentage.
 * Import computeAdherence from lib/today-timeline.ts.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = join(HERE, '..', 'app', 'Home')

/**
 * Strip comments before matching. A previous guard test in this repo was
 * fooled by a phrase sitting in a comment rather than in code — the whole
 * point is to assert what SHIPS, and comments do not ship.
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const PLAN = codeOnly(readFileSync(join(APP, 'health-plan.tsx'), 'utf8'))
const SCHEDULE = codeOnly(readFileSync(join(APP, 'today-schedule.tsx'), 'utf8'))

test('both surfaces import the shared computeAdherence', () => {
  for (const [name, src] of [['health-plan', PLAN], ['today-schedule', SCHEDULE]]) {
    assert.match(
      src,
      /computeAdherence/,
      `${name}.tsx must get its adherence from lib/today-timeline.ts, not its own arithmetic`,
    )
  }
})

test('THE REGRESSION: the plan screen no longer divides by the whole day', () => {
  // The exact shape of the bug: completedCount / tasks.length. Any
  // percentage derived from the full task list re-opens the mismatch,
  // because the schedule screen counts only what is due.
  assert.doesNotMatch(
    PLAN,
    /completedCount\s*\/\s*tasks\.length/,
    'health-plan.tsx computed a whole-day percentage again — this is the exact expression Ken saw disagree with the schedule screen',
  )
  assert.doesNotMatch(
    PLAN,
    /completedToday\s*\/\s*totalToday/,
    'the ProgressTab "Adherence" stat computed its own whole-day percentage again',
  )
})

test('the plan screen derives every adherence figure from the one memo', () => {
  // Hero percentage and the ProgressTab stat both read `adherence`, so a
  // future edit to one cannot silently desync it from the other.
  assert.match(
    PLAN,
    /progressPct\s*=\s*adherence\.percent\s*\/\s*100/,
    'the hero percentage must come from the shared adherence result',
  )
  assert.match(
    PLAN,
    /adherencePercent\s*=\s*adherence\.percent/,
    'the ProgressTab "Adherence" stat must come from the shared adherence result',
  )
})

test('the hero caption is stated against the same denominator it displays', () => {
  // "100%" over "2 of 6 tasks done" was a contradiction visible without
  // scrolling. The caption must speak in due-so-far terms.
  assert.match(
    PLAN,
    /adherence\.done\}\s*of\s*\$\{adherence\.due\}/,
    'the hero caption must read against adherence.due, not tasks.length',
  )
})
