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

// The key list is ORDERED because it drives the settings-screen rows and
// every iteration over categories. Two keys were appended after the COS-373
// original five:
//   - `nudges` (SCRUM-641, Proactive Nudges)
//   - `habits` (SCRUM-659, Habits-in-Plan reminders)
// Both were APPENDED rather than inserted, deliberately: the five COS-373
// keys keep their positions so the settings rows patients already know
// don't reshuffle under them, and so this list stays index-comparable with
// the backend's own ordered mirror. New categories go on the END.
test('NOTIFICATION_CATEGORY_KEYS: the seven expected keys, in order', () => {
  assert.deepEqual(
    [...NOTIFICATION_CATEGORY_KEYS],
    [
      'appointments',
      'reminders',
      'medicationReminders',
      'medicationTask',
      'otherTask',
      'nudges',
      'habits',
    ],
    'NOTIFICATION_CATEGORY_KEYS must stay in lockstep with the backend preference keys AND keep the original COS-373 five in their original positions, with SCRUM-641 `nudges` and SCRUM-659 `habits` appended after them. A reorder silently reshuffles the reminder-settings rows; a missing key means that category can never be toggled off in the app even though the backend persists it.',
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
