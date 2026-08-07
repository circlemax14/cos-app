import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARE_PLAN_ENABLED,
  CARE_PLAN_CATEGORIES,
  CARE_PLAN_CATEGORY_KEYS,
  NUTRITION_PLAN_ENABLED,
  categoryLabel,
  groupGoalsByCategory,
  formatGoalMeasure,
  GOAL_PROGRESS_ENABLED,
  formatGoalProgress,
  CARE_PLAN_V2_ENABLED,
  isPlanTaskTypeVisible,
  PLAN_REDESIGN_ENABLED,
  formatGoalPlain,
  TASK_TYPE_TO_CATEGORY,
  taskCategoryFor,
  groupTasksByCategory,
  getCategoryStatus,
  buildCategorySections,
} from '../../lib/care-plan.ts';

test('CARE_PLAN_ENABLED is enabled (COS-377 rollout — backend care_plan_enabled is live in prod)', () => {
  assert.equal(CARE_PLAN_ENABLED, true);
});

// ── Nutrition category (COS-399 / SCRUM-536) ─────────────────────────────────
// Ken added Nutrition at position #2. It is gated behind NUTRITION_PLAN_ENABLED
// (default OFF). The exported CARE_PLAN_CATEGORIES is flag-aware: flag-off = the
// original 8 (byte-for-byte today); flag-on = 9 with nutrition at index 1.

const EIGHT_KEYS_OFF = [
  'medical', 'cognitive', 'adl', 'medication',
  'mentalHealth', 'integrative', 'social', 'spiritual',
] as const;

const NINE_KEYS_ON = [
  'medical', 'nutrition', 'cognitive', 'adl', 'medication',
  'mentalHealth', 'integrative', 'social', 'spiritual',
] as const;

test('NUTRITION_PLAN_ENABLED is a boolean kill-switch (matches backend SSM rollout)', () => {
  // 2026-08-02: flipped ON by user directive ("enable everything and OTA").
  // Test remains a regression guard on the const's TYPE + presence — its
  // VALUE is intentionally rolled forward/backward via OTAs.
  assert.equal(typeof NUTRITION_PLAN_ENABLED, 'boolean');
});

test('category keys are flag-aware: OFF ⇒ the original 8 in Ken’s order; ON ⇒ 9 with nutrition at index 1', () => {
  const keys = [...CARE_PLAN_CATEGORY_KEYS];
  if (NUTRITION_PLAN_ENABLED) {
    // Flag ON: nutrition appears at position #2 (index 1).
    assert.deepEqual(keys, [...NINE_KEYS_ON]);
    assert.equal(keys.length, 9);
    assert.equal(keys[1], 'nutrition');
    assert.equal(CARE_PLAN_CATEGORIES[1].label, 'Nutrition');
  } else {
    // Flag OFF (default): byte-for-byte today's 8 — no nutrition anywhere.
    assert.deepEqual(keys, [...EIGHT_KEYS_OFF]);
    assert.equal(keys.length, 8);
    assert.ok(!keys.includes('nutrition'));
  }
});

test('categoryLabel resolves Nutrition even when the flag is off (defensive label lookup)', () => {
  assert.equal(categoryLabel('nutrition'), 'Nutrition');
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

// ── Category-first plan view: task→category fallback + STATUS (COS-404, SCRUM-539) ──

test('taskCategoryFor: prefers a valid AI-tagged task.category', () => {
  assert.equal(taskCategoryFor({ type: 'exercise', category: 'social' }), 'social');
  assert.equal(taskCategoryFor({ type: 'medication', category: 'mentalHealth' }), 'mentalHealth');
});

test('taskCategoryFor: falls back to the type→category mapping when category is absent', () => {
  // medication-type → medication category; exercise/appointment/reminder → medical
  assert.equal(taskCategoryFor({ type: 'medication' }), 'medication');
  assert.equal(taskCategoryFor({ type: 'exercise' }), 'medical');
  assert.equal(taskCategoryFor({ type: 'appointment' }), 'medical');
  assert.equal(taskCategoryFor({ type: 'reminder' }), 'medical');
  assert.equal(TASK_TYPE_TO_CATEGORY.medication, 'medication');
  assert.equal(TASK_TYPE_TO_CATEGORY.exercise, 'medical');
});

test('taskCategoryFor: ignores an unknown task.category and uses the type fallback', () => {
  assert.equal(taskCategoryFor({ type: 'medication', category: 'bogus' }), 'medication');
  // unknown type with no/invalid category ⇒ safe default "medical" (never dropped)
  assert.equal(taskCategoryFor({ type: 'mystery' }), 'medical');
  assert.equal(taskCategoryFor({}), 'medical');
});

test('groupTasksByCategory: groups in registry order, present-only, using the fallback', () => {
  const tasks = [
    { id: '1', type: 'medication' },               // → medication
    { id: '2', type: 'exercise' },                 // → medical
    { id: '3', type: 'appointment', category: 'social' }, // tagged → social
  ];
  const groups = groupTasksByCategory(tasks);
  // medical (1st in registry) before medication before social
  assert.deepEqual(groups.map((g) => g.key), ['medical', 'medication', 'social']);
  assert.equal(groups[0].tasks.length, 1); // exercise → medical
  assert.equal(groups[0].tasks[0].id, '2');
  assert.equal(groups[1].tasks[0].id, '1');
  assert.equal(groups[2].tasks[0].id, '3');
});

test('getCategoryStatus: returns the trimmed status when present', () => {
  const statuses = [
    { category: 'medical', status: '  Blood pressure trending down.  ' },
    { category: 'social', status: 'Engaged with the senior center weekly.' },
  ];
  assert.equal(getCategoryStatus(statuses, 'medical'), 'Blood pressure trending down.');
  assert.equal(getCategoryStatus(statuses, 'social'), 'Engaged with the senior center weekly.');
});

test('getCategoryStatus: GRACEFUL absent path — undefined/empty/missing ⇒ null (omit the block)', () => {
  // backend flag off / not deployed ⇒ no categoryStatuses at all
  assert.equal(getCategoryStatus(undefined, 'medical'), null);
  // present array but no entry for this category
  assert.equal(getCategoryStatus([{ category: 'social', status: 'x' }], 'medical'), null);
  // entry present but empty/whitespace status ⇒ null
  assert.equal(getCategoryStatus([{ category: 'medical', status: '   ' }], 'medical'), null);
  assert.equal(getCategoryStatus([{ category: 'medical' }], 'medical'), null);
  // not an array ⇒ never throws
  assert.equal(getCategoryStatus({} as any, 'medical'), null);
});

test('buildCategorySections: STATUS → TASKS → GOALS per category, registry order, present-only', () => {
  const goals = [
    { id: 'g1', title: 'Walk daily', category: 'medical' },
    { id: 'g2', title: 'Call a friend', category: 'social' },
  ];
  const tasks = [
    { id: 't1', type: 'medication' },  // → medication category
    { id: 't2', type: 'exercise' },    // → medical category
  ];
  const statuses = [{ category: 'medical', status: 'Doing well overall.' }];
  const { sections, leftoverGoals } = buildCategorySections(goals, tasks, statuses);

  // medical (goals+tasks+status), medication (tasks only), social (goals only)
  assert.deepEqual(sections.map((s) => s.key), ['medical', 'medication', 'social']);
  assert.equal(leftoverGoals.length, 0);

  const medical = sections[0];
  assert.equal(medical.status, 'Doing well overall.');
  assert.equal(medical.tasks.length, 1);
  assert.equal(medical.tasks[0].id, 't2');
  assert.equal(medical.goals.length, 1);
  assert.equal(medical.goals[0].id, 'g1');

  // medication: a task-only category still surfaces (no goals, no status)
  const medication = sections[1];
  assert.equal(medication.status, null);
  assert.equal(medication.goals.length, 0);
  assert.equal(medication.tasks[0].id, 't1');
});

test('buildCategorySections: status-ABSENT graceful path — section still reads TASKS → GOALS', () => {
  const goals = [{ id: 'g1', title: 'Walk daily', category: 'medical' }];
  const tasks = [{ id: 't1', type: 'exercise' }];
  // No categoryStatuses passed at all (backend not yet shipped)
  const { sections } = buildCategorySections(goals, tasks, undefined);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].key, 'medical');
  assert.equal(sections[0].status, null); // omitted, not a crash/placeholder
  assert.equal(sections[0].tasks.length, 1);
  assert.equal(sections[0].goals.length, 1);
});

test('buildCategorySections: a STATUS-only category (no goals/tasks) still surfaces', () => {
  const { sections } = buildCategorySections(
    [],
    [],
    [{ category: 'spiritual', status: 'Finds comfort in weekly services.' }],
  );
  assert.deepEqual(sections.map((s) => s.key), ['spiritual']);
  assert.equal(sections[0].status, 'Finds comfort in weekly services.');
  assert.equal(sections[0].goals.length, 0);
  assert.equal(sections[0].tasks.length, 0);
});

test('buildCategorySections: goals with no/unknown category fall into leftoverGoals (nothing lost)', () => {
  const goals = [
    { id: 'g1', title: 'Tagged', category: 'medical' },
    { id: 'g2', title: 'Legacy, no category' },
    { id: 'g3', title: 'Unknown category', category: 'bogus' },
  ];
  const { sections, leftoverGoals } = buildCategorySections(goals, [], undefined);
  assert.deepEqual(sections.map((s) => s.key), ['medical']);
  assert.deepEqual(leftoverGoals.map((g) => g.id), ['g2', 'g3']);
});

test('buildCategorySections: empty plan ⇒ no sections, no leftovers (caller shows empty state)', () => {
  const { sections, leftoverGoals } = buildCategorySections([], [], undefined);
  assert.equal(sections.length, 0);
  assert.equal(leftoverGoals.length, 0);
});

// ── F2 (COS-404, SCRUM-539): within-category task time-sort ────────────────────
// PlanScreenRedesigned sorts visible tasks ascending by scheduledTime BEFORE
// grouping, restoring the original/flag-off ordering. The comparator (mirrored
// from the component) is null-safe: a missing/empty scheduledTime sorts LAST.
// buildCategorySections preserves that pre-sorted order while grouping, so each
// category renders its tasks time-ordered.

const byScheduledTime = (a: { scheduledTime?: string }, b: { scheduledTime?: string }) => {
  const at = a.scheduledTime || '';
  const bt = b.scheduledTime || '';
  if (!at && !bt) return 0;
  if (!at) return 1; // a has no time → after b
  if (!bt) return -1; // b has no time → after a
  return at.localeCompare(bt);
};

test('task time-sort: ascending by scheduledTime ("HH:MM" lexicographic)', () => {
  const tasks = [
    { id: 'c', scheduledTime: '18:00' },
    { id: 'a', scheduledTime: '06:30' },
    { id: 'b', scheduledTime: '08:00' },
  ];
  const sorted = tasks.slice().sort(byScheduledTime).map((t) => t.id);
  assert.deepEqual(sorted, ['a', 'b', 'c']);
});

test('task time-sort: null-safe — missing/empty scheduledTime sorts LAST', () => {
  const tasks = [
    { id: 'noTime' },                       // undefined scheduledTime
    { id: 'late', scheduledTime: '21:00' },
    { id: 'empty', scheduledTime: '' },     // empty scheduledTime
    { id: 'early', scheduledTime: '07:15' },
  ];
  const sorted = tasks.slice().sort(byScheduledTime).map((t) => t.id);
  // timed tasks first (ascending), then the two timeless ones trailing
  assert.deepEqual(sorted.slice(0, 2), ['early', 'late']);
  assert.deepEqual(sorted.slice(2).sort(), ['empty', 'noTime']);
});

test('task time-sort flows through buildCategorySections: each category renders time-ordered', () => {
  // Pre-sort exactly as the component does, then group.
  const visibleTasks = [
    { id: 't-late', type: 'medication', scheduledTime: '20:00' },
    { id: 't-early', type: 'medication', scheduledTime: '08:00' },
  ].slice().sort(byScheduledTime);
  const { sections } = buildCategorySections([], visibleTasks, undefined);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].key, 'medication');
  // order preserved from the pre-sorted input → earliest first
  assert.deepEqual(sections[0].tasks.map((t) => t.id), ['t-early', 't-late']);
});
