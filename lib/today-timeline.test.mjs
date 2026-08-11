/**
 * Today timeline merge + adherence.
 *
 * The merge rules are where a screen like this goes wrong invisibly: an item
 * with no time silently vanishing, an hour reordering between renders, or a
 * denominator that quietly grows to include things the patient cannot action.
 * All three are cheap to assert and expensive to notice on a device.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  minutesOf,
  hourLabel,
  buildTimeline,
  computeAdherence,
  minutesSinceMidnight,
} from './today-timeline.ts';

const item = (over) => ({
  id: over.id ?? over.title,
  kind: 'task',
  title: 'x',
  time: null,
  done: false,
  ...over,
});

test('minutesOf parses and rejects', () => {
  assert.equal(minutesOf('06:30'), 390);
  assert.equal(minutesOf('00:00'), 0);
  assert.equal(minutesOf('23:59'), 1439);
  for (const bad of [null, undefined, '', 'noon', '25:00', '10:75', '1030']) {
    assert.equal(minutesOf(bad), null, `${String(bad)} must not parse`);
  }
});

test('hourLabel reads like a clock, not a number', () => {
  assert.equal(hourLabel(0), '12 am');
  assert.equal(hourLabel(6), '6 am');
  assert.equal(hourLabel(12), '12 pm');
  assert.equal(hourLabel(13), '1 pm');
  assert.equal(hourLabel(22), '10 pm');
});

test('only hours with something in them are emitted', () => {
  // Ken's mock draws every hour 6am–10pm. On a phone that is a column of
  // blank rows.
  const { hours } = buildTimeline([
    item({ title: 'Walk', time: '09:00' }),
    item({ title: 'Meditation', time: '13:00' }),
  ]);
  assert.deepEqual(hours.map((h) => h.hour), [9, 13]);
});

test('an item with no time is never dropped', () => {
  // The four-group layout this replaces existed because streams were
  // vanishing. Losing "Drink water" would reintroduce exactly that.
  const { hours, anytime } = buildTimeline([
    item({ title: 'Drink water', time: null }),
    item({ title: 'Walk', time: '09:00' }),
  ]);
  assert.equal(hours.length, 1);
  assert.deepEqual(anytime.map((i) => i.title), ['Drink water']);
});

test('an UNPARSEABLE time falls to anytime rather than to midnight', () => {
  // Coercing junk to 0 would file it under 12am, which is worse than
  // admitting we do not know when it is.
  const { hours, anytime } = buildTimeline([item({ title: 'Mystery', time: 'later' })]);
  assert.equal(hours.length, 0);
  assert.deepEqual(anytime.map((i) => i.title), ['Mystery']);
});

test('appointments anchor their hour', () => {
  // You can move a stretch; you cannot move a therapy slot.
  const { hours } = buildTimeline([
    item({ title: 'Stretching', kind: 'task', time: '10:00' }),
    item({ title: 'ADL', kind: 'routine', time: '10:00' }),
    item({ title: 'Dr Appointment', kind: 'appointment', time: '10:00' }),
  ]);
  assert.deepEqual(hours[0].items.map((i) => i.title), [
    'Dr Appointment',
    'ADL',
    'Stretching',
  ]);
});

test('earlier minutes win over kind within an hour', () => {
  const { hours } = buildTimeline([
    item({ title: 'Late appt', kind: 'appointment', time: '09:45' }),
    item({ title: 'Early task', kind: 'task', time: '09:05' }),
  ]);
  assert.deepEqual(hours[0].items.map((i) => i.title), ['Early task', 'Late appt']);
});

test('ordering is stable regardless of input order', () => {
  // Two fetches resolving in a different order must not reshuffle the day.
  const a = [
    item({ title: 'Walk', kind: 'task', time: '09:00' }),
    item({ title: 'Talk with Vishal', kind: 'appointment', time: '09:00' }),
  ];
  const b = [a[1], a[0]];
  assert.deepEqual(
    buildTimeline(a).hours[0].items.map((i) => i.title),
    buildTimeline(b).hours[0].items.map((i) => i.title),
  );
});

test('anytime puts undone first', () => {
  const { anytime } = buildTimeline([
    item({ title: 'Done thing', done: true }),
    item({ title: 'Todo thing', done: false }),
  ]);
  assert.deepEqual(anytime.map((i) => i.title), ['Todo thing', 'Done thing']);
});

test('an empty day does not throw', () => {
  const t = buildTimeline([]);
  assert.deepEqual(t.hours, []);
  assert.deepEqual(t.anytime, []);
});

// ── Adherence ────────────────────────────────────────────────────────

const day = [
  { ...item({ title: 'Walk', kind: 'task', time: '09:00', done: true }) },
  { ...item({ title: 'Check BP', kind: 'task', time: '09:00', done: true }) },
  { ...item({ title: 'Stretching', kind: 'task', time: '10:00', done: true }) },
  { ...item({ title: 'Meditation', kind: 'task', time: '13:00', done: false }) },
  { ...item({ title: 'Prayer', kind: 'task', time: '17:00', done: false }) },
  { ...item({ title: 'Dr Appointment', kind: 'appointment', time: '08:00', done: false }) },
  { ...item({ title: 'Coffee', kind: 'routine', time: '07:00', done: false }) },
];

test('ROUTINES AND APPOINTMENTS DO NOT COUNT', () => {
  // Ken's decision. Including an appointment makes the number unactionable —
  // you cannot complete one from the app — and averaging a missed doctor with
  // a skipped stretch says nothing true.
  const a = computeAdherence(day, 23 * 60);
  assert.equal(a.total, 5, 'only the five tasks');
  assert.equal(a.due, 5);
});

test('only what is due SO FAR counts', () => {
  // At 10:30 three tasks are due and all three are done.
  const a = computeAdherence(day, 10 * 60 + 30);
  assert.equal(a.due, 3);
  assert.equal(a.done, 3);
  assert.equal(a.percent, 100);
});

test('a whole-day denominator would have said 60% at the same moment', () => {
  // The reason for the "due so far" rule, stated as a test: same instant,
  // same behaviour, and the naive figure reads as failure.
  const naive = Math.round((3 / 5) * 100);
  assert.equal(naive, 60);
  assert.equal(computeAdherence(day, 10 * 60 + 30).percent, 100);
});

test('nothing due yet is 100%, not 0%', () => {
  // A patient awake ten minutes has not failed at anything.
  const a = computeAdherence(day, 6 * 60);
  assert.equal(a.due, 0);
  assert.equal(a.percent, 100);
});

test('a missed task does pull the number down', () => {
  // The score has to be capable of saying something, or it is decoration.
  const a = computeAdherence(day, 14 * 60);
  assert.equal(a.due, 4);
  assert.equal(a.done, 3);
  assert.equal(a.percent, 75);
});

test('an untimed task counts as due — today has started', () => {
  const a = computeAdherence(
    [item({ title: 'Drink water', kind: 'task', time: null, done: false })],
    6 * 60,
  );
  assert.equal(a.due, 1);
  assert.equal(a.percent, 0);
});

test('total counts every task, so "still to come" is derivable', () => {
  const a = computeAdherence(day, 10 * 60 + 30);
  assert.equal(a.total, 5);
  assert.equal(a.total - a.due, 2);
});

test('minutesSinceMidnight', () => {
  const d = new Date(2026, 7, 11, 13, 40, 0);
  assert.equal(minutesSinceMidnight(d), 13 * 60 + 40);
});
