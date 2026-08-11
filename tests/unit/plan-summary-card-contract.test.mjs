/**
 * PlanSummaryCard contract.
 *
 * Vishal 2026-08-07: "ai summary in plan screen needs to be a small card and
 * when we click on it it can be expanded".
 *
 * Source-reading contract test, matching the convention used by the other
 * screen-level tests here — rendering this component would need the whole
 * theme + expo-vector-icons harness, and the properties worth pinning are
 * structural: the card is a Pressable, it collapses to a finite line count,
 * the expanded state has NO line cap, and the plan screen no longer renders
 * the summary inline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CARD = readFileSync(join(ROOT, 'components/health-plan/PlanSummaryCard.tsx'), 'utf8');
const V1 = readFileSync(join(ROOT, 'components/health-plan/PlanScreenRedesigned.tsx'), 'utf8');
const V2 = readFileSync(join(ROOT, 'components/health-plan/PlanScreenRedesignedV2.tsx'), 'utf8');
const HOST = readFileSync(join(ROOT, 'app/Home/health-plan.tsx'), 'utf8');
const FLAGS = readFileSync(join(ROOT, 'lib/care-plan.ts'), 'utf8');
const BANNER = readFileSync(join(ROOT, 'components/health-plan/BpsAiSummaryBanner.tsx'), 'utf8');

test('the card is tappable', () => {
  assert.match(CARD, /<Pressable/, 'summary card must be a Pressable');
  assert.match(CARD, /onPress=\{\(\) => setExpanded/, 'tapping must toggle expansion');
});

test('collapsed state caps the summary at a small, finite number of lines', () => {
  assert.match(CARD, /export const COLLAPSED_LINES = (\d+)/);
  const lines = Number(/export const COLLAPSED_LINES = (\d+)/.exec(CARD)[1]);
  assert.ok(lines >= 1 && lines <= 3, `expected a small line cap, got ${lines}`);
});

test('expanded state has NO line cap', () => {
  // A finite cap here would clip a long summary in the one state whose
  // entire purpose is showing all of it — the bug this asserts against.
  assert.match(
    CARD,
    /numberOfLines=\{expanded \? undefined : COLLAPSED_LINES\}/,
    'expanded must pass undefined, not a large number',
  );
});

test('announces its expanded state to screen readers', () => {
  assert.match(CARD, /accessibilityRole="button"/);
  assert.match(CARD, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(CARD, /accessibilityHint=/);
});

test('renders nothing for a whitespace-only summary', () => {
  // The caller gates on `!!plan.summary`, which is true for a string of
  // spaces — that would draw an empty card.
  assert.match(CARD, /summary\.trim\(\) === ''/);
  assert.match(CARD, /return null/);
});

test('AI provenance footer shows only when expanded', () => {
  assert.match(CARD, /\{expanded && <AICitationsFooter compact \/>\}/);
});

test('stays inside the iOS 26.5 primitive envelope', () => {
  // Alert-over-Modal and layout-animation modules have both broken this
  // screen before; the envelope is View/Text/Pressable/MaterialIcons only.
  const rnImport = /import \{([^}]+)\} from 'react-native'/.exec(CARD);
  assert.ok(rnImport, 'expected a react-native import');
  const allowed = new Set(['View', 'Text', 'Pressable', 'StyleSheet']);
  for (const name of rnImport[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    assert.ok(allowed.has(name), `${name} is outside the primitive envelope`);
  }
  assert.doesNotMatch(CARD, /LayoutAnimation|Animated|react-native-reanimated/);
});

test('the card is wired into the arm that ACTUALLY RENDERS (V2)', () => {
  // The whole point. `PLAN_REDESIGN_V2_ENABLED` is a hardcoded true, so
  // health-plan.tsx always takes the V2 branch and never reaches V1. The first
  // version of this change wired the card into V1 only, which meant a green
  // CI over a screen no user can see. Assert V2 explicitly.
  assert.match(FLAGS, /export const PLAN_REDESIGN_V2_ENABLED = true;/,
    'if V2 is no longer force-enabled, revisit which arm this test should guard');
  assert.match(HOST, /PLAN_REDESIGN_V2_ENABLED \? \(/, 'V2 must be the first branch taken');
  assert.match(V2, /<PlanSummaryCard/, 'V2 — the rendered screen — must use the card');
  assert.doesNotMatch(V2, /YOUR PLAN, IN SHORT/,
    'V2 must not still inline the summary alongside the card');
});

test('V1 is wired too, so a flag flip back does not silently lose the card', () => {
  assert.match(V1, /<PlanSummaryCard/);
  assert.doesNotMatch(V1, /YOUR PLAN, IN SHORT/);
  assert.doesNotMatch(V1, /styles\.summaryCard/, 'orphaned style must be removed');
});


// ── The summary on the surface production patients actually see ──────
//
// PlanScreenRedesignedV2 does NOT render in production: health-plan.tsx
// early-returns <BiopsychosocialPlanScreen> whenever isTabSwapBpsEnabled(),
// and the backend registry flag TAB_SWAP_BPS_ENABLED is true there. That
// screen shows its own BpsAiSummaryBanner, so the expandable behaviour had
// to be ported there too or the request was unfulfilled for every real user.

test('the BPS AI summary banner is a pure accordion', () => {
  // Vishal 2026-08-11: "ai summary card is still showing too much, it should
  // show all with accordion only". A two-line teaser was still a paragraph on
  // a screen whose job is the plan. Collapsed shows the header alone.
  assert.match(BANNER, /<Pressable/, 'banner must be tappable');
  assert.match(BANNER, /onPress=\{\(\) => setExpanded/);
  assert.match(BANNER, /\{expanded && \(\s*<Text/, 'body renders only when expanded');
  assert.match(BANNER, /\{expanded && <AICitationsFooter compact \/>\}/);
  assert.doesNotMatch(BANNER, /numberOfLines/, 'no line cap — it is all or nothing now');
});

test('the BPS banner announces its expanded state', () => {
  assert.match(BANNER, /accessibilityRole="button"/);
  assert.match(BANNER, /accessibilityState=\{\{ expanded \}\}/);
});

test('the BPS banner calls useState BEFORE its early return', () => {
  // Rules of hooks: the component returns null for an empty summary. A hook
  // after that early return breaks on the first render with content.
  const hook = BANNER.indexOf('React.useState');
  const early = BANNER.indexOf('return null');
  assert.ok(hook > -1 && early > -1);
  assert.ok(hook < early, 'useState must precede the early return');
});
