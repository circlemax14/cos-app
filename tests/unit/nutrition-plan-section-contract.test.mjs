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

test('does NOT generate on mount — each build costs a Bedrock call', () => {
  // A useEffect calling generate would bill a model call for every patient
  // who scrolls past the section.
  assert.doesNotMatch(SECTION, /useEffect/, 'no effect should trigger generation');
  assert.match(SECTION, /onPress=\{\(\) => void onGenerate\(\)\}/, 'generation is user-initiated');
});

/** Source with comments removed — the comments legitimately DISCUSS the
 *  banned units, so checking raw source fails on correct code. */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

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
  assert.match(BPS, /key === 'biological' &&/,
    "Ken asked for it in the BIO part of the plan");
});

test('is ALSO in V2, so a TAB_SWAP_BPS rollback does not lose it', () => {
  assert.match(SCREEN, /<NutritionPlanSection/);
});
