/**
 * Nutrition plan section contract.
 *
 * Ken 2026-08-07 asked for a "nutritional plan or support" section in the bio
 * part of the plan. The properties worth pinning here are the ones that cost
 * money or make a clinical claim if they regress:
 *
 *   - it must never generate — COS-1217/1218/1222 moved generation server-side
 *     alongside the care plan, so the app only READS,
 *   - it must never present a frequency as an amount (the NCI coefficients
 *     are not loaded, so cups/grams/servings would be fiction),
 *   - the care-team-review notice must not be dismissible or conditional,
 *   - a disabled flag or a missing entitlement must render nothing, not an
 *     error,
 *   - an accepted suggestion must land in ROUTINES, which survive a care-plan
 *     regeneration, and must carry the domain the backend assigned it.
 *
 * ── WHAT COS-1219/1220 REWROTE IN THIS FILE ──────────────────────────
 * Every assertion that pinned the "Build it" affordance is gone, because the
 * affordance is gone: `plan: null` now means "the care plan has not produced
 * one yet", not "tap to build". The invariant those tests protected (no
 * unbidden Bedrock call) is now stronger and asserted differently — the app
 * cannot generate at all, because it no longer knows how to POST. The
 * 409 screener states went with it: only POST returned them.
 *
 * Source-reading, matching the convention of the other screen-level tests
 * here — rendering needs the whole theme + icon harness, and these are
 * structural facts. The one piece of real LOGIC in this feature, the
 * add-latch, is pure and unit-tested in lib/add-latch.test.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SECTION = readFileSync(join(ROOT, 'components/health-plan/NutritionPlanSection.tsx'), 'utf8');
const CLIENT = readFileSync(join(ROOT, 'services/api/nutrition-plan.ts'), 'utf8');
const SCREEN = readFileSync(join(ROOT, 'components/health-plan/PlanScreenRedesignedV2.tsx'), 'utf8');
const BPS = readFileSync(join(ROOT, 'components/health-plan/BiopsychosocialPlanScreen.tsx'), 'utf8');
const HOST = readFileSync(join(ROOT, 'app/Home/health-plan.tsx'), 'utf8');
const STEPPER = readFileSync(join(ROOT, 'app/Home/assessment-stepper.tsx'), 'utf8');
const TASKROW = readFileSync(join(ROOT, 'components/health-plan/tasks/TaskRow.tsx'), 'utf8');
const HOOKS = readFileSync(join(ROOT, 'hooks/use-plan-tasks.ts'), 'utf8');
const DETAIL = readFileSync(join(ROOT, 'components/health-plan/tasks/TaskDetailModal.tsx'), 'utf8');
const HABITS = readFileSync(join(ROOT, 'hooks/use-plan-habits.ts'), 'utf8');
const LATCH = readFileSync(join(ROOT, 'lib/add-latch.ts'), 'utf8');

/**
 * Source with comments stripped.
 *
 * These contract tests read source text, so any assertion of the form "the
 * code must NOT contain X" will also match the comment EXPLAINING why X is
 * absent. That bit three separate assertions in this file (banned units,
 * "dismissible", marginHorizontal), each failing against correct code. Run
 * every negative assertion through this.
 */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('the app cannot generate a nutrition plan at all — COS-1219', () => {
  // The old guarantee was "no generation on mount or focus", enforced by
  // inspecting each effect. The new one is stronger and needs no inspection:
  // there is no client function to call. The backend generates the plan with
  // the care plan and a nightly sweeper backfills the gaps.
  //
  // POST /v1/patients/me/nutrition-plan still EXISTS so old installed builds
  // do not 404 — which is exactly why this has to be asserted rather than
  // assumed. A re-added call would compile and work.
  assert.doesNotMatch(codeOnly(CLIENT), /apiClient\.post/,
    'the client must not POST — generation is the care plan\'s job');
  assert.doesNotMatch(codeOnly(CLIENT), /export async function generateNutritionPlan/);
  assert.doesNotMatch(codeOnly(SECTION), /generateNutritionPlan|onGenerate/,
    'the section must not reference a generate path');
  // And the read is still a read: one GET, nothing else.
  assert.match(CLIENT, /apiClient\.get\('\/v1\/patients\/me\/nutrition-plan'\)/);
});

test('no build affordance survives anywhere in the card', () => {
  // "Build it" implied the patient was the trigger. Nothing they tap produces
  // a plan now, so no copy may suggest otherwise.
  const copy = codeOnly(SECTION);
  assert.doesNotMatch(copy, /Build it|Build practical|Building your plan|Rebuild/i);
  assert.doesNotMatch(copy, /nutrition-plan\.generate/,
    'the generate entitlement gate guarded a control that no longer exists');
});

test('never presents a frequency as an amount', () => {
  // The screener measures how OFTEN, not how much. A quantity unit in the
  // user-visible copy would be a fabricated measurement, because the NCI
  // regression coefficients are not loaded.
  // STEMS, not plurals (COS-1224 re-audit): the old list was ['cups','grams',
  // 'servings','ounces','calorie'], which "half a cup" and "5 grams of fibre"
  // both walk straight past. A stem catches singular, plural and compound.
  const copy = codeOnly(SECTION).toLowerCase();
  for (const unit of [
    'cup',
    'gram',
    'serving',
    'ounce',
    'calorie',
    'portion',
    'teaspoon',
    'tablespoon',
    'millilit',
  ]) {
    assert.ok(!copy.includes(unit), `user-visible copy must not mention "${unit}"`);
  }
  assert.match(SECTION, /how often, not how\s+much/, 'must state what the numbers are');
});

test('the care-team-review notice is not dismissible', () => {
  assert.match(SECTION, /requiresCareTeamReview &&/);
  assert.match(SECTION, /care team reviews these/i);
  // Check for actual dismissal MACHINERY, not the word "dismissible" — an
  // earlier version of this test matched the doc comment saying the notice
  // is not dismissible, so it failed on correct code.
  assert.doesNotMatch(SECTION, /onDismiss|setDismissed|dismissedState|useState\([^)]*dismiss/i);
  // The notice renders in a plain View; wrapping it in a Pressable would be
  // the first step toward making it tappable-away.
  const notice = SECTION.slice(SECTION.indexOf('requiresCareTeamReview &&'));
  const firstTag = /<(\w+)/.exec(notice);
  assert.equal(firstTag?.[1], 'View', 'the review notice must not be interactive');
});

test('client defaults requiresCareTeamReview to TRUE when absent', () => {
  // If the backend ever stops sending it, the safe assumption is that
  // review IS required.
  assert.match(CLIENT, /requiresCareTeamReview: shaped\?\.requiresCareTeamReview !== false/);
});

test('flag-off and not-entitled render nothing, not an error', () => {
  assert.match(SECTION, /NutritionFeatureDisabledError \|\| err instanceof NutritionEntitlementError/);
  assert.match(SECTION, /setStatus\(\{ kind: 'hidden' \}\)/);
  assert.match(SECTION, /if \(status\.kind === 'hidden'\) return null/);
});

test('each backend outcome has its own typed error', () => {
  for (const c of [
    'FEATURE_DISABLED',
    'ENTITLEMENT_DENIED',
    'SCREENER_NOT_TAKEN',
    'SCREENER_INCOMPLETE',
    'AI_INVALID_OUTPUT',
  ]) {
    assert.ok(CLIENT.includes(c), `client must handle ${c}`);
  }
});

test('the null state absorbs the no-screener case', () => {
  // The 409 SCREENER_NOT_TAKEN path is unreachable now — only POST returned
  // it, and GET answers 200 with `plan: null` whether or not the screener was
  // answered. So the null state has to carry both meanings, and the one thing
  // the patient actually controls has to be reachable from it.
  assert.doesNotMatch(codeOnly(SECTION), /needs-screener/,
    'a state that cannot be reached must not be rendered');
  const empty = SECTION.slice(
    SECTION.indexOf("status.kind === 'empty' && ("),
    SECTION.indexOf("status.kind === 'error' && ("),
  );
  assert.ok(empty.length > 0, 'expected a rendered empty state');
  assert.match(empty, /onPress=\{onTakeScreener\}/,
    'the empty state must offer the screener via the prop the parent passes');
  assert.match(empty, /dietary screener/);
});

test('the screener link goes to the DSQ ITSELF, not the catalog', () => {
  // Vishal 2026-08-10: tapping "Take the dietary screener" opened the
  // assessments catalog, which lists the PLAN-GENERATION check-ins — a set
  // that does not include dsq-nci (it is in no TIER_POOL). Deep-link to the
  // instrument instead.
  assert.match(BPS, /assessment-stepper\?instrumentId=dsq-nci/,
    'must deep-link to the DSQ stepper');
  assert.doesNotMatch(codeOnly(BPS).slice(codeOnly(BPS).indexOf('<NutritionPlanSection'),
    codeOnly(BPS).indexOf('<MedicationsBanner')),
    /assessments-catalog/,
    'must not route to the catalog');
});

test('returnTo=plan exists, so the screener returns to the plan', () => {
  // Without this the stepper falls through to its default and dumps the
  // patient in the assessments catalog after submitting — miles from the
  // nutrition card they were trying to build.
  assert.match(BPS, /returnTo=plan/);
  assert.match(STEPPER, /case 'plan':/);
  /*
   * COS-1186 — the DESTINATION changed, the guarantee did not.
   *
   * This asserted the literal '/Home/health-plan', which was the plan when
   * Vishal asked for this on 2026-08-10. COS-915 has since retired that route
   * from the tab bar, and it branches across three plan screens — one of which
   * (PlanScreenRedesignedV2) has neither the retake card nor the gate. The
   * visible plan tab is care-plan-plus.
   *
   * What matters here is unchanged and still asserted: `case 'plan'` exists, so
   * the screener does NOT fall through to the catalog.
   */
  assert.match(STEPPER, /case 'plan':[\s\S]{0,700}?return RETAKE_GATE_ROUTE/);
  assert.doesNotMatch(STEPPER, /case 'plan':[\s\S]{0,700}?return '\/Home\/assessments-catalog'/);
});

test('the screener prompt says what the screener IS', () => {
  // The backend message is "Take the dietary screener first", which just
  // repeats the title. Tapping into a questionnaire blind is the thing to
  // avoid.
  assert.match(SECTION, /food-frequency questionnaire/);
  assert.match(SECTION, /about 5 minutes/);
});

test('stays inside the iOS 26.5 primitive envelope', () => {
  // EVERY value import from react-native, not just the first one `exec` happens
  // to find (COS-1224 re-audit): a second `import { ActivityIndicator } from
  // 'react-native'` line satisfied the old single-match version of this.
  // `import type { ... }` lines are skipped — a type cannot render.
  const lines = [...SECTION.matchAll(/import (?!type )\{([^}]+)\} from 'react-native'/g)];
  assert.ok(lines.length > 0, 'expected a react-native value import');
  // ActivityIndicator deliberately EXCLUDED — BiopsychosocialPlanScreen
  // records that it was scrubbed from these surfaces for iOS 26.5 and that
  // the sanctioned pending affordance is static.
  const allowed = new Set(['View', 'Text', 'Pressable', 'StyleSheet']);
  for (const line of lines) {
    for (const n of line[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      assert.ok(allowed.has(n), `${n} is outside the primitive envelope`);
    }
  }
  assert.doesNotMatch(SECTION, /Alert|LayoutAnimation|Animated/);
});

test('touch targets meet the 44pt minimum', () => {
  assert.match(SECTION, /minHeight: 44/);
});

test('is rendered by the arm that ACTUALLY runs in production (BPS)', () => {
  // health-plan.tsx early-returns <BiopsychosocialPlanScreen> whenever
  // isTabSwapBpsEnabled(), and the backend registry flag TAB_SWAP_BPS_ENABLED
  // is TRUE in production — so PlanScreenRedesignedV2 never renders there.
  // The first version of this feature shipped into V2 only and was invisible.
  assert.match(HOST, /if \(isTabSwapBpsEnabled\(\)\)/,
    'the BPS early-return is what makes BPS the live arm');
  assert.match(BPS, /<NutritionPlanSection/, 'BPS screen must render the section');
});

test('sits BETWEEN Routines and Medications', () => {
  // Vishal 2026-08-10: "it should be between routines and medications".
  // HabitsBanner is the "Routines" row.
  const habits = BPS.indexOf('<HabitsBanner');
  const nutrition = BPS.indexOf('<NutritionPlanSection');
  const meds = BPS.indexOf('<MedicationsBanner');
  assert.ok(habits > -1 && nutrition > -1 && meds > -1, 'all three must render');
  assert.ok(habits < nutrition, 'nutrition must come after Routines');
  assert.ok(nutrition < meds, 'nutrition must come before Medications');
});

test('matches the sibling banners visually', () => {
  // "should match with them". MedicationsBanner's card shape is the
  // reference: no horizontal margin (parent ScrollView owns the padding),
  // 16 radius, 14 padding, 12 bottom margin, 48pt icon well, tint wash.
  assert.doesNotMatch(codeOnly(SECTION), /marginHorizontal/,
    'a horizontal margin would break byte-width match with the siblings');
  assert.match(SECTION, /borderRadius: 16/);
  assert.match(SECTION, /paddingHorizontal: 14/);
  assert.match(SECTION, /marginBottom: 12/);
  assert.match(SECTION, /width: 48,\s*\n\s*height: 48/);
  assert.match(SECTION, /backgroundColor: `\$\{tint\}1F`/);
  assert.match(SECTION, /borderColor: `\$\{tint\}55`/);
});

test('takes the THEME tint, like its siblings do', () => {
  // HabitsBanner and MedicationsBanner both resolve `colors?.tint ??
  // DEFAULT_TINT`, and the theme defines `tint` — so their bespoke
  // teal/green constants never fire and both render the theme tint.
  // Passing anything else here makes this the odd row out.
  assert.match(SECTION, /colors\?\.tint \?\? DEFAULT_TINT/);
  assert.match(BPS, /tint: colors\.tint as string/,
    'BPS must pass the theme tint through');
});

test('is ALSO in V2, so a TAB_SWAP_BPS rollback does not lose it', () => {
  assert.match(SCREEN, /<NutritionPlanSection/);
});


test('returning to the screen re-reads an empty or failed card', () => {
  // Vishal 2026-08-10: after completing the screener the card still read
  // "Take the dietary screener" and tapping it re-opened the finished
  // stepper. `status` is local state and this component does not remount on
  // return, so focus has to act.
  //
  // It re-READS rather than resetting to a tappable state: there is nothing to
  // tap, and one DynamoDB read is the cheapest call on this screen.
  assert.match(SECTION, /useFocusEffect/);
  const focus = SECTION.match(/useFocusEffect\([\s\S]*?\n  \)/);
  assert.ok(focus, 'expected a focus effect');
  assert.match(focus[0], /kind === 'empty' \|\| kind === 'error'/);
  assert.match(focus[0], /void load\(\)/);
  // Read from a ref, never from a closed-over `status`: useFocusEffect re-runs
  // its callback when the identity changes while focused, so a status
  // dependency turns one re-read into two.
  assert.match(focus[0], /statusRef\.current/);
  assert.match(focus[0], /\}, \[load\]\)/);
});

test('a ready plan survives tabbing away and back', () => {
  // The reset must be narrow — wiping a generated plan on focus would cost
  // another Bedrock call to get it back.
  const focus = SECTION.match(/useFocusEffect\([\s\S]*?\n  \)/);
  assert.ok(focus, 'expected a focus effect');
  assert.doesNotMatch(focus[0], /'ready'/, "must not reset the 'ready' state");
  assert.doesNotMatch(focus[0], /'loading'/, "must not reset the 'loading' state");
});

test('the empty state never asks for something already done', () => {
  // The old card could tell someone to "take" a screener they had already
  // taken, because the 409 code told it which. The GET cannot tell them apart
  // any more, so ONE string has to be true in both cases — and it has to say
  // explicitly that an answered screener needs nothing further, or the card
  // reads as a chore that will not go away.
  assert.match(SECTION, /Take or update the dietary screener/,
    '"take" alone is a lie to someone who already answered it');
  assert.match(SECTION, /nothing else is needed from\s+you/,
    'must state that an answered screener needs nothing more');
  assert.match(SECTION, /after your next care-plan update/,
    'must say what actually produces the plan');
  // And it must not pretend the patient is the trigger.
  assert.doesNotMatch(codeOnly(SECTION), /Tap to (build|try again)/i);
});

test('the focus hook runs BEFORE the early return', () => {
  // Rules of hooks: `hidden` returns null. A hook after that breaks the
  // first render where the card is visible.
  const hook = SECTION.indexOf('useFocusEffect');
  const early = SECTION.indexOf("if (status.kind === 'hidden') return null");
  assert.ok(hook > -1 && early > -1);
  assert.ok(hook < early, 'useFocusEffect must precede the early return');
});


// ── Tracking (Vishal 2026-08-10: "how patients will be able to track it") ──

test('suggestions become ROUTINES, not tasks — COS-1219', () => {
  // REVERSED from the 2026-08-10 ruling, which chose tasks because the
  // routines API was behind plan_routines_enabled and had no completion
  // endpoint. Both facts changed: habits_in_plan_enabled is true in
  // production, and POST .../plan/habits/:id/complete plus GET /completions
  // both exist.
  //
  // The reason it HAD to change: tasks are wiped on every care-plan
  // regeneration — mergeEditedPatientTasks is referenced in four comments and
  // does not exist, and all 225 production tasks are source:'ai'. An item the
  // patient accepted cannot be something the next regeneration deletes.
  // Routines merge (care-plan-normalizer.ts:518) and have patient CRUD.
  assert.match(SECTION, /useAddHabit/);
  assert.match(SECTION, /addHabit\.mutateAsync/);
  assert.doesNotMatch(codeOnly(SECTION), /createPlanTask/);
});

test('the routine is completable, timed, and silent', () => {
  // cadence daily: the screener measures how often food is eaten, and every
  // suggestion it drives is a daily pattern.
  // A time places it on Today's Schedule, which is the integration Ken asked
  // for; 11:00 is actionable at lunch and clear of the pre-breakfast
  // medication cluster.
  const add = SECTION.slice(SECTION.indexOf('const onAddToPlan'));
  assert.match(add, /cadence: 'daily'/);
  assert.match(add, /scheduledTime: '11:00'/);
  // remindersEnabled absent reads as TRUE on the backend, so silence has to be
  // explicit. The patient asked to track this, not to be buzzed at an hour
  // THIS FILE chose for them.
  assert.match(add, /remindersEnabled: false/);
});

test('the domain passes straight through, with no mapping and no default', () => {
  // suggestion.domain and UpsertHabitInput.bpsDomain are the same four-value
  // vocabulary by ruling, so anything resembling a lookup table here is a
  // chance to file a routine under the wrong part of the plan.
  const add = SECTION.slice(SECTION.indexOf('const onAddToPlan'));
  assert.match(add, /bpsDomain: suggestion\.domain/);
  assert.doesNotMatch(add, /DOMAIN_MAP|domain === 'bio' \?|\?\? 'bio'/);
});

test('domain is REQUIRED on the suggestion type and in normalize()', () => {
  // normalize() rebuilds every suggestion field-by-field, so a field it does
  // not name silently vanishes — which is how domain would reach the UI as
  // undefined and route a routine nowhere.
  assert.match(CLIENT, /domain: NutritionDomain/, 'required, not optional');
  assert.doesNotMatch(CLIENT, /domain\?: /, 'must not be optional');
  assert.match(CLIENT, /domain: s\.domain/, 'normalize must carry it through');
  // Dropped, never defaulted: we cannot invent the part of the plan an item
  // belongs to.
  assert.match(CLIENT, /DOMAINS\.includes\(s\.domain as NutritionDomain\)/);
  assert.doesNotMatch(CLIENT, /domain: s\.domain \?\?|domain: typeof s\.domain/);
});

test('the add is hidden when routines are not live', () => {
  // habits_in_plan_enabled is true in production, but when it is not the
  // routines routes 404 — and a control that cannot do its job is the same
  // defect as a reminder bell with dispatch dark.
  assert.match(SECTION, /useHabitsInPlanFlag/);
  assert.match(SECTION, /\) : routinesLive \? \(/, 'the add row is gated on the flag');
});

test('row state is per-suggestion and reset when a new plan arrives', () => {
  // Index-keyed, and a fresh read replaces the suggestion list wholesale, so
  // it must be cleared or row 2 inherits row 2's old spinner.
  assert.match(SECTION, /setPending\(\{\}\)/, 'a loaded plan must reset the row map');
});

test('THE 2026-08-11 GUARD: no row state may mean ADDED — COS-1224', () => {
  /*
   * What this replaces, and why.
   *
   * The guard used to be two substring greps over this component:
   *   assert.match(SECTION, /'saving' \| 'failed'/)
   *   assert.doesNotMatch(codeOnly(SECTION), /'saving' \| 'done'/)
   * A reviewer reproduced the "On your plan forever" bug with the suite green by
   * widening the union to `'saving' | 'failed' | 'done'` and adding a
   * setPending(... 'done'). The first grep is satisfied by any superset and the
   * second does not match one — both permeable, and both pointless.
   *
   * The BEHAVIOURAL half of the guarantee — once the derived source stops
   * reporting an item the row reverts — is asserted where the behaviour lives,
   * in lib/add-latch.test.mjs ("REGRESSION 2026-08-11"). What is left for a
   * source read is the shape that makes a local added-flag possible at all, and
   * that is pinned as an EXACT SET so a superset FAILS.
   */
  const decl = /export type AddRowState =([^\n;]+)/.exec(codeOnly(LATCH));
  assert.ok(decl, 'AddRowState must be declared in the latch module');
  const members = decl[1].split('|').map((m) => m.trim()).filter(Boolean).sort();
  assert.deepEqual(
    members,
    ["'capped'", "'failed'", "'no-plan'", "'saving'"],
    'exact set: every member means NOT ADDED, and a new member has to argue for itself here',
  );

  // And the component must use that union verbatim — `AddRowState | 'done'`
  // fails this, where a substring grep would not.
  const generic = /useState<Record<number, ([^>]*)>>/.exec(codeOnly(SECTION));
  assert.equal(generic?.[1], 'AddRowState', 'the row map may not widen the pinned union');
});

test('the row reads "added" from ONE expression, with nothing OR-ed in', () => {
  // The 2026-08-11 bug was `done || derived.has(...)`. Whatever sits between the
  // opening brace and the `?` IS the question the row asks, so pin it exactly.
  const code = codeOnly(SECTION);
  const at = code.indexOf('{isOnPlan(');
  assert.ok(at > -1, 'the confirmed row must be gated by isOnPlan');
  const cond = code.slice(at + 1, code.indexOf('?', at)).trim();
  assert.equal(
    cond,
    'isOnPlan(normalizeTitle(s.title), latch, onPlanLabels, now)',
    'the added answer comes from the latch module and nothing else',
  );
});

test('a failed add offers a retry rather than dying silently', () => {
  assert.match(SECTION, /Couldn't add — tap to retry/);
  assert.match(SECTION, /'failed'/);
});

test('the add control is reachable by screen reader', () => {
  assert.match(SECTION, /accessibilityLabel=\{`Add "\$\{s\.title\}" to my plan`\}/);
  assert.match(SECTION, /accessibilityHint="Adds a daily routine you can tick off"/);
});


test('the stored plan is read on mount', () => {
  // Vishal 2026-08-10: "whenever i close app and open again ... there is a
  // loader and then some task". The read is now the ONLY path, so this is
  // simply the card's one job.
  assert.match(SECTION, /fetchNutritionPlan/);
  assert.match(SECTION, /void load\(\)/);
  // A plan with zero suggestions is the same nothing as a null plan — the
  // empty state, not a card claiming a plan it cannot show.
  assert.match(SECTION, /plan && plan\.suggestions\.length > 0\s*\?\s*\{ kind: 'ready', plan \}/);
});

test('a failed load says so quietly, and offers the one useful action', () => {
  // This used to swallow the error, because the card still had a build state
  // to fall back to and shouting about a network blip on mount was noise.
  // There is no fallback state now — a silent failure would be a permanently
  // blank accordion with no explanation, which is the thing COS-1219 forbids.
  // It stays quiet by living inside the collapsed body, not by hiding.
  assert.match(SECTION, /setStatus\(\{ kind: 'error' \}\)/);
  assert.match(SECTION, /Could not load your nutrition plan just now/);
  assert.match(SECTION, /Try again/);
  // Flag-off and not-entitled still render nothing rather than an error.
  const load = SECTION.slice(SECTION.indexOf('const load = React.useCallback'));
  const hidden = load.indexOf("setStatus({ kind: 'hidden' })");
  const error = load.indexOf("setStatus({ kind: 'error' })");
  assert.ok(hidden > -1 && error > -1 && hidden < error,
    'the hidden branch must be taken before the generic error');
});

test('the added-mark is derived from the ROUTINES on the plan', () => {
  // Local state resets every app launch, which made an already-added
  // suggestion offer "Add to my plan" again — and tapping created a duplicate.
  //
  // The source moved with the destination: it used to be task titles handed
  // down by the parent, which after COS-1219 would have been the wrong store
  // entirely. The card reads plan.habits itself, which also means the surfaces
  // that never passed the prop (PlanScreenRedesignedV2) get it for free.
  assert.match(SECTION, /usePlanHabits/);
  assert.match(SECTION, /habits\.map\(\(h\) => normalizeTitle\(h\.label\)\)/);
  assert.doesNotMatch(codeOnly(SECTION), /existingTaskTitles/);
  assert.doesNotMatch(codeOnly(BPS), /existingTaskTitles/);
});

test('the plan cache reflects the add without the card asking anyone', () => {
  // Otherwise the patient is told it was added and sees no change anywhere.
  // The add's onSuccess splices the server's full habits[] into the cached plan,
  // so the derived source is correct in the same commit — no callback up to the
  // parent, and nothing for the parent to refetch.
  const writer = HABITS.slice(
    HABITS.indexOf('function writeHabits'),
    HABITS.indexOf('// ─── Flag'),
  );
  assert.ok(writer.length > 0, 'the write hooks must share one cache writer');
  assert.match(writer, /qc\.setQueryData<AiHealthPlan \| null>\(AI_HEALTH_PLAN_QUERY_KEY/);
});

test('a successful write is never DROPPED when the plan cache is empty — COS-1224', () => {
  /*
   * The hole: `(prev) => prev ? { ...prev, habits } : prev` is a SILENT NO-OP
   * whenever the ai-health-plan cache holds null or undefined — and it does hold
   * null, because `fetchAiHealthPlan` catches its own errors and resolves to
   * null, so a failed plan GET is indistinguishable from "no plan". The nutrition
   * card derives its entire "already added" answer from that cache, so the
   * server's authoritative habits[] went on the floor and every accepted
   * suggestion offered "Add to my plan" again. The second tap minted a duplicate.
   *
   * There is no honest AiHealthPlan to synthesise around a habits[] — version,
   * goals, tasks and generatedAt would all be invented and other screens read
   * them — so with nothing to splice into, RE-ASK. The answer is either written
   * or fetched again; it is never dropped.
   */
  const writer = HABITS.slice(
    HABITS.indexOf('function writeHabits'),
    HABITS.indexOf('// ─── Flag'),
  );
  assert.match(
    writer,
    /qc\.invalidateQueries\(\{ queryKey: AI_HEALTH_PLAN_QUERY_KEY \}\)/,
    'with no cached plan, the server must be asked again',
  );

  // All three write hooks had the identical hole, so all three go through the one
  // writer: guarding only the add would leave update and delete dropping theirs.
  for (const name of ['useAddHabit', 'useUpdateHabit', 'useDeleteHabit']) {
    const start = HABITS.indexOf(`export function ${name}`);
    assert.ok(start > -1, `${name} must exist`);
    const after = HABITS.indexOf('export function ', start + 1);
    const fn = HABITS.slice(start, after > -1 ? after : undefined);
    assert.match(fn, /onSuccess: \(habits\) =>/, `${name} must handle success`);
    assert.match(fn, /writeHabits\(qc, habits\)/, `${name} must use the shared writer`);
    assert.doesNotMatch(
      codeOnly(fn),
      /prev \? \{ \.\.\.prev, habits \} : prev/,
      `${name} must not reintroduce the silent no-op`,
    );
  }
});

test('the card does not claim what it cannot check — COS-1224', () => {
  // The other half of the same bug, on the card. An empty derived set says
  // "nothing is on your plan"; a failed plan read is not that answer, and
  // "Add to my plan" is a confident claim that costs the patient a duplicate.
  assert.match(HABITS, /known: !flag \|\| data != null/,
    'the hook must distinguish "no routines" from "no answer"');
  assert.match(SECTION, /known: planKnown/, 'the card must read it');
  assert.match(SECTION, /planKnown \? new Set\(habits\.map/,
    'unknown must be null, never an empty Set');

  const unknown = SECTION.slice(
    SECTION.indexOf('onPlanLabels === null ?'),
    SECTION.indexOf(') : routinesLive ? ('),
  );
  assert.ok(unknown.length > 0, 'there must be a row state for "cannot know"');
  assert.match(unknown, /Not sure yet whether this is on your plan/);
  assert.doesNotMatch(unknown, /<Pressable/,
    'it must offer nothing — a tap here is how the duplicate gets created');
});

test('the TTL ceiling has a clock, not just a comment — COS-1224', () => {
  // `const now = Date.now()` is read in the render body, and nothing re-rendered
  // the card, so LATCH_TTL_MS only took effect on the next incidental render —
  // while the one case the TTL exists for (confirmation never arrives) is exactly
  // the case where no other render is coming. The module documents the ceiling as
  // a guarantee, so it has to be one. Behaviour: lib/add-latch.test.mjs.
  assert.match(LATCH, /export function nextLatchExpiry/);
  const eff = SECTION.slice(SECTION.indexOf('const due = nextLatchExpiry'), SECTION.length);
  const body = eff.slice(0, 600);
  assert.match(body, /if \(due === null\) return/, 'nothing pending ⇒ no timer');
  assert.match(body, /setTimeout\(/);
  assert.match(body, /settleLatch\(prev, onPlanLabels, Date\.now\(\)\)/);
  assert.match(body, /return \(\) => clearTimeout\(timer\)/, 'and it cannot leak');
});

test('a failure that can never succeed does not offer a retry — COS-1224', () => {
  // HABIT_CAP_REACHED (the 20-routine sanity cap — one production plan already
  // carries 11 routines and every regeneration emits more) and NO_PLAN both fail
  // identically on a second tap. "Couldn't add — tap to retry" on either is an
  // instruction to do something futile.
  assert.match(SECTION, /addFailureState\(err\)/, 'the catch must classify the failure');
  const at = SECTION.indexOf("pending[i] === 'capped' || pending[i] === 'no-plan'");
  // Bounded to THIS branch: reading on to the add button would sweep in its
  // Pressable and the assertion below would be testing nothing.
  const block = SECTION.slice(at, SECTION.indexOf(') : (', at));
  assert.ok(block.length > 0, 'the two unretryable states need their own branch');
  // codeOnly: the comment here legitimately explains why there is no retry, and
  // would otherwise fail the assertion. Fifth time this trap has fired in this
  // file — every negative assertion goes through codeOnly.
  assert.doesNotMatch(codeOnly(block), /<Pressable/, 'no tap target on a futile retry');
  assert.doesNotMatch(codeOnly(block), /retry/i);
  assert.match(block, /as many routines as it can/, 'say the cap was reached');
  assert.match(block, /care plan is not ready yet/, 'say the plan is missing');
  // The retryable failure keeps its retry.
  assert.match(SECTION, /Couldn't add — tap to retry/);
  // And neither message is a dead end: both tell the patient to go do something
  // elsewhere, so coming back drops the state and offers the add again.
  const focus = SECTION.match(/useFocusEffect\([\s\S]*?\n  \)/);
  assert.ok(focus, 'expected a focus effect');
  assert.match(focus[0], /v === 'capped' \|\| v === 'no-plan'/,
    'returning to the card must clear the two unretryable states');
});

test('two taps in one commit cannot mint two routines — COS-1224', () => {
  // The only guard was `disabled={pending[i] === 'saving'}`, and `pending` is
  // state set inside the same handler: two taps landing before React commits both
  // read undefined and both call mutateAsync. A ref is written synchronously.
  const add = SECTION.slice(SECTION.indexOf('const onAddToPlan'), SECTION.indexOf('[addHabit],'));
  assert.match(SECTION, /React\.useRef<Set<number>>\(new Set\(\)\)/);
  assert.match(add, /if \(inFlight\.current\.has\(index\)\) return/);
  assert.ok(
    add.indexOf('inFlight.current.add(index)') < add.indexOf('await addHabit.mutateAsync'),
    'the latch must close before the request, or it is just slower state',
  );
  assert.match(add, /finally \{[\s\S]{0,80}inFlight\.current\.delete\(index\)/,
    'released on success AND on failure, or the row is stuck for good');
});

test('the V2 call site does not describe a feature that was deleted — COS-1224', () => {
  // This arm is the TAB_SWAP_BPS rollback path, and this file deliberately keeps
  // the card in it, so its comment is a live instruction to the next reader. Both
  // clauses of the old one ("Generates on tap, never on mount: each build is a
  // Bedrock call the backend does not persist") became false at COS-1219.
  const at = SCREEN.indexOf('<NutritionPlanSection');
  assert.ok(at > -1);
  const comment = SCREEN.slice(SCREEN.lastIndexOf('{/*', at), at);
  assert.doesNotMatch(comment, /Generates on tap/, 'nothing generates on tap any more');
  assert.doesNotMatch(comment, /does not persist/, 'the backend persists the plan');
  assert.match(comment, /READS/);
});

test('the row that names Routines can reach Routines — COS-1224', () => {
  // "On your plan — in Routines" sat in a plain View with no tap target, while
  // the only navigation on the card was a bottom link labelled "Add your own".
  // A patient told where their item went had no way to go and look at it.
  const row = SECTION.slice(
    SECTION.indexOf('{isOnPlan(normalizeTitle'),
    SECTION.indexOf('onPlanLabels === null ?'),
  );
  assert.match(row, /<Pressable/, 'the confirmed row must be tappable');
  assert.match(row, /router\.push\(ROUTINES_ROUTE as never\)/, 'to the place it names');
  assert.match(row, /accessibilityRole="button"/);
  assert.match(row, /accessibilityHint="Opens Routines, where this one now lives"/);
});

test('the added confirmation says WHERE it went', () => {
  // "Added to my plan" with no destination was reported as "where it is
  // added don't know". "below" was true while it was a task in the Biological
  // section under this card; it is a routine now, and Routines is a different
  // place — so the word changed with the destination.
  assert.match(SECTION, /On your plan — in Routines/);
  assert.doesNotMatch(codeOnly(SECTION), /tick it off below/);
});


// ── Where it landed (Vishal 2026-08-11, settled by COS-1224) ─────────

test('the in-screen task reveal is DELETED, not parked', () => {
  // Vishal 2026-08-11 asked to be shown where an accepted suggestion landed, and
  // the answer then was an in-screen reveal: scroll to the Biological TASK list,
  // open its accordion and flash the new row — plus a JS-eased scroll ramp and a
  // measure-with-fallback chain to drive it.
  //
  // COS-1219 made accepted suggestions ROUTINES, so the row that reveal aimed at
  // stopped existing and the whole path sat here behind an eslint-disable with no
  // caller. ELEVEN tests in this file asserted its internals, so they passed or
  // failed independently of anything a patient could do — which is not a test.
  // Both are gone.
  //
  // Deleted rather than re-pointed: the item is a routine on /Home/habits now, a
  // different screen, so there is nothing on THIS screen to reveal. Pointing it
  // at the nearest surviving list would name the wrong place on purpose, and
  // building a routine list here to reveal would be a new surface, not a fix.
  const bps = codeOnly(BPS);
  for (const dead of [
    'revealAddedTask',
    'startHighlightTimer',
    'highlightNodeRef',
    'highlightTaskId',
    'openTasksSignal',
    'smoothScrollTo',
    'scrollOffsetY',
    'scrollAnimRef',
    'measureInWindow',
  ]) {
    assert.ok(!bps.includes(dead), `${dead} has no caller — it must not survive as code`);
  }
  // The suppression that kept it compiling went with it. Asserted on the RAW
  // source: codeOnly strips // lines, so an eslint directive is invisible there
  // and the assertion would pass vacuously.
  assert.doesNotMatch(
    BPS,
    /eslint-disable-next-line @typescript-eslint\/no-unused-vars/,
    'no unused-vars suppression should be needed on this screen any more',
  );
  // The destination is still named — and now reachable from the row that names
  // it, which is what replaces the reveal (see MINOR 7 below).
  assert.match(SECTION, /On your plan — in Routines/);
  assert.match(SECTION, /router\.push\(ROUTINES_ROUTE as never\)/);
});

test('no ActivityIndicator on the iOS 26.5 plan surfaces', () => {
  // The screen that renders this card scrubbed ActivityIndicator deliberately
  // (chunk 46.1); the pending affordance is static + copy.
  assert.doesNotMatch(codeOnly(SECTION), /<ActivityIndicator/);
  assert.doesNotMatch(codeOnly(BPS), /<ActivityIndicator/);
});

test('feedback lives on the ROW, not in a screen banner', () => {
  // Vishal 2026-08-11: "this message idea is not good". A screen-level banner
  // reported that SOMETHING was happening while saying nothing about WHICH
  // row, so the eye had nowhere to go.
  assert.doesNotMatch(codeOnly(BPS), /Saving your task/);
  assert.doesNotMatch(codeOnly(BPS), /taskBusyBanner/);
  assert.match(HOOKS, /__optimistic: 'creating'/);
  assert.match(HOOKS, /__optimistic: 'deleting'/);
});

test('a created task appears immediately, marked creating', () => {
  // "add task directly with a loader and when you got response from backend
  // then remove loader". Without the optimistic insert the row does not exist
  // for the full 8s pending window, so there is nothing to attach progress to.
  const fn = HOOKS.slice(HOOKS.indexOf('export function useCreatePlanTask'));
  assert.match(fn, /onMutate/);
  assert.match(fn, /tasks: \[\.\.\.\(prev\.tasks \?\? \[\]\), optimistic\]/);
  assert.match(fn, /id: `optimistic-create-/, 'temp id must not collide with a server id');
});

test('a deleted task is CROSSED, not removed, until the server confirms', () => {
  // "cross it with a loader and then we receive response from backend then
  // remove it properly". Removing it immediately would be a lie if the delete
  // fails, and the task would silently reappear.
  //
  // Asserted against TaskDetailModal, NOT useDeletePlanTask: the shipping
  // delete is inline there via fireAndForgetDelete. The hook has no callers —
  // wiring the optimism there first did nothing at all.
  assert.match(DETAIL, /__optimistic: 'deleting'/);
  assert.doesNotMatch(DETAIL, /tasks: prev\.tasks\.filter/, 'must not drop the row optimistically');
  assert.match(TASKROW, /textDecorationLine: 'line-through'/);
});

test('the delete invalidate is DEFERRED, not synchronous', () => {
  // The invalidate used to fire on the same line as the fire-and-forget
  // DELETE — before it could possibly have landed. The refetch returned the
  // task still present, wiping the strike-through and making the delete look
  // broken. This is the actual reason delete "wasn't working" while add was.
  const fn = DETAIL.slice(DETAIL.indexOf('const removed = localTask'));
  assert.match(fn, /setTimeout\(\(\) => qc\.invalidateQueries/);
  assert.doesNotMatch(
    fn.slice(0, fn.indexOf('setTimeout')),
    /qc\.invalidateQueries/,
    'no synchronous invalidate before the delete can land',
  );
});

test('the unused delete hook says so, loudly', () => {
  // Dead code that looks live cost a shipped-but-inert fix here.
  assert.match(HOOKS, /NO CALLERS as of 2026-08-11/);
});

test('both optimistic writes roll back on failure', () => {
  // A row that sticks around after a failed create, or stays struck through
  // after a failed delete, is worse than no optimism at all.
  const create = HOOKS.slice(
    HOOKS.indexOf('export function useCreatePlanTask'),
    HOOKS.indexOf('export function useUpdatePlanTask'),
  );
  const del = HOOKS.slice(HOOKS.indexOf('export function useDeletePlanTask'));
  for (const fn of [create, del]) {
    assert.match(fn, /onError/);
    assert.match(fn, /setQueryData\(AI_HEALTH_PLAN_QUERY_KEY, context\.prevAiPlan\)/);
  }
});

test('a mid-flight row cannot be opened', () => {
  // Editing a task the server has not acknowledged would race the write.
  assert.match(TASKROW, /onPress=\{busy \? undefined/);
  assert.match(TASKROW, /disabled=\{busy\}/);
  assert.match(TASKROW, /accessibilityState=\{\{ disabled: busy, busy \}\}/);
});

test('the row says which direction it is moving', () => {
  // Dim + icon alone is ambiguous between adding and removing.
  assert.match(TASKROW, /creating \? 'Adding…' : deleting \? 'Removing…'/);
});

test('the add is LATCHED until the plan catches up — COS-1220', () => {
  // Reported: "Adding…" → "Add to my plan" → (1-2s) → "On your plan". The
  // 2026-08-11 fix for "once deleted routines is still saying on your plan"
  // dropped the local flag the moment the add was acknowledged and handed the
  // answer to the derived source, which had not refetched yet — so for a
  // moment neither said added.
  //
  // Neither keeping the flag nor dropping it is correct, so the decision is
  // not made here at all: it is one pure function with its own tests.
  assert.match(SECTION, /from '@\/lib\/add-latch'/);
  const fn = SECTION.slice(SECTION.indexOf('const onAddToPlan'));
  assert.match(fn, /setLatch\(\(prev\) => latchAdd\(prev/,
    'a successful add must latch');
  // Ordering is the whole bug: latch first, then clear 'saving'. Between the
  // two there must be no frame where the row shows neither.
  assert.ok(
    fn.indexOf('latchAdd') < fn.indexOf('delete next[index]'),
    'the latch must be set BEFORE the saving flag is cleared',
  );
  // The row reads from one place, which consults the plan first.
  assert.match(SECTION, /isOnPlan\(normalizeTitle\(s\.title\), latch, onPlanLabels, now\)/);
  // And the latch is RELEASED on confirmation, or the delete bug is back.
  assert.match(SECTION, /settleLatch\(prev, onPlanLabels, Date\.now\(\)\)/);
});

test('the latch decision lives in a pure module, not in the component', () => {
  // The existing test file deliberately does not render, so logic that only
  // exists inside a component is logic nothing can test. This is the one piece
  // of real behaviour in the feature.
  assert.match(LATCH, /export function isOnPlan/);
  assert.match(LATCH, /export function settleLatch/);
  assert.match(LATCH, /export function latchAdd/);
  assert.doesNotMatch(LATCH, /from 'react/, 'must stay pure — no React, no hooks');
  assert.match(LATCH, /now: number/, 'the clock is injected, or it is not testable');
});


test('the nutrition card is an accordion', () => {
  // Vishal 2026-08-11: "this card needs to be an accordion".
  assert.match(SECTION, /const \[open, setOpen\] = React\.useState\(false\)/);
  assert.match(SECTION, /onPress=\{\(\) => setOpen\(\(v\) => !v\)\}/);
  assert.match(SECTION, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(SECTION, /\{open && \(/, 'body renders only when expanded');
});

test('no reload icon in the header', () => {
  // Vishal 2026-08-11: "reload icon is not required on nutrition". The
  // chevron is the accordion affordance and now the only control up there —
  // there is nothing left to rebuild.
  assert.doesNotMatch(codeOnly(SECTION), /name=\{isReady \? 'refresh'/);
  assert.match(SECTION, /name=\{open \? 'expand-less' : 'expand-more'\}/);
});

test('the patient can add their own item — COS-1220', () => {
  // The cheap version on purpose: a link to the routines editor, which already
  // has the Body / Mind / Social / Spiritual picker. An entry made there gets
  // a domain the same way an accepted suggestion does, and the 965-line screen
  // stays where it is.
  assert.match(SECTION, /Add your own/);
  assert.match(SECTION, /const ROUTINES_ROUTE = '\/Home\/habits'/);
  assert.match(SECTION, /accessibilityLabel="Add your own nutrition routine"/);
  // Says where it goes before it goes there.
  assert.match(SECTION, /Opens Routines, where you name it and choose which part/);
});

test('collapsed costs one row in the stack', () => {
  // The subtitle, build action, suggestions and review notice all live in the
  // body — collapsed is the title row alone.
  const header = SECTION.slice(SECTION.indexOf('Header row IS the accordion'), SECTION.indexOf('{open && ('));
  assert.doesNotMatch(header, /subtitle/, 'subtitle belongs in the body');
  assert.doesNotMatch(header, /suggestions/, 'suggestions belong in the body');
});
