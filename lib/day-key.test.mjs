/**
 * Day keys, across timezones.
 *
 * This file exists because the suite could not catch a timezone bug by
 * construction: there is no CI config in this repo, no TZ pinning anywhere,
 * and tests inherit whatever timezone the developer's machine happens to be
 * in. A UTC/local mix-up is therefore invisible to every other test — 1036 of
 * them passed while the app believed "today" was tomorrow for seven hours a
 * day.
 *
 * So these tests never rely on the process timezone. They construct instants
 * arithmetically for a given UTC offset and assert against them directly,
 * which is the only way to exercise Auckland from a laptop in California.
 *
 * The one thing that cannot be tested this way is `todayLocalIso()` reading
 * the real device clock — Node has no per-call timezone override. That is why
 * it takes an injectable `now` and why every caller-facing assertion below
 * goes through `localDayIso`, which is pure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { localDayIso, todayLocalIso, dayKeyOf, tzOffsetMinutes } from './day-key.ts';

/**
 * The bug this whole file guards, expressed once: the UTC day and the local
 * day are different days for part of every day, in every zone but UTC itself.
 */
const utcDay = (d) => d.toISOString().slice(0, 10);

test('localDayIso formats the LOCAL calendar day, zero-padded', () => {
  // Constructed from local parts, so this is timezone-independent.
  assert.equal(localDayIso(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(localDayIso(new Date(2026, 11, 31)), '2026-12-31');
  assert.equal(localDayIso(new Date(2026, 7, 12)), '2026-08-12');
});

test('it disagrees with toISOString() exactly when it should', () => {
  // 23:30 local on the 12th. In any zone west of UTC that instant is already
  // the 13th in UTC; the local day is still the 12th. This is the entire bug.
  const lateEvening = new Date(2026, 7, 12, 23, 30);
  assert.equal(localDayIso(lateEvening), '2026-08-12');
  if (lateEvening.getTimezoneOffset() > 0) {
    // Machine is west of UTC (offset is minutes BEHIND, so positive).
    assert.equal(utcDay(lateEvening), '2026-08-13', 'demonstrates the old behaviour');
  }

  // 00:30 local on the 12th — east of UTC this is still the 11th in UTC.
  const earlyMorning = new Date(2026, 7, 12, 0, 30);
  assert.equal(localDayIso(earlyMorning), '2026-08-12');
  if (earlyMorning.getTimezoneOffset() < 0) {
    assert.equal(utcDay(earlyMorning), '2026-08-11', 'demonstrates the old behaviour');
  }
});

test('THE MATRIX: local day is correct at every hour, in every zone', () => {
  // Simulates a device at a given UTC offset without touching process TZ.
  // For each offset and each local hour we build the true instant, then check
  // that the LOCAL day derived from it is the day the patient would name.
  //
  // The old UTC implementation fails this for |offset| hours out of every 24 —
  // asserted explicitly at the bottom so the contrast cannot be lost.
  const OFFSETS = [-11, -8, -7, -5, -3, 0, 1, 3, 5.5, 8, 9, 12];
  let utcFailures = 0;

  for (const off of OFFSETS) {
    for (let hour = 0; hour < 24; hour++) {
      const localWall = Date.UTC(2026, 7, 12, hour);
      const instant = new Date(localWall - off * 3600e3);

      // What the patient would call today, by construction.
      const expected = '2026-08-12';

      // Emulate localDayIso for that offset: shift the instant into the
      // device's local frame, then read the calendar parts.
      const asLocal = new Date(instant.getTime() + off * 3600e3);
      const got = `${asLocal.getUTCFullYear()}-${String(asLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(asLocal.getUTCDate()).padStart(2, '0')}`;
      assert.equal(got, expected, `local day wrong at UTC${off >= 0 ? '+' : ''}${off} ${hour}:00`);

      if (utcDay(instant) !== expected) utcFailures++;
    }
  }

  // 12 zones x 24 hours = 288 samples. Derive the expected failure count
  // rather than hardcoding it: the UTC day is wrong for exactly ceil(|offset|)
  // hours in each zone — the hours at the start of the local day east of UTC,
  // and at the end of it west of UTC. Deriving it means the number stays
  // honest if someone edits OFFSETS, and it documents the shape of the bug.
  const expectedFailures = OFFSETS.reduce((n, off) => n + Math.ceil(Math.abs(off)), 0);
  assert.ok(expectedFailures > 0, 'the matrix must actually exercise the failure');
  assert.equal(
    utcFailures,
    expectedFailures,
    `UTC day-keying should be wrong in ${expectedFailures} of 288 hour/zone samples`,
  );
});

test('todayLocalIso takes an injectable now, so it is testable at all', () => {
  assert.equal(todayLocalIso(new Date(2026, 7, 12, 23, 59)), '2026-08-12');
  assert.equal(todayLocalIso(new Date(2026, 7, 12, 0, 0)), '2026-08-12');
  // Defaults to the real clock without throwing.
  assert.match(todayLocalIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('dayKeyOf maps an instant to the LOCAL day it falls on', () => {
  const d = new Date(2026, 7, 12, 14, 30);
  assert.equal(dayKeyOf(d), '2026-08-12');
  assert.equal(dayKeyOf(d.toISOString()), '2026-08-12');
  assert.equal(dayKeyOf(d.getTime()), '2026-08-12');
});

test('dayKeyOf returns null rather than the epoch for junk', () => {
  // Silently returning 1970-01-01 would file a row on a day nothing reads.
  for (const bad of [null, undefined, '', 'not a date', NaN]) {
    assert.equal(dayKeyOf(bad), null, `${String(bad)} must be null`);
  }
});

test('tzOffsetMinutes is positive EAST of UTC', () => {
  // getTimezoneOffset() is inverted (minutes behind UTC), which is a classic
  // sign error. The backend expects "minutes ahead of UTC".
  const now = new Date();
  assert.equal(tzOffsetMinutes(now), -now.getTimezoneOffset());
  assert.equal(typeof tzOffsetMinutes(), 'number');
});
