/**
 * Pure-logic tests for the patient-local-date helper (COS-475/SCRUM-595).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getTodayLocalDate } from '../../lib/plan-v2/patient-local-date.ts';

test('formats as YYYY-MM-DD in the local calendar', () => {
  const d = new Date(2026, 6, 20, 14, 30, 0); // July 20 2026 local
  assert.equal(getTodayLocalDate(d), '2026-07-20');
});

test('pads month and day', () => {
  const d = new Date(2026, 0, 5, 0, 0, 0); // Jan 5 2026 local
  assert.equal(getTodayLocalDate(d), '2026-01-05');
});

test('handles late-evening local time (SCRUM-595 anchor)', () => {
  const d = new Date(2026, 6, 5, 23, 59, 0); // Jul 5, 23:59 local
  // Regardless of process TZ, the LOCAL date IS Jul 5 for this Date.
  assert.equal(getTodayLocalDate(d), '2026-07-05');
});
