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

// ── COS-803: two tabs, and only one of them can be wrong ──────────────────

test('THE POINT: the classic Care Plan tab cannot be gated', () => {
  // Every previous round of entitlement work was built on top of the tab
  // patients already rely on, and every round broke it. The classic tab now
  // renders the SAME component with `entitlementGating` absent, so no plan —
  // however badly provisioned — can hide a section there.
  const classic = read('app/Home/health-plan.tsx')
  assert.doesNotMatch(classic, /entitlementGating/)
  assert.doesNotMatch(classic, /showPlanGate/)
})

test('the gate defaults CLOSED — absent prop means no gating', () => {
  // If this defaulted true, every existing call site would start composing
  // silently, which is the failure the second tab exists to prevent.
  assert.match(bps, /entitlementGating = false/)
  assert.match(bps, /const gate = \(allowed: boolean\): boolean => !entitlementGating \|\| allowed/)
})

test('every section flag goes through gate(), none reads the hook directly', () => {
  // A gate wired straight to useCanRender would still fire on the classic
  // tab. The raw value must never guard a render site.
  const raws = [...bps.matchAll(/const (raw\w+) = useCanRender\(/g)].map((m) => m[1])
  assert.ok(raws.length >= 13, `expected 13+ raw gates, found ${raws.length}`)
  for (const raw of raws) {
    const derived = raw.replace(/^raw/, '')
    const flag = derived[0].toLowerCase() + derived.slice(1)
    assert.match(bps, new RegExp(`const ${flag} = gate\\(${raw}\\)`), `${raw} is not routed through gate()`)
    assert.doesNotMatch(bps, new RegExp(`\\{${raw} && `), `${raw} guards a render site directly`)
  }
})

test('Plan+ is a real tab with its own error boundary', () => {
  const layout = read('app/Home/_layout.tsx')
  const route = read('app/Home/care-plan-plus.tsx')
  assert.match(layout, /name="care-plan-plus"/)
  // Visible: no href: null in its block.
  const at = layout.indexOf('name="care-plan-plus"')
  const block = layout.slice(at, layout.indexOf('<Tabs.Screen', at))
  assert.doesNotMatch(block, /href: null/)
  // It is the tab most likely to throw, and the classic tab must survive it.
  assert.match(route, /<ScreenErrorBoundary screen="care-plan-plus">/)
  assert.match(route, /<CarePlanPlusInner \/>/)
})

test('Plan+ turns gating ON', () => {
  // Otherwise the two tabs are the same screen twice.
  assert.match(read('app/Home/care-plan-plus.tsx'), /entitlementGating/)
})

// ── COS-804: the two dead ends on Plan+ ──────────────────────────────────

test('THE POINT: the primary button on a card DOES the switch', () => {
  // It read "Upgrade to this plan" and only expanded a panel; the real Switch
  // was one level down. Tapping it produced no request at all — the backend
  // logs showed nothing, because nothing had been asked of it.
  const cards = read('components/plan/PlanStatusSection.tsx')
  const btn = cards.slice(cards.indexOf('!current && !comingSoon && canSwitch && ('))
  assert.match(btn.slice(0, 700), /onPress=\{\(\) => void onSwitch\(plan\.planKey\)\}/)
  assert.match(btn.slice(0, 700), /'Switch to this plan'/)
})

test('the failure is shown where the button is, not inside a closed panel', () => {
  // The error used to live in the expander. A switch that failed from the card
  // would have reported itself somewhere the patient could not see.
  const cards = read('components/plan/PlanStatusSection.tsx')
  const cardErr = cards.indexOf('canSwitch && switching === null && switchError !== null')
  const detail = cards.indexOf('the expanded detail')
  assert.ok(cardErr > -1, 'no switch error beside the card button')
  assert.ok(cardErr < detail, 'the switch error must render before the expander')
})

test("THE POINT: Plan+'s switch pill reopens ITS OWN chooser", () => {
  // It pushed /Home/plan-type-chooser — the OTHER plan concept (care plan
  // TYPE: basic/advanced/agency, which sets assessment depth). Tapping
  // "switch plan" on the entitlement surface and landing on the tier picker
  // is the wrong screen, and it is the one place a patient would look to
  // change the plan they had just picked off the shelf.
  const plus = read('app/Home/care-plan-plus.tsx')
  assert.match(plus, /onChangePlanType=\{\(\) => setPlanGateBypassed\(false\)\}/)
  // Navigation only — the prose above the prop still names the route it used
  // to push, and that comment is the reason the fix is legible.
  assert.doesNotMatch(plus, /router\.push\([^)]*plan-type-chooser/)
})

test('the CLASSIC tab still opens the plan-type chooser', () => {
  // Two tabs, two meanings of "plan". Repointing both pills at the shelf
  // would lose the tier picker entirely.
  const classic = read('app/Home/health-plan.tsx')
  assert.match(classic, /router\.push\('\/Home\/plan-type-chooser' as never\)/)
})

// ── COS-805: the pill must name what it opens ────────────────────────────

test('THE POINT: on Plan+ the pill names the ENTITLEMENT plan', () => {
  // The pill has always rendered the care plan TYPE (basic/advanced/agency,
  // which sets assessment depth). On Plan+ it opens the entitlement shelf, so
  // the type made the label and the destination disagree: switch to Standard
  // and a pill still reading "Advanced" opens a shelf where Standard is
  // badged YOUR PLAN.
  const plus = read('app/Home/care-plan-plus.tsx')
  assert.match(plus, /planLabel=\{patientPlansQuery\.data\?\.billing\?\.planName \?\? null\}/)
})

test('the label falls back to the plan type when not given', () => {
  // The classic tab passes nothing and must keep the type label, because its
  // pill still opens the type chooser.
  const matches = bps.match(/label=\{planLabel \?\? planTypeDisplayName\(/g) ?? []
  assert.equal(matches.length, 2, 'both pill sites must honour the override AND fall back')
  assert.doesNotMatch(read('app/Home/health-plan.tsx'), /planLabel/)
})

test('the label cannot lag a switch', () => {
  // Same query the shelf reads, and onSwitch invalidates it before closing the
  // gate — so the pill can never show the plan you just left.
  const cards = read('components/plan/PlanStatusSection.tsx')
  const body = cards.slice(cards.indexOf('async function onSwitch'))
  const inval = body.indexOf("invalidateQueries({ queryKey: ['patient-plans'] })")
  const done = body.indexOf('onSwitched?.()')
  assert.ok(inval > -1 && done > -1)
  assert.ok(inval < done, 'the refetch must be awaited before the gate closes')
})

// ── COS-806: the exit lives on your own card ─────────────────────────────

test('the exit is on the card badged YOUR PLAN', () => {
  // A pill in the corner put the instruction nowhere near the thing it refers
  // to. Your plan is one of the cards, and it is the only card with no other
  // control — you cannot switch to the plan you already hold.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /\{current && onGoToPlan && \(/)
  assert.doesNotMatch(read('app/Home/care-plan-plus.tsx'), /skipPill/)
})

test('THE POINT: the chooser always has an exit, even with no current card', () => {
  // The backend exempts the current plan from both shelf filters, so its card
  // is nearly always present. Retire that plan row and it is not — every card
  // reads isCurrent false and the button has nowhere to live, leaving someone
  // in a chooser with no way out. That is the failure this surface has already
  // produced four times.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /onGoToPlan && !plans\.some\(\(p\) => p\.isCurrent === true\)/)
})

test('Billing gets no exit button — it has no plan to go to', () => {
  // The same shelf renders on /Home/billing. onGoToPlan is optional precisely
  // so a button promising to open a care plan does not appear there.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /onGoToPlan\?: \(\) => void/)
  assert.doesNotMatch(read('app/Home/billing.tsx'), /onGoToPlan/)
})

// ── COS-807: the cards carry what the plan actually says ─────────────────

test('THE POINT: fields the API sends are no longer dropped by the client', () => {
  // displayPriceLabel and trialDays have come back from /v1/patients/me/plans
  // since COS-784/769 and the card's own interface omitted them, so they could
  // never render. A free plan showed a name and nothing else.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /displayPriceLabel\?: string \| null/)
  assert.match(cards, /trialDays\?: number \| null/)
  assert.match(cards, /label: priceLabel \} = priceLines\(plan\.pricing\)/)
})

test('a plan priced only by a label still shows a price', () => {
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /\{priceLabel \?\? monthly\}/)
})

test('the tier reaches the card', () => {
  // One word describing the plan's shape, thrown away entirely before this.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /plan\.tier \? \(/)
  assert.match(cards, /plan\.tier\.toUpperCase\(\)/)
})

test('highlights render as rows with a tick, not a text prefix', () => {
  // They were a "✓  " string glued to the front of a Text, which cannot wrap
  // or align — a two-line highlight hung under its own tick.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /name="check-circle"/)
  assert.doesNotMatch(cards, /`✓ {2}\$\{h\}`/)
  assert.match(cards, /highlightText.*flex: 1/s)
})

test('the strip variant still collapses its highlights', () => {
  // It renders inline above other content on the Care Plan tab, which is the
  // whole reason COS-789 collapsed them. Only the chooser is exempt.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /variant === 'chooser' \|\| current \|\| open/)
})

// ── COS-808: the cards are a table, not a bullet list ────────────────────

test('THE POINT: the label column is fixed-width', () => {
  // This is the whole reason the prod cards read well. A fixed muted label
  // against a flexible dark value makes four cards scan as a table, so the eye
  // compares like with like down the column. Let the label size to its text
  // and nothing lines up, which is what a bullet list already was.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /featureLabel: \{ width: \d+/)
  assert.match(cards, /featureValue: \{ flex: 1/)
})

test('real plan config leads the table', () => {
  // Assessment and Updates come from the plan itself and are the same for
  // everyone holding it — they are what a patient is actually choosing
  // between, so they outrank authored copy.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /label: 'Assessment'/)
  assert.match(cards, /label: 'Updates'/)
  const derived = cards.indexOf('{derived.map(')
  const labelled = cards.indexOf('{labelled.map(')
  const plain = cards.indexOf('{plain.map(')
  assert.ok(derived > -1 && labelled > derived && plain > labelled, 'table order: derived, labelled, plain')
})

test('a cadence of zero says so rather than vanishing', () => {
  // 0 means the plan deliberately does not nudge. Omitting the row would read
  // as "we do not know", which is a different claim.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /When your records change/)
  assert.match(cards, /typeof plan\.reassessmentCadenceDays === 'number'/)
})

test('an unlabelled highlight still renders, exactly as before', () => {
  // No migration: every plan authored before COS-808 has colon-free
  // highlights and must look the way it always did. The parser's own edge
  // cases are executed in tests/unit/plan-highlight.test.ts — it lives in lib/
  // precisely so it can be RUN rather than grepped.
  const cards = read('components/plan/PlanStatusSection.tsx')
  assert.match(cards, /\{plain\.map\(/)
  assert.match(cards, /from '@\/lib\/plan-highlight'/)
})
