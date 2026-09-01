/**
 * COS-802 — every block on the care plan is composable.
 *
 * COS-755 gave the care plan per-section gates and missed four of them. Two
 * keys (view-wellbeing-score, view-ai-summary) and the three domain keys sat
 * in the catalog with NO call site, so an admin could untick them and nothing
 * happened — the worst kind of control, one that looks like it works. Today's
 * Tasks and View Progress had no key at all.
 *
 * Source-text assertions rather than renders: `node --test` cannot resolve the
 * `@/` alias, and these are structural facts about which gate guards which
 * block. See feedback_node_test_no_alias_imports.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const bps = read('components/health-plan/BiopsychosocialPlanScreen.tsx')
const tiles = read('components/health-plan/BpsHeroTileRow.tsx')

/** Every section key the screen is expected to gate on. */
const SECTION_KEYS = [
  'view-wellbeing-score',
  'view-todays-tasks',
  'view-progress',
  'view-wellbeing-map',
  'view-self-assessments',
  'view-ai-summary',
  'view-daily-routines',
  'view-nutrition-plan',
  'view-medications',
  'share-plan-pdf',
  'view-bio-section',
  'view-psychological-section',
  'view-social-section',
]

test('THE POINT: every catalogued section key has a call site', () => {
  // A key with no call site is a switch wired to nothing. An admin unticks it,
  // saves, sees the audit row, and the patient's screen is unchanged.
  const missing = SECTION_KEYS.filter(
    (k) => !bps.includes(`useCanRender('biopsychosocial-plan.${k}')`),
  )
  assert.deepEqual(missing, [], `keys in the catalog with no gate: ${missing.join(', ')}`)
})

test('the two hero tiles are gated INDEPENDENTLY', () => {
  // They are one component but two blocks. Ken's example was a plan with
  // Today's Tasks and no Wellbeing score, which a single gate cannot express.
  assert.match(bps, /showWellbeing=\{canWellbeingScore\}/)
  assert.match(bps, /showToday=\{canTodaysTasks\}/)
  assert.match(tiles, /showWellbeing = true/)
  assert.match(tiles, /showToday = true/)
})

test('a row with neither tile renders nothing, not an empty strip', () => {
  // styles.wrap carries its own spacing, so returning it with no children
  // leaves a gap above the map that reads as a stuck loading state.
  assert.match(tiles, /if \(!showWellbeing && !showToday\) return <><\/>/)
})

test('an expanded tile cannot outlive its own gate', () => {
  // `expanded` is local state. Switch to a plan without Today's Tasks while
  // that tile is open and the card would stay mounted under a tile that is
  // now denied.
  assert.match(tiles, /expanded === 'wellbeing' \? showWellbeing : showToday/)
})

test('the domain sections are FILTERED, not blanked', () => {
  // Gating inside the map would leave the wrapper, its divider and its
  // spacing behind — a labelled gap where a card used to be.
  assert.match(bps, /SECTION_ORDER\.filter\(/)
  assert.match(bps, /canBioSection/)
  assert.match(bps, /canPsychologicalSection/)
  assert.match(bps, /canSocialSection/)
})

test('THE POINT: Switch plan is never gated', () => {
  // A patient on a thin plan needs the way out of it more than anyone.
  // Gating the escape hatch on the plan being escaped is a trap.
  const pill = bps.slice(bps.indexOf('<PlanTierPill', bps.indexOf('<GreetingHeader')))
  // Stop at the progress pill's own gate, not at its tag — the gate line sits
  // above the tag, so slicing to the tag would swallow it and pass trivially.
  const uptoProgress = pill.slice(0, pill.indexOf('BPS_PROGRESS_LINK_ENABLED'))
  assert.doesNotMatch(uptoProgress, /canViewProgress|useCanRender/)
})

test('the kill-switch and the entitlement both have to agree', () => {
  // The BPS_* consts are the global kill-switches and the entitlement is the
  // per-plan answer. Replacing one with the other would lose a control.
  assert.match(bps, /BPS_AI_SUMMARY_ENABLED && canAiSummary/)
  assert.match(bps, /BPS_PROGRESS_LINK_ENABLED && canViewProgress/)
})
