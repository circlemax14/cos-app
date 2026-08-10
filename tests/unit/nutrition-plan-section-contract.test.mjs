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
  assert.doesNotMatch(SECTION, /useEffect/, 'no effect should trigger generation');
  // The handler is now a per-state variable bound to the card's onPress,
  // so assert the binding rather than one literal inline arrow.
  assert.match(codeOnly(SECTION), /onPress\s*[:=][^\n]*onGenerate\(\)/,
    'generation must be reachable only from a press handler');
  assert.match(codeOnly(SECTION), /onPress=\{onPress\}/, 'card press runs the handler');
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

test('stays inside the iOS 26.5 primitive envelope', () => {
  const rn = /import \{([^}]+)\} from 'react-native'/.exec(SECTION);
  assert.ok(rn, 'expected a react-native import');
  const allowed = new Set(['View', 'Text', 'Pressable', 'ActivityIndicator', 'StyleSheet']);
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
