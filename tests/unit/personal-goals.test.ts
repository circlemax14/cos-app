/**
 * Pure-logic tests for patient-authored PERSONAL GOALS (COS-405 / SCRUM-532).
 *
 * Covers:
 *  - the PERSONAL_GOALS_ENABLED kill-switch default (OFF / dark),
 *  - the add/edit form validation (quantitative target/baseline parsing,
 *    qualitative status, title rules),
 *  - the 404-graceful normalizer path (a missing/non-array/malformed body ⇒ []),
 *  - the measure + progress helpers.
 *
 * These import ONLY from lib/care-plan (pure, no RN/axios) so node:test loads
 * them directly — the 404-graceful behavior in the service is the same
 * normalizer wrapped in try/catch, exercised here at the pure boundary.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAL_GOALS_ENABLED,
  PERSONAL_GOAL_CADENCES,
  PERSONAL_GOAL_STATUSES,
  cadenceLabel,
  personalGoalStatusLabel,
  validatePersonalGoalDraft,
  normalizePersonalGoal,
  normalizePersonalGoals,
  formatPersonalGoalMeasure,
  personalGoalProgressFraction,
  personalGoalsForCategory,
  type PersonalGoalDraft,
} from '../../lib/care-plan.ts';

// ── Kill-switch: dark by default ────────────────────────────────────────────

test('PERSONAL_GOALS_ENABLED defaults to false (dark until backend ships + flip)', () => {
  assert.equal(PERSONAL_GOALS_ENABLED, false);
});

test('cadence + status registries expose the contract values', () => {
  assert.deepEqual(PERSONAL_GOAL_CADENCES.map((c) => c.key), [
    'monthly', 'quarterly', 'biannual', 'yearly',
  ]);
  assert.deepEqual(PERSONAL_GOAL_STATUSES.map((s) => s.key), [
    'not_started', 'in_progress', 'on_track', 'achieved',
  ]);
  assert.equal(cadenceLabel('quarterly'), 'Quarterly');
  assert.equal(cadenceLabel('bogus'), 'Monthly');
  assert.equal(personalGoalStatusLabel('on_track'), 'On track');
  assert.equal(personalGoalStatusLabel(undefined), 'Not started');
});

// ── Form validation — quantitative ──────────────────────────────────────────

test('validate quantitative: title + numeric target ⇒ ok, numbers parsed', () => {
  const draft: PersonalGoalDraft = {
    type: 'quantitative',
    cadence: 'monthly',
    title: '  Walk daily  ',
    target: '30',
    unit: 'minutes',
    baseline: '5',
  };
  const r = validatePersonalGoalDraft(draft);
  assert.ok(r.ok);
  assert.equal(r.value.title, 'Walk daily'); // trimmed
  assert.equal(r.value.target, 30); // number, not string
  assert.equal(r.value.baseline, 5);
  assert.equal(r.value.unit, 'minutes');
  assert.equal(r.value.type, 'quantitative');
});

test('validate quantitative: missing target ⇒ error', () => {
  const r = validatePersonalGoalDraft({ type: 'quantitative', cadence: 'monthly', title: 'x' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /target/i);
});

test('validate quantitative: non-numeric target ⇒ error', () => {
  const r = validatePersonalGoalDraft({ type: 'quantitative', cadence: 'monthly', title: 'x', target: 'lots' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /number/i);
});

test('validate quantitative: non-numeric baseline ⇒ error', () => {
  const r = validatePersonalGoalDraft({
    type: 'quantitative', cadence: 'monthly', title: 'x', target: '10', baseline: 'abc',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /baseline/i);
});

test('validate quantitative: empty optional unit/baseline are dropped', () => {
  const r = validatePersonalGoalDraft({
    type: 'quantitative', cadence: 'yearly', title: 'x', target: '10', unit: '  ', baseline: '',
  });
  assert.ok(r.ok);
  assert.equal(r.value.unit, undefined);
  assert.equal(r.value.baseline, undefined);
  assert.equal(r.value.cadence, 'yearly');
});

// ── Form validation — qualitative ───────────────────────────────────────────

test('validate qualitative: defaults status to not_started, no target/unit', () => {
  const r = validatePersonalGoalDraft({ type: 'qualitative', cadence: 'quarterly', title: 'Feel calmer' });
  assert.ok(r.ok);
  assert.equal(r.value.type, 'qualitative');
  assert.equal(r.value.status, 'not_started');
  assert.equal(r.value.target, undefined);
  assert.equal(r.value.unit, undefined);
});

test('validate qualitative: honors a provided status', () => {
  const r = validatePersonalGoalDraft({ type: 'qualitative', cadence: 'monthly', title: 't', status: 'on_track' });
  assert.ok(r.ok);
  assert.equal(r.value.status, 'on_track');
});

// ── Title rules (both types) ────────────────────────────────────────────────

test('validate: blank title ⇒ error', () => {
  const r = validatePersonalGoalDraft({ type: 'qualitative', cadence: 'monthly', title: '   ' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /title/i);
});

test('validate: over-long title ⇒ error', () => {
  const r = validatePersonalGoalDraft({
    type: 'qualitative', cadence: 'monthly', title: 'a'.repeat(121),
  });
  assert.equal(r.ok, false);
});

test('validate: unknown cadence falls back to monthly', () => {
  const r = validatePersonalGoalDraft({
    type: 'qualitative', cadence: 'weekly' as any, title: 'ok',
  });
  assert.ok(r.ok);
  assert.equal(r.value.cadence, 'monthly');
});

// ── 404-graceful normalizer path ────────────────────────────────────────────

test('normalizePersonalGoals: missing/non-array body ⇒ [] (mirrors a 404 → empty)', () => {
  assert.deepEqual(normalizePersonalGoals(undefined), []);
  assert.deepEqual(normalizePersonalGoals(null), []);
  assert.deepEqual(normalizePersonalGoals({}), []);
  assert.deepEqual(normalizePersonalGoals({ goals: 'nope' }), []);
  assert.deepEqual(normalizePersonalGoals({ goals: [] }), []);
});

test('normalizePersonalGoals: drops malformed rows, keeps valid ones', () => {
  const out = normalizePersonalGoals({
    goals: [
      { id: 'g1', title: 'Walk', category: 'medical', type: 'quantitative', cadence: 'monthly', target: 30 },
      { id: '', title: 'no id', category: 'medical' }, // dropped — no id
      { title: 'no id field', category: 'medical' }, // dropped
      { id: 'g2', title: '', category: 'social' }, // dropped — no title
      { id: 'g3', title: 'Peace', category: 'spiritual', type: 'qualitative', cadence: 'yearly', status: 'on_track' },
      'garbage', // dropped
    ],
  });
  assert.deepEqual(out.map((g) => g.id), ['g1', 'g3']);
  assert.equal(out[0].target, 30);
  assert.equal(out[1].type, 'qualitative');
  assert.equal(out[1].status, 'on_track');
});

test('normalizePersonalGoal: coerces bad cadence/type/numbers defensively', () => {
  const g = normalizePersonalGoal({
    id: 'x', title: 'T', category: 'adl',
    type: 'weird', cadence: 'fortnightly', target: 'NaN-as-string', current: 4,
  });
  assert.ok(g);
  assert.equal(g.type, 'quantitative'); // unknown → quantitative
  assert.equal(g.cadence, 'monthly'); // unknown → monthly
  assert.equal(g.target, undefined); // non-number dropped
  assert.equal(g.current, 4);
});

// ── Measure + progress helpers ──────────────────────────────────────────────

test('formatPersonalGoalMeasure: quantitative current/target with unit', () => {
  assert.equal(
    formatPersonalGoalMeasure({ type: 'quantitative', current: 12, target: 30, unit: 'min' }),
    '12 min of 30 min',
  );
  assert.equal(
    formatPersonalGoalMeasure({ type: 'quantitative', target: 30, unit: 'lbs', baseline: 50 }),
    'From 50 lbs to 30 lbs',
  );
  assert.equal(formatPersonalGoalMeasure({ type: 'quantitative', target: 30 }), 'Aiming for 30');
  assert.equal(formatPersonalGoalMeasure({ type: 'quantitative' }), '');
});

test('formatPersonalGoalMeasure: qualitative shows status label', () => {
  assert.equal(
    formatPersonalGoalMeasure({ type: 'qualitative', status: 'in_progress' }),
    'In progress',
  );
});

test('personalGoalProgressFraction: clamps 0–1; null when not computable', () => {
  assert.equal(personalGoalProgressFraction({ type: 'quantitative', baseline: 0, current: 15, target: 30 }), 0.5);
  // beyond target clamps to 1
  assert.equal(personalGoalProgressFraction({ type: 'quantitative', baseline: 0, current: 40, target: 30 }), 1);
  // below baseline clamps to 0
  assert.equal(personalGoalProgressFraction({ type: 'quantitative', baseline: 10, current: 5, target: 30 }), 0);
  // qualitative ⇒ null
  assert.equal(personalGoalProgressFraction({ type: 'qualitative' }), null);
  // missing target ⇒ null
  assert.equal(personalGoalProgressFraction({ type: 'quantitative', current: 5 }), null);
  // zero span ⇒ null
  assert.equal(personalGoalProgressFraction({ type: 'quantitative', baseline: 30, current: 30, target: 30 }), null);
});

test('personalGoalsForCategory filters to the category key', () => {
  const goals = [
    { id: '1', category: 'medical' },
    { id: '2', category: 'social' },
    { id: '3', category: 'medical' },
  ];
  assert.deepEqual(personalGoalsForCategory(goals, 'medical').map((g) => g.id), ['1', '3']);
  assert.deepEqual(personalGoalsForCategory(goals, 'spiritual'), []);
});
