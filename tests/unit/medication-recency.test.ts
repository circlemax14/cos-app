/**
 * COS-1041 — current vs past medications.
 *
 * The asymmetry is the point and is asserted here: an unknown status must
 * never be promoted to "current". Showing a discontinued drug as current can
 * contribute to a double-prescription; filing a current one under history
 * costs one tap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentMedication, splitByRecency } from '../../lib/medication-recency.ts';

test('THE POINT: only genuinely current statuses count as current', () => {
  for (const s of ['active', 'on-hold', 'draft']) {
    assert.equal(isCurrentMedication(s), true, `${s} should be current`);
  }
  for (const s of ['completed', 'stopped', 'cancelled', 'entered-in-error', 'unknown']) {
    assert.equal(isCurrentMedication(s), false, `${s} should be past`);
  }
});

test('on-hold is CURRENT, not history', () => {
  // A paused drug is part of the present picture. Filing it under history
  // reads as "stopped", which is a different clinical fact.
  assert.equal(isCurrentMedication('on-hold'), true);
});

test('THE POINT: a missing status is PAST, never current', () => {
  // COS-1009 left six years of prescriptions on the wire. Anything we cannot
  // positively confirm as current must not be presented as current.
  for (const s of [undefined, null, '', '   ']) {
    assert.equal(isCurrentMedication(s as string | undefined), false);
  }
});

test('status matching is case- and whitespace-insensitive', () => {
  // EHR data is messy; "Active " must not silently become history.
  assert.equal(isCurrentMedication('  Active '), true);
  assert.equal(isCurrentMedication('ACTIVE'), true);
});

test('splitByRecency separates the two lists', () => {
  const { current, past } = splitByRecency([
    { status: 'active', authoredOn: '2026-01-01' },
    { status: 'completed', authoredOn: '2020-01-01' },
    { status: 'on-hold', authoredOn: '2025-01-01' },
  ]);
  assert.equal(current.length, 2);
  assert.equal(past.length, 1);
});

test('past is ordered newest-first', () => {
  const { past } = splitByRecency([
    { status: 'completed', authoredOn: '2019-05-01' },
    { status: 'stopped', authoredOn: '2024-05-01' },
    { status: 'completed', authoredOn: '2021-05-01' },
  ]);
  assert.deepEqual(past.map((p) => p.authoredOn), ['2024-05-01', '2021-05-01', '2019-05-01']);
});

test('undated past rows SINK rather than sorting as epoch 0', () => {
  // Date.parse(undefined) is NaN; a naive comparator would sort these to the
  // top as if they were the oldest possible date, burying the real history.
  const { past } = splitByRecency([
    { status: 'completed', authoredOn: null },
    { status: 'completed', authoredOn: '2024-05-01' },
    { status: 'completed' },
  ]);
  assert.equal(past[0].authoredOn, '2024-05-01', 'a real date must lead');
  assert.equal(past.length, 3);
});

test('an empty list does not throw', () => {
  assert.deepEqual(splitByRecency([]), { current: [], past: [] });
});
