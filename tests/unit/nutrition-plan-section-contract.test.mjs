/**
 * Nutrition plan section contract.
 *
 * Ken 2026-08-07 asked for a "nutritional plan or support" section in the bio
 * part of the plan. The properties worth pinning here are the ones that cost
 * money or make a clinical claim if they regress:
 *
 *   - it must NOT generate on mount (every build is a Bedrock call the
 *     backend does not persist),
 *   - it must never present a frequency as an amount (the NCI coefficients
 *     are not loaded, so cups/grams/servings would be fiction),
 *   - the care-team-review notice must not be dismissible or conditional,
 *   - a disabled flag or a missing entitlement must render nothing, not an
 *     error.
 *
 * Source-reading, matching the convention of the other screen-level tests
 * here — rendering needs the whole theme + icon harness, and these are
 * structural facts.
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
const TASKLIST = readFileSync(join(ROOT, 'components/health-plan/tasks/TaskListSection.tsx'), 'utf8');
const TASKROW = readFileSync(join(ROOT, 'components/health-plan/tasks/TaskRow.tsx'), 'utf8');
const HOOKS = readFileSync(join(ROOT, 'hooks/use-plan-tasks.ts'), 'utf8');
const DETAIL = readFileSync(join(ROOT, 'components/health-plan/tasks/TaskDetailModal.tsx'), 'utf8');

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

test('does NOT generate on mount — each build costs a Bedrock call', () => {
  // A useEffect calling generate would bill a model call for every patient
  // who scrolls past the section.
  // The invariant is about COST, not about hooks. A mount effect that READS
  // the stored plan (one DynamoDB read) is required — without it every app
  // open re-generates. What must never happen on mount or focus is a
  // GENERATION, which is a Bedrock call.
  //
  // Earlier revisions of this test banned useEffect outright and would have
  // blocked both correct fixes. Assert the cost, not the mechanism.
  const code = codeOnly(SECTION);
  const mount = code.match(/React\.useEffect\([\s\S]*?\n  \}, \[\]\)/);
  if (mount) {
    assert.doesNotMatch(mount[0], /generateNutritionPlan|onGenerate/,
      'the mount effect must READ the stored plan, never generate one');
    assert.match(mount[0], /fetchNutritionPlan/,
      'the mount effect exists to load the stored plan');
  }
  const focus = code.match(/useFocusEffect\([\s\S]*?\n  \)/);
  if (focus) {
    assert.doesNotMatch(focus[0], /onGenerate|generateNutritionPlan/,
      'the focus effect must never generate — that is a Bedrock call per focus');
  }
  // The handler is now a per-state variable bound to the card's onPress,
  // so assert the binding rather than one literal inline arrow.
  assert.match(codeOnly(SECTION), /onPress\s*[:=][^\n]*onGenerate\(\)/,
    'generation must be reachable only from a press handler');
});

test('never presents a frequency as an amount', () => {
  // The screener measures how OFTEN, not how much. A quantity unit in the
  // user-visible copy would be a fabricated measurement, because the NCI
  // regression coefficients are not loaded.
  const copy = codeOnly(SECTION).toLowerCase();
  for (const unit of ['cups', 'grams', 'servings', 'ounces', 'calorie']) {
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

test('a screener-required response offers the screener, not a retry', () => {
  assert.match(SECTION, /kind: 'needs-screener'/);
  assert.match(SECTION, /Take the dietary screener/);
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
  assert.match(STEPPER, /return '\/Home\/health-plan'/);
});

test('the screener prompt says what the screener IS', () => {
  // The backend message is "Take the dietary screener first", which just
  // repeats the title. Tapping into a questionnaire blind is the thing to
  // avoid.
  assert.match(SECTION, /food-frequency questionnaire/);
  assert.match(SECTION, /about 5 minutes/);
});

test('stays inside the iOS 26.5 primitive envelope', () => {
  const rn = /import \{([^}]+)\} from 'react-native'/.exec(SECTION);
  assert.ok(rn, 'expected a react-native import');
  // ActivityIndicator deliberately EXCLUDED — BiopsychosocialPlanScreen
  // records that it was scrubbed from these surfaces for iOS 26.5 and that
  // the sanctioned pending affordance is static.
  const allowed = new Set(['View', 'Text', 'Pressable', 'StyleSheet']);
  for (const n of rn[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    assert.ok(allowed.has(n), `${n} is outside the primitive envelope`);
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


test('returning from the screener clears the needs-screener state', () => {
  // Vishal 2026-08-10: after completing the screener the card still read
  // "Take the dietary screener" and tapping it re-opened the finished
  // stepper. `status` is local state and this component does not remount on
  // return, so focus has to reset it.
  assert.match(SECTION, /useFocusEffect/);
  assert.match(SECTION, /prev\.kind === 'needs-screener' \|\| prev\.kind === 'error'/);
  assert.match(SECTION, /\{ kind: 'idle' \}/);
});

test('a ready plan survives tabbing away and back', () => {
  // The reset must be narrow — wiping a generated plan on focus would cost
  // another Bedrock call to get it back.
  const focus = SECTION.match(/useFocusEffect\([\s\S]*?\n  \)/);
  assert.ok(focus, 'expected a focus effect');
  assert.doesNotMatch(focus[0], /'ready'/, "must not reset the 'ready' state");
  assert.doesNotMatch(focus[0], /'loading'/, "must not reset the 'loading' state");
});

test('the two screener codes do not share copy', () => {
  // Telling someone to "take" a screener they already took sends them in a
  // circle — which is exactly what was reported.
  assert.match(SECTION, /SCREENER_NOT_TAKEN/);
  assert.match(SECTION, /Take the dietary screener/);
  assert.match(SECTION, /Finish the dietary screener/);
  assert.match(SECTION, /A few more answers needed/);
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

test('suggestions can be turned into PLAN TASKS, not routines', () => {
  // Routines were the obvious-looking home and are the wrong one: the API is
  // behind plan_routines_enabled (UNSET in production, so every route 404s)
  // and has NO completion endpoint — POST, GET, GET/:id, PATCH/:id,
  // DELETE/:id and nothing else. Plan tasks have complete/skip live plus
  // getTaskAnalytics, which Daily Read reads in production today.
  assert.match(SECTION, /createPlanTask/);
  assert.doesNotMatch(SECTION, /createRoutine|\/routines/);
});

test('the created task is completable — simple style, daily', () => {
  // completionStyle 'simple' is what makes it tickable; a measurable task
  // would demand a logged value the screener cannot supply.
  assert.match(SECTION, /completionStyle: 'simple'/);
  assert.match(SECTION, /recurrence: 'daily'/);
  assert.match(SECTION, /category: 'nutrition'/);
});

test('add state is per-suggestion and survives nothing but a rebuild', () => {
  // A rebuild replaces the suggestion list wholesale, so index-keyed state
  // must be cleared or row 2 inherits row 2's old "added" tick.
  assert.match(SECTION, /setAdded\(\{\}\)/, 'generate must reset the added map');
  assert.match(SECTION, /'saving' \| 'done' \| 'failed'/);
});

test('a failed add offers a retry rather than dying silently', () => {
  assert.match(SECTION, /Couldn't add — tap to retry/);
  assert.match(SECTION, /'failed'/);
});

test('the add control is reachable by screen reader', () => {
  assert.match(SECTION, /accessibilityLabel=\{`Add "\$\{s\.title\}" to my plan`\}/);
  assert.match(SECTION, /accessibilityHint="Adds a daily task you can tick off"/);
});


test('the stored plan is loaded on mount, so reopening does not re-generate', () => {
  // Vishal 2026-08-10: "whenever i close app and open again ... there is a
  // loader and then some task". Generation was the only path.
  assert.match(SECTION, /fetchNutritionPlan/);
  assert.match(SECTION, /prev\.kind === 'idle' \? \{ kind: 'ready', plan \}/,
    'a loaded plan must not stomp a state the patient is mid-way through');
});

test('a failed load leaves the card in its build state, not an error', () => {
  // The patient has not asked for anything yet on mount; an error here would
  // be noise about something they did not do.
  const mount = SECTION.match(/React\.useEffect\([\s\S]*?\n  \}, \[\]\)/);
  assert.ok(mount, 'expected a mount effect');
  assert.match(mount[0], /\.catch\(\(\) => undefined\)/);
});

test('the added-mark is derived from the plan, not local state', () => {
  // Local state resets every app launch, which made an already-added
  // suggestion offer "Add to my plan" again — and tapping created a
  // DUPLICATE task.
  assert.match(SECTION, /existingTaskTitles/);
  assert.match(SECTION, /existing\.has\(normalizeTitle\(s\.title\)\)/);
  assert.match(BPS, /existingTaskTitles=\{allTasks\.map/);
});

test('adding a task refetches the plan so it actually appears', () => {
  // Otherwise the patient is told it was added and sees no change anywhere.
  // The callback now carries the new task id so the parent can also reveal
  // where it landed — see the reveal tests below.
  assert.match(SECTION, /onTaskAdded\?\.\(created\.id\)/);
  assert.match(BPS, /aiPlanQuery\.refetch\(\)/);
});

test('the added confirmation says WHERE it went', () => {
  // "Added to my plan" with no destination was reported as "where it is
  // added don't know".
  assert.match(SECTION, /On your plan — tick it off below/);
});


// ── Show where it landed (Vishal 2026-08-11) ─────────────────────────

test('the new task id is handed up, not just a bare notification', () => {
  // "we are not giving user any info where its added". Revealing the
  // destination needs the id; a void callback cannot highlight anything.
  assert.match(SECTION, /onTaskAdded\?\.\(created\.id\)/);
  assert.match(SECTION, /const created = await createPlanTask/);
});

test('the scroll targets the ROW, not the section', () => {
  // Vishal 2026-08-11: "i was scrolled to beginning of task, ideally i should
  // be scrolled to place of task". Scrolling to the section header leaves the
  // new row below the fold, so the 3.5s flash happens off-screen.
  assert.match(BPS, /measureInWindow/);
  assert.match(BPS, /highlightNodeRef/);
  assert.match(BPS, /scrollOffsetY\.current \+ \(rowY - svY\)/);
  assert.match(TASKLIST, /onHighlightRef/);
});

test('does NOT use measureLayout — it fails silently', () => {
  // Vishal 2026-08-11: "its not scrolling ... i can see highlight but it
  // fixed, its not disappearing". measureLayout no-ops when the relative-to
  // handle is not a valid ancestor and fires NEITHER callback, so the scroll
  // never happened and the timer (then living inside those callbacks) never
  // armed. Both symptoms, one dead callback.
  assert.doesNotMatch(codeOnly(BPS), /measureLayout/);
  assert.doesNotMatch(codeOnly(BPS), /getInnerViewNode/);
});

test('the highlight clears even if the scroll never happens', () => {
  // THE invariant this regression taught. A visual cue must not depend on a
  // measurement succeeding — startHighlightTimer runs before any measuring.
  const fn = BPS.slice(
    BPS.indexOf('const revealAddedTask'),
    BPS.indexOf('const scrollToHighlightedRow'),
  );
  assert.match(fn, /startHighlightTimer\(\)/, 'timer must arm before any measurement');
});

test('a scroll is attempted even if measurement callbacks never fire', () => {
  // Same failure mode, other half: a belt timeout falls back to the section
  // scroll so the patient always ends up somewhere sensible.
  const fn = BPS.slice(BPS.indexOf('const scrollToHighlightedRow'));
  assert.match(fn, /let settled = false/);
  assert.match(fn, /if \(!settled\) scrollToSection\('biological'\)/);
  assert.match(fn, /clearTimeout\(fallback\)/);
});

test('the live scroll offset is tracked without causing renders', () => {
  // measureInWindow returns SCREEN coordinates; converting one to a scroll
  // target needs the current offset. Writing a ref keeps it render-free.
  assert.match(BPS, /scrollOffsetY\.current = e\.nativeEvent\.contentOffset\.y/);
  assert.match(BPS, /scrollEventThrottle=\{16\}/);
});

test('the scroll waits for the accordion to lay out', () => {
  // "scroll wasn't smooth": the old code scrolled 120ms after opening the
  // accordion, so the animation ran while content was still growing beneath
  // it. Two frames — one to commit the state change, one to lay out.
  assert.match(BPS, /requestAnimationFrame\(\(\) => requestAnimationFrame\(/);
  assert.doesNotMatch(codeOnly(BPS), /setTimeout\(\(\) => scrollToSection/);
});

test('a failed measure still moves the patient somewhere useful', () => {
  // Two ways this can go wrong — the node/scroller is missing, or the
  // measure callbacks never fire. Both fall back to the section scroll;
  // landing roughly right beats not moving at all.
  const fn = BPS.slice(BPS.indexOf('const scrollToHighlightedRow'));
  const fallbacks = fn.match(/scrollToSection\('biological'\)/g) ?? [];
  assert.equal(fallbacks.length, 2, 'both failure paths need a fallback scroll');
});

test('the highlight timer is armed unconditionally, not inside a callback', () => {
  // Reversed deliberately. An earlier revision started this AFTER the scroll
  // so a slow layout could not eat the window — but that put it inside
  // measureLayout's callbacks, which never fired, and the highlight stuck
  // forever. Correctness (it always clears) beats the smaller nicety.
  assert.match(BPS, /const startHighlightTimer = React\.useCallback/);
  const fn = BPS.slice(BPS.indexOf('const scrollToHighlightedRow'));
  assert.doesNotMatch(fn, /startHighlightTimer\(\)/,
    'must not live inside the scroll path');
});

test('the reveal refetches BEFORE scrolling', () => {
  // Scrolling first lands on a task list that does not contain the new row
  // yet, and the flash highlights nothing.
  const fn = BPS.slice(BPS.indexOf('const revealAddedTask'));
  const refetch = fn.indexOf('await aiPlanQuery.refetch()');
  const scroll = fn.indexOf('scrollToHighlightedRow');
  assert.ok(refetch > -1 && scroll > -1);
  assert.ok(refetch < scroll, 'refetch must resolve before the scroll');
});

test('only the section the task landed in reacts', () => {
  // Adding a nutrition task must not expand Psychological or Social.
  assert.match(BPS, /openTasksSignal=\{key === 'biological' \? openTasksSignal : undefined\}/);
  assert.match(BPS, /highlightTaskId=\{key === 'biological' \? highlightTaskId : null\}/);
});

test('the accordion opens on a COUNTER, so a second add re-opens it', () => {
  // A boolean would latch: collapse the section after the first add and the
  // second add would silently do nothing.
  assert.match(TASKLIST, /openSignal\?: number/);
  assert.match(TASKLIST, /openSignal !== lastSignal\.current/);
  assert.match(BPS, /setOpenTasksSignal\(\(n\) => n \+ 1\)/);
});

test('the signal only ever OPENS, never force-closes', () => {
  // The patient's own toggle may only be overridden in the direction that
  // reveals something.
  const eff = TASKLIST.slice(TASKLIST.indexOf('const lastSignal'));
  assert.match(eff, /setOpen\(true\)/);
  assert.doesNotMatch(eff.slice(0, eff.indexOf('}, [openSignal])')), /setOpen\(false\)/);
});

test('the highlight clears itself and cannot leak a timer', () => {
  assert.match(BPS, /setHighlightTaskId\(null\), 3500/);
  assert.match(BPS, /clearTimeout\(highlightTimer\.current\)/);
  assert.match(BPS, /React\.useEffect\(\s*\(\) => \(\) => \{/, 'needs an unmount cleanup');
});

test('the highlight uses no animation module', () => {
  // This screen's iOS 26.5 envelope excludes Animated; a static flash on a
  // timer reads just as clearly.
  // codeOnly: the style comment legitimately explains WHY there is no
  // Animated here, and would otherwise fail this assertion. Fourth time this
  // trap has fired in this file — every negative assertion goes through
  // codeOnly.
  assert.doesNotMatch(codeOnly(TASKLIST), /Animated|LayoutAnimation/);
  assert.match(TASKLIST, /highlight: \{/);
});


test('the scroll is JS-eased, not the fixed native animation', () => {
  // Vishal 2026-08-11: "scroll is still too fast, it can be smooth".
  // scrollTo({animated:true}) is a fixed ~250-300ms native ramp with no
  // duration knob, which snaps on a long travel.
  assert.match(BPS, /const smoothScrollTo = React\.useCallback/);
  assert.match(BPS, /easeInOutCubic|4 \* t \* t \* t/);
  assert.match(BPS, /DURATION = 700/);
  assert.match(BPS, /smoothScrollTo\(Math\.max\(0, target\)\)/);
});

test('the eased scroll uses no animation module', () => {
  // This screen's iOS 26.5 envelope excludes Animated / LayoutAnimation.
  const fn = BPS.slice(BPS.indexOf('const smoothScrollTo'), BPS.indexOf('const revealAddedTask'));
  assert.doesNotMatch(codeOnly(fn), /Animated|LayoutAnimation/);
  assert.match(fn, /requestAnimationFrame/);
});

test('reduce-motion jumps instead of animating', () => {
  // Motion that exists to orient someone is exactly the motion a
  // vestibular-sensitive user needs skipped.
  assert.match(BPS, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  const fn = BPS.slice(BPS.indexOf('const smoothScrollTo'));
  assert.match(fn, /if \(reduceMotion\)[\s\S]{0,140}animated: false/);
});

test('the user\'s finger always wins', () => {
  // A JS ramp that keeps stepping while someone is dragging feels broken.
  assert.match(BPS, /onScrollBeginDrag=\{\(\) => \{/);
  const drag = BPS.slice(BPS.indexOf('onScrollBeginDrag'));
  assert.match(drag.slice(0, 300), /cancelAnimationFrame/);
});

test('an in-flight ramp cannot leak past unmount', () => {
  const cleanup = BPS.slice(BPS.indexOf('React.useEffect(\n    () => () => {'));
  assert.match(cleanup.slice(0, 300), /cancelAnimationFrame\(scrollAnimRef\.current\)/);
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

test('the added flag defers to the plan once it catches up', () => {
  // Vishal 2026-08-11: "once deleted routines is still saying on your plan".
  // The local 'done' was OR'd with the derived check forever, so deleting the
  // task cleared it from the plan but not from this card.
  const fn = SECTION.slice(SECTION.indexOf('const onAddToPlan'));
  assert.match(fn, /await onTaskAdded\?\.\(created\.id\)/,
    'must wait for the parent refetch before dropping the local flag');
  assert.match(fn, /delete next\[index\]/, 'local flag must be released');
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
  // chevron is purely the accordion affordance now; rebuilding is a worded
  // action in the body so it cannot be hit while reaching for the chevron.
  assert.doesNotMatch(codeOnly(SECTION), /name=\{isReady \? 'refresh'/);
  assert.match(SECTION, /name=\{open \? 'expand-less' : 'expand-more'\}/);
  assert.match(SECTION, /Rebuild my plan/);
});

test('collapsed costs one row in the stack', () => {
  // The subtitle, build action, suggestions and review notice all live in the
  // body — collapsed is the title row alone.
  const header = SECTION.slice(SECTION.indexOf('Header row IS the accordion'), SECTION.indexOf('{open && ('));
  assert.doesNotMatch(header, /subtitle/, 'subtitle belongs in the body');
  assert.doesNotMatch(header, /suggestions/, 'suggestions belong in the body');
});
