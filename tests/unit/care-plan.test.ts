import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARE_PLAN_ENABLED,
  CARE_PLAN_CATEGORY_KEYS,
  categoryLabel,
  groupGoalsByCategory,
  formatGoalMeasure,
} from '../../lib/care-plan.ts';

test('CARE_PLAN_ENABLED defaults OFF', () => {
  assert.equal(CARE_PLAN_ENABLED, false);
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
