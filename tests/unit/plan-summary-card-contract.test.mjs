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
const SCREEN = readFileSync(join(ROOT, 'components/health-plan/PlanScreenRedesigned.tsx'), 'utf8');

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

test('the plan screen delegates to the card and no longer inlines the summary', () => {
  assert.match(SCREEN, /<PlanSummaryCard/, 'screen must render the card');
  assert.doesNotMatch(
    SCREEN,
    /YOUR PLAN, IN SHORT/,
    'the inline summary block must be gone, not duplicated',
  );
  assert.doesNotMatch(SCREEN, /styles\.summaryCard/, 'orphaned style must be removed');
});
