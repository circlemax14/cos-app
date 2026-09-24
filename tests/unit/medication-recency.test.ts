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
import {
  isCurrentMedication,
  isFinishedCourse,
  rankCurrent,
  splitByRecency,
} from '../../lib/medication-recency.ts';

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

// ─── COS-1109 — ranking what the patient is actually taking ──────────────
// Ken's six "current" meds, reduced to the fields that decide their order.
// Authored dates and dispense shapes are his real ones; names are the ones he
// and the team already discussed in the thread.
const KEN = [
  { name: 'dexlansoprazole', authoredOn: '2016-12-01T00:00:00Z', dispenseRequest: null },
  { name: 'QUVIVIQ', authoredOn: '2025-10-01T00:00:00Z', dispenseRequest: null },
  { name: 'cephalexin', authoredOn: '2025-02-01T00:00:00Z', dispenseRequest: { numberOfRepeatsAllowed: 0 } },
  { name: 'escitalopram', authoredOn: '2023-05-01T00:00:00Z', dispenseRequest: null },
  { name: 'aspirin', authoredOn: '2025-02-01T00:00:00Z', dispenseRequest: { numberOfRepeatsAllowed: 0 } },
  { name: 'ZEPBOUND', authoredOn: '2025-11-01T00:00:00Z', dispenseRequest: null },
];
// A fixed "now" so the 90-day window is deterministic.
const NOW = Date.parse('2026-09-24T00:00:00Z');

test('THE POINT: the drugs Ken actually takes outrank a finished antibiotic course', () => {
  const order = rankCurrent(KEN, NOW).map((m) => m.name);
  // Both drugs he named as his main medicines must be above both of the
  // one-off hospital discharge scripts. Before this they were below.
  assert.ok(order.indexOf('QUVIVIQ') < order.indexOf('cephalexin'));
  assert.ok(order.indexOf('escitalopram') < order.indexOf('cephalexin'));
  assert.ok(order.indexOf('QUVIVIQ') < order.indexOf('aspirin'));
  assert.ok(order.indexOf('escitalopram') < order.indexOf('aspirin'));
});

test('a four-capsule zero-refill course from seven months ago is a finished course', () => {
  assert.equal(
    isFinishedCourse({ authoredOn: '2025-02-01T00:00:00Z', dispenseRequest: { numberOfRepeatsAllowed: 0 } }, NOW),
    true,
  );
});

test('a zero-refill script written last week is NOT finished yet', () => {
  assert.equal(
    isFinishedCourse({ authoredOn: '2026-09-17T00:00:00Z', dispenseRequest: { numberOfRepeatsAllowed: 0 } }, NOW),
    false,
  );
});

test('no dispenseRequest is not a finished course — a reconciled home med simply omits it', () => {
  // The dangerous direction. Ken's four daily drugs all have dispenseRequest
  // absent; treating absent as "finished" would sink every one of them.
  for (const m of KEN.filter((k) => !k.dispenseRequest)) {
    assert.equal(isFinishedCourse(m, NOW), false, `${m.name} must not be a finished course`);
  }
});

test('a script with refills remaining is never a finished course, however old', () => {
  assert.equal(
    isFinishedCourse({ authoredOn: '2016-01-01T00:00:00Z', dispenseRequest: { numberOfRepeatsAllowed: 3 } }, NOW),
    false,
  );
});

test('newest first within the non-finished band', () => {
  const order = rankCurrent(KEN, NOW).map((m) => m.name);
  assert.deepEqual(order.slice(0, 4), ['ZEPBOUND', 'QUVIVIQ', 'escitalopram', 'dexlansoprazole']);
});

test('undated rows sink rather than sorting as epoch 0', () => {
  const rows = [
    { name: 'undated', authoredOn: null, dispenseRequest: null },
    { name: 'old', authoredOn: '2016-01-01T00:00:00Z', dispenseRequest: null },
  ];
  assert.deepEqual(rankCurrent(rows, NOW).map((r) => r.name), ['old', 'undated']);
});

test('rankCurrent does not mutate its input', () => {
  const before = KEN.map((m) => m.name);
  rankCurrent(KEN, NOW);
  assert.deepEqual(KEN.map((m) => m.name), before);
});
