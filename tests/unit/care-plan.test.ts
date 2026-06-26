import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARE_PLAN_ENABLED,
  CARE_PLAN_CATEGORY_KEYS,
  categoryLabel,
  groupGoalsByCategory,
  formatGoalMeasure,
  GOAL_PROGRESS_ENABLED,
  formatGoalProgress,
  CARE_PLAN_V2_ENABLED,
  isPlanTaskTypeVisible,
  PLAN_REDESIGN_ENABLED,
  formatGoalPlain,
} from '../../lib/care-plan.ts';

test('CARE_PLAN_ENABLED is enabled (COS-377 rollout — backend care_plan_enabled is live in prod)', () => {
  assert.equal(CARE_PLAN_ENABLED, true);
});

test('category keys are the 8 in Ken’s order', () => {
  assert.deepEqual([...CARE_PLAN_CATEGORY_KEYS], [
    'medical', 'cognitive', 'adl', 'medication',
    'mentalHealth', 'integrative', 'social', 'spiritual',
  ]);
});

test('categoryLabel returns a human label; unknown ⇒ "Other"', () => {
  assert.equal(categoryLabel('social'), 'Social');
  assert.equal(categoryLabel('bogus'), 'Other');
});

test('groupGoalsByCategory groups in category order, present-only', () => {
  const goals = [
    { id: '1', title: 'a', category: 'social' },
    { id: '2', title: 'b', category: 'medical' },
    { id: '3', title: 'c', category: 'medical' },
  ];
  const groups = groupGoalsByCategory(goals);
  assert.deepEqual(groups.map((g) => g.key), ['medical', 'social']); // medical before social
  assert.equal(groups[0].goals.length, 2);
});

test('groupGoalsByCategory: legacy goals (no category) fall into a single "general" group', () => {
  const groups = groupGoalsByCategory([{ id: '1', title: 'x' }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, 'general');
  assert.equal(groups[0].label, 'Your Goals');
});

test('groupGoalsByCategory: mixed categorized + legacy goals — categorized groups first, leftover in "general"', () => {
  const groups = groupGoalsByCategory([
    { id: '1', title: 'a', category: 'medical' },
    { id: '2', title: 'b' }, // legacy, no category
    { id: '3', title: 'c', category: 'social' },
  ]);
  assert.deepEqual(groups.map((g) => g.key), ['medical', 'social', 'general']);
  assert.equal(groups[2].label, 'Your Goals');
  assert.equal(groups[2].goals.length, 1);
  assert.equal(groups[2].goals[0].id, '2');
});

test('formatGoalMeasure renders baseline → target · timeframe', () => {
  assert.equal(
    formatGoalMeasure({ baseline: '7.8%', target: '<7.0%', timeframe: '3 months' }),
    '7.8% → <7.0% · 3 months',
  );
  // missing baseline shows just target · timeframe
  assert.equal(formatGoalMeasure({ target: '<10', timeframe: '8 weeks' }), '<10 · 8 weeks');
  // nothing measurable ⇒ empty string
  assert.equal(formatGoalMeasure({}), '');
});

// ── Phase 3: GOAL_PROGRESS_ENABLED + formatGoalProgress (COS-382) ────────────

test('GOAL_PROGRESS_ENABLED is enabled (COS-382 rollout)', () => {
  assert.equal(GOAL_PROGRESS_ENABLED, true);
});

test('formatGoalProgress: full progress ⇒ line + ↑ + barFraction 0.5', () => {
  const result = formatGoalProgress({
    baseline: '7.8%',
    target: '<7.0%',
    progress: { currentValue: '7.4%', trendDirection: 'improving', progressPercent: 50 },
  });
  assert.ok(result !== null);
  assert.equal(result.line, '7.8% → 7.4% → <7.0%');
  assert.equal(result.trendSymbol, '↑');
  assert.equal(result.barFraction, 0.5);
});

test('formatGoalProgress: worsening ⇒ ↓', () => {
  const result = formatGoalProgress({
    progress: { currentValue: '8.2%', trendDirection: 'worsening', progressPercent: 0 },
  });
  assert.ok(result !== null);
  assert.equal(result.trendSymbol, '↓');
});

test('formatGoalProgress: stable ⇒ →', () => {
  const result = formatGoalProgress({
    progress: { currentValue: '7.8%', trendDirection: 'stable' },
  });
  assert.ok(result !== null);
  assert.equal(result.trendSymbol, '→');
  assert.equal(result.barFraction, undefined);
});

test('formatGoalProgress: insufficient_data ⇒ empty trendSymbol', () => {
  const result = formatGoalProgress({
    progress: { currentValue: '7.8%', trendDirection: 'insufficient_data' },
  });
  assert.ok(result !== null);
  assert.equal(result.trendSymbol, '');
});

test('formatGoalProgress: no progress ⇒ null', () => {
  assert.equal(formatGoalProgress({ baseline: '7.8%', target: '<7.0%' }), null);
  assert.equal(formatGoalProgress({}), null);
});

// ── Care Plan v2 Phase A: CARE_PLAN_V2_ENABLED + isPlanTaskTypeVisible (COS-391, SCRUM-532) ──

test('CARE_PLAN_V2_ENABLED is ON (enabled 2026-06-26 via OTA, user request)', () => {
  assert.equal(CARE_PLAN_V2_ENABLED, true);
});

test('isPlanTaskTypeVisible: flag OFF shows every task type', () => {
  for (const t of ['medication', 'exercise', 'appointment', 'reminder']) {
    assert.equal(isPlanTaskTypeVisible(t, false), true);
  }
});

test('isPlanTaskTypeVisible: flag ON hides reminders + visits(appointment), keeps the rest', () => {
  assert.equal(isPlanTaskTypeVisible('reminder', true), false);
  assert.equal(isPlanTaskTypeVisible('appointment', true), false);
  assert.equal(isPlanTaskTypeVisible('medication', true), true);
  assert.equal(isPlanTaskTypeVisible('exercise', true), true);
});

// ── Plan redesign: PLAN_REDESIGN_ENABLED + formatGoalPlain (COS-402, SCRUM-538) ──

test('PLAN_REDESIGN_ENABLED is ON (enabled 2026-06-26 for Ken testing, SCRUM-538)', () => {
  assert.equal(PLAN_REDESIGN_ENABLED, true);
});

test('formatGoalPlain: prefers live progress percent ⇒ "You\'re at N% toward TARGET"', () => {
  assert.equal(
    formatGoalPlain({ target: '<7.0%', progress: { progressPercent: 72 } }),
    "You're at 72% toward <7.0%",
  );
  // no target ⇒ omit the "toward" suffix
  assert.equal(
    formatGoalPlain({ progress: { progressPercent: 40 } }),
    "You're at 40%",
  );
  // percent is clamped to 0..100 and rounded
  assert.equal(
    formatGoalPlain({ progress: { progressPercent: 120.6 } }),
    "You're at 100%",
  );
  assert.equal(
    formatGoalPlain({ progress: { progressPercent: -5 } }),
    "You're at 0%",
  );
});

test('formatGoalPlain: no progress ⇒ baseline→target framing', () => {
  assert.equal(
    formatGoalPlain({ baseline: '7.8%', target: '<7.0%', timeframe: '3 months' }),
    'From 7.8% to <7.0% over 3 months',
  );
  // target only ⇒ "Aiming for TARGET"
  assert.equal(formatGoalPlain({ target: '8,000 steps' }), 'Aiming for 8,000 steps');
  assert.equal(
    formatGoalPlain({ target: '8,000 steps', timeframe: 'a day' }),
    'Aiming for 8,000 steps over a day',
  );
});

test('formatGoalPlain: nothing measurable ⇒ empty string (caller omits the line)', () => {
  assert.equal(formatGoalPlain({}), '');
  assert.equal(formatGoalPlain({ timeframe: '6 weeks' }), 'Over 6 weeks');
});
