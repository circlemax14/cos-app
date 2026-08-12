/**
 * Reminder recurrence expansion.
 *
 * Reported 2026-08-12: "i have few more reminders for weekdays they are not
 * coming in home page and calendar." A weekday reminder is ONE EKReminder with
 * a recurrence rule — iOS expands recurring events for you but not reminders —
 * so it appeared on the single day of its dueDate and was invisible on the
 * other four.
 *
 * Every failure mode here is silent and slow to notice: an interval counted
 * from the wrong anchor is only visible in the alternate week, a day-of-week
 * off-by-one shifts a whole schedule by a day, and a rule that falls through
 * to "every day" looks like the feature working until someone counts.
 *
 * All dates are constructed from LOCAL parts (new Date(y, m, d)) so these
 * assertions hold in any machine timezone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  occursOnDay,
  occurrencesInWindow,
  MAX_OCCURRENCES,
} from './reminder-recurrence.ts';

// 2026-08-12 is a WEDNESDAY. Anchor most cases there.
const WED = new Date(2026, 7, 12);
const THU = new Date(2026, 7, 13);
const FRI = new Date(2026, 7, 14);
const SAT = new Date(2026, 7, 15);
const SUN = new Date(2026, 7, 16);
const MON = new Date(2026, 7, 17);

// expo-calendar DayOfTheWeek: 1=Sun … 7=Sat
const dow = (...ns) => ns.map((n) => ({ dayOfTheWeek: n }));
const WEEKDAYS = dow(2, 3, 4, 5, 6); // Mon–Fri

test('sanity: the anchor really is a Wednesday', () => {
  // If this ever fails every weekday assertion below is meaningless.
  assert.equal(WED.getDay(), 3);
});

test('THE REPORTED CASE: a weekday reminder occurs Mon–Fri', () => {
  const rule = { frequency: 'weekly', daysOfTheWeek: WEEKDAYS };
  for (const d of [WED, THU, FRI, MON]) {
    assert.equal(occursOnDay(rule, WED, d), true, `${d.toDateString()} should occur`);
  }
  for (const d of [SAT, SUN]) {
    assert.equal(occursOnDay(rule, WED, d), false, `${d.toDateString()} must NOT occur`);
  }
});

test('the day-of-week numbering is 1=Sunday, not JS 0=Sunday', () => {
  // The single easiest way to shift someone's entire schedule by one day.
  // dayOfTheWeek 2 is MONDAY. If this were read as JS getDay() it would be
  // Tuesday.
  const mondayOnly = { frequency: 'weekly', daysOfTheWeek: dow(2) };
  assert.equal(occursOnDay(mondayOnly, WED, MON), true, '2 must mean Monday');
  assert.equal(occursOnDay(mondayOnly, WED, new Date(2026, 7, 18)), false, 'not Tuesday');
});

test('daily, with and without an interval', () => {
  assert.equal(occursOnDay({ frequency: 'daily' }, WED, THU), true);
  const everyThird = { frequency: 'daily', interval: 3 };
  assert.equal(occursOnDay(everyThird, WED, WED), true);
  assert.equal(occursOnDay(everyThird, WED, THU), false);
  assert.equal(occursOnDay(everyThird, WED, new Date(2026, 7, 15)), true);
});

test('a fortnightly weekday rule counts WEEKS from the anchor week', () => {
  // The bug this guards: counting the interval in days would make the
  // alternate week fire on the wrong days rather than not at all.
  const rule = { frequency: 'weekly', interval: 2, daysOfTheWeek: WEEKDAYS };
  assert.equal(occursOnDay(rule, WED, THU), true, 'same week');
  assert.equal(occursOnDay(rule, WED, new Date(2026, 7, 20)), false, 'next week: skipped');
  assert.equal(occursOnDay(rule, WED, new Date(2026, 7, 27)), true, 'week after: on');
});

test('weekly with no explicit days falls back to the anchor weekday', () => {
  const rule = { frequency: 'weekly' };
  assert.equal(occursOnDay(rule, WED, new Date(2026, 7, 19)), true, 'next Wednesday');
  assert.equal(occursOnDay(rule, WED, THU), false);
});

test('a series never occurs before it starts', () => {
  const rule = { frequency: 'daily' };
  assert.equal(occursOnDay(rule, WED, new Date(2026, 7, 11)), false);
});

test('endDate stops the series', () => {
  const rule = { frequency: 'daily', endDate: new Date(2026, 7, 13) };
  assert.equal(occursOnDay(rule, WED, THU), true, 'on the end date itself');
  assert.equal(occursOnDay(rule, WED, FRI), false, 'after it');
});

test('occurrence count bounds the series', () => {
  // 3 daily occurrences: the 12th, 13th, 14th.
  const rule = { frequency: 'daily', occurrence: 3 };
  assert.equal(occursOnDay(rule, WED, FRI), true);
  assert.equal(occursOnDay(rule, WED, new Date(2026, 7, 20)), false);
});

test('monthly, by anchor day and by explicit days', () => {
  const byAnchor = { frequency: 'monthly' };
  assert.equal(occursOnDay(byAnchor, WED, new Date(2026, 8, 12)), true);
  assert.equal(occursOnDay(byAnchor, WED, new Date(2026, 8, 13)), false);

  const byDays = { frequency: 'monthly', daysOfTheMonth: [1, 15] };
  assert.equal(occursOnDay(byDays, WED, new Date(2026, 8, 15)), true);
  assert.equal(occursOnDay(byDays, WED, new Date(2026, 8, 16)), false);
});

test('yearly', () => {
  const rule = { frequency: 'yearly' };
  assert.equal(occursOnDay(rule, WED, new Date(2027, 7, 12)), true);
  assert.equal(occursOnDay(rule, WED, new Date(2027, 7, 13)), false);
});

test('a malformed or unknown rule NEVER fires', () => {
  // Falling through to "every day" would turn one bad reminder into a daily
  // notification, which is the loudest possible way to be wrong.
  for (const bad of [
    null,
    undefined,
    {},
    { frequency: 'fortnightly' },
    { frequency: 'hourly' },
  ]) {
    assert.equal(occursOnDay(bad, WED, THU), false, `${JSON.stringify(bad)} must not fire`);
  }
});

test('an interval of 0 or negative is treated as 1, not a division trap', () => {
  for (const interval of [0, -2, 1.5, NaN]) {
    assert.equal(occursOnDay({ frequency: 'daily', interval }, WED, THU), true);
  }
});

test('an invalid anchor or day is not an occurrence', () => {
  assert.equal(occursOnDay({ frequency: 'daily' }, new Date('nope'), THU), false);
  assert.equal(occursOnDay({ frequency: 'daily' }, WED, new Date('nope')), false);
});

// ── Window expansion ─────────────────────────────────────────────────

test('expanding a weekday rule over two weeks yields exactly the weekdays', () => {
  const days = occurrencesInWindow(
    { frequency: 'weekly', daysOfTheWeek: WEEKDAYS },
    WED,
    WED,
    new Date(2026, 7, 25),
  );
  // 12,13,14 then 17-21 then 24,25 = 10 weekdays
  assert.equal(days.length, 10);
  for (const d of days) assert.ok(d.getDay() >= 1 && d.getDay() <= 5);
});

test('a single-day window returns at most one occurrence', () => {
  const days = occurrencesInWindow({ frequency: 'daily' }, WED, THU, THU);
  assert.equal(days.length, 1);
  assert.equal(days[0].getDate(), 13);
});

test('expansion is capped so a long window cannot melt the screen', () => {
  // The Appointments screen asks for ±1 year. A daily reminder would otherwise
  // produce a row for every day of it.
  const days = occurrencesInWindow(
    { frequency: 'daily' },
    new Date(2020, 0, 1),
    new Date(2020, 0, 1),
    new Date(2030, 0, 1),
  );
  assert.ok(days.length <= MAX_OCCURRENCES, `expected <= ${MAX_OCCURRENCES}, got ${days.length}`);
});

test('a window entirely before the series start yields nothing', () => {
  const days = occurrencesInWindow(
    { frequency: 'daily' },
    WED,
    new Date(2026, 6, 1),
    new Date(2026, 6, 31),
  );
  assert.deepEqual(days, []);
});
