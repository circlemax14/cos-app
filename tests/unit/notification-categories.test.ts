import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryForPlanTask,
  defaultCategoryPrefs,
  NOTIFICATION_CATEGORY_KEYS,
  NOTIFICATION_CATEGORIES_ENABLED,
} from '../../lib/notification-categories.ts';

// COS-373: pure client mirror of the backend notification-category contract.
// medication tasks gate on `medicationTask`; everything else (and missing /
// unknown types) gate on `otherTask`. Default prefs are all-on except
// `otherTask`, which starts off.

test('categoryForPlanTask: medication → medicationTask', () => {
  assert.equal(categoryForPlanTask({ type: 'medication' }), 'medicationTask');
});

test('categoryForPlanTask: exercise → otherTask', () => {
  assert.equal(categoryForPlanTask({ type: 'exercise' }), 'otherTask');
});

test('categoryForPlanTask: appointment / reminder / arbitrary → otherTask', () => {
  assert.equal(categoryForPlanTask({ type: 'appointment' }), 'otherTask');
  assert.equal(categoryForPlanTask({ type: 'reminder' }), 'otherTask');
  assert.equal(categoryForPlanTask({ type: 'something-new' }), 'otherTask');
});

test('categoryForPlanTask: missing type → otherTask', () => {
  assert.equal(categoryForPlanTask({}), 'otherTask');
});

test('categoryForPlanTask: null / undefined task → otherTask (never throws)', () => {
  assert.equal(categoryForPlanTask(null), 'otherTask');
  assert.equal(categoryForPlanTask(undefined), 'otherTask');
});

test('defaultCategoryPrefs: otherTask off, the rest on', () => {
  const prefs = defaultCategoryPrefs();
  assert.equal(prefs.appointments, true);
  assert.equal(prefs.reminders, true);
  assert.equal(prefs.medicationReminders, true);
  assert.equal(prefs.medicationTask, true);
  assert.equal(prefs.otherTask, false);
});

test('defaultCategoryPrefs: returns a fresh object each call (no shared mutation)', () => {
  const a = defaultCategoryPrefs();
  a.appointments = false;
  const b = defaultCategoryPrefs();
  assert.equal(b.appointments, true);
});

test('NOTIFICATION_CATEGORY_KEYS: the five expected keys, in order', () => {
  assert.deepEqual(
    [...NOTIFICATION_CATEGORY_KEYS],
    ['appointments', 'reminders', 'medicationReminders', 'medicationTask', 'otherTask'],
  );
});

test('NOTIFICATION_CATEGORY_KEYS covers exactly the defaultCategoryPrefs keys', () => {
  assert.deepEqual(
    [...NOTIFICATION_CATEGORY_KEYS].sort(),
    Object.keys(defaultCategoryPrefs()).sort(),
  );
});

test('NOTIFICATION_CATEGORIES_ENABLED is enabled (COS-375 rollout — backend notification_categories_enabled is live)', () => {
  assert.equal(NOTIFICATION_CATEGORIES_ENABLED, true);
});
