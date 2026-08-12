/**
 * Undated reminders reach the app — 2026-08-12.
 *
 * Vishal: "in my app i have 2 reminders without any expiry date but in csh app
 * i don't see them."
 *
 * They were dropped in readReminders by `if (!due) continue`. The reason was
 * honest when it was written — a reminder with no due date has nothing to
 * anchor on a CALENDAR — but it expired the moment Today's Schedule gained an
 * "Anytime today" bucket, which is exactly where an open undated to-do belongs.
 *
 * The production data made the cost visible: 1,211 reminder rows across the
 * fleet, but only ONE on Vishal's own account, against 787 device events. The
 * pipeline was working; it was discarding most of what it read.
 *
 * These are source-reading assertions (the module needs expo-calendar's native
 * bridge, so it cannot be imported under node --test). Every negative runs
 * through codeOnly() — comment-matching has produced false passes in this repo
 * repeatedly, and one of the backend guards was found to have that exact bug.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAL = readFileSync(join(ROOT, 'services/calendar.ts'), 'utf8');
const SYNC = readFileSync(join(ROOT, 'services/calendar-sync.ts'), 'utf8');
const SCREEN = readFileSync(join(ROOT, 'app/Home/today-schedule.tsx'), 'utf8');

const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('THE ACTUAL BUG: undated reminders need their own null-status query', () => {
  // Round 1 filtered for undated reminders in JS and shipped, and nothing
  // changed — because the OS never returned them in the first place.
  //
  // expo-calendar maps a non-null status to EventKit's date-ranged predicate
  // (node_modules/expo-calendar/ios/CalendarModule.swift:612):
  //     predicateForIncompleteReminders(withDueDateStarting:ending:calendars:)
  // and Apple excludes reminders with NO due date from it — there is no date
  // for the range to match. Only a nil status maps to
  //     predicateForReminders(in: calendars)
  // which returns every reminder regardless of due date.
  //
  // So the null-status call is the fix. Without it every other assertion in
  // this file passes while the feature does nothing.
  const code = codeOnly(CAL);
  assert.match(
    code,
    /Calendar\.getRemindersAsync\(calendarIds, null, null, null\)/,
    'must query with null status AND null dates, or iOS returns no undated reminders',
  );
});

test('the undated query cannot cost us the dated reminders', () => {
  // It runs after the dated queries have already succeeded, in its own
  // try/catch, so a failure there leaves `raw` intact.
  const code = codeOnly(CAL);
  const idx = code.indexOf('getReminders:undated');
  assert.ok(idx > code.indexOf('raw = [...incomplete, ...completed]'), 'must run after');
  const block = code.slice(idx - 400, idx + 700);
  assert.match(block, /try \{/);
  assert.match(block, /catch \{/);
});

test('the undated query keeps only undated, incomplete rows', () => {
  // predicateForReminders(in:) returns EVERYTHING, including reminders the
  // dated queries already returned. Without these two filters they would be
  // duplicated onto the timeline.
  const code = codeOnly(CAL);
  const block = code.slice(code.indexOf('getReminders:undated'));
  assert.match(block, /if \(r\.dueDate \?\? r\.startDate\) continue/);
  assert.match(block, /if \(r\.completed\) continue/);
});

test('an undated reminder is no longer discarded outright', () => {
  const code = codeOnly(CAL);
  // The old behaviour was a bare `if (!due) continue` with nothing before it.
  assert.match(code, /if \(!due\) \{/, 'undated reminders must be handled, not skipped');
  assert.match(code, /undated: true/);
});

test('it is anchored to TODAY, not to windowStart', () => {
  // Anchoring to the window would file it a year in the past on the ±1-year
  // Appointments window. An undated reminder is outstanding NOW.
  const code = codeOnly(CAL);
  assert.match(code, /today < windowStart \|\| today > windowEnd/);
});

test('anchored at local NOON, because the app keys days two different ways', () => {
  // Reported 2026-08-12: "home screen i can see reminder ... but there is no
  // reminder in calendar."
  //
  //   Home (index.tsx)            compares the LOCAL date
  //   calendar (appointments:182) compares startDate.slice(0,10) — the UTC date
  //
  // At local MIDNIGHT those disagree for every timezone east of UTC, so the
  // row appeared on Home and vanished from the calendar. Noon is the same
  // calendar day under both readings from UTC-12 to UTC+12.
  const code = codeOnly(CAL);
  assert.match(code, /today\.setHours\(12, 0, 0, 0\)/);
  assert.doesNotMatch(
    code,
    /today\.setHours\(0, 0, 0, 0\)/,
    'midnight breaks the calendar screen east of UTC',
  );
});

test('noon satisfies BOTH day-key conventions across real offsets', () => {
  // Executable proof rather than a claim in a comment. Mirrors the two
  // conventions exactly: UTC via toISOString().slice(0,10), local via
  // getFullYear/getMonth/getDate.
  const check = (offsetHours, anchorHour) => {
    const nowUtc = new Date('2026-08-12T09:00:00.000Z');
    const local = new Date(nowUtc.getTime() + offsetHours * 3600e3);
    const anchorLocal = Date.UTC(
      local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), anchorHour,
    );
    const instant = new Date(anchorLocal - offsetHours * 3600e3);
    const utcKey = instant.toISOString().slice(0, 10);
    const localKey = new Date(instant.getTime() + offsetHours * 3600e3)
      .toISOString().slice(0, 10);
    const todayLocal = local.toISOString().slice(0, 10);
    return utcKey === todayLocal && localKey === todayLocal;
  };
  for (const off of [-11, -8, -5, 0, 1, 5.5, 8, 9, 12]) {
    assert.equal(check(off, 12), true, `noon must work at UTC${off >= 0 ? '+' : ''}${off}`);
  }
  // And demonstrate the bug this replaced, so the reasoning cannot rot.
  assert.equal(check(5.5, 0), false, 'midnight is expected to FAIL east of UTC');
  assert.equal(check(-8, 0), true, 'midnight only ever worked west of UTC');
});

test('allDay is set, which is what routes it to "Anytime today"', () => {
  // The timeline maps allDay → time:null → the anytime bucket. Without this
  // the reminder would claim midnight and sit at the top of the day.
  const block = CAL.slice(CAL.indexOf('if (!due) {'), CAL.indexOf('const dueIso'));
  assert.match(block, /allDay: true/);
});

test('a COMPLETED undated reminder is skipped', () => {
  // A completed DATED reminder ages out of the window by itself. An undated
  // one never would — it would sit struck-through on "today" forever.
  const block = CAL.slice(CAL.indexOf('if (!due) {'), CAL.indexOf('const dueIso'));
  assert.match(block, /if \(r\.completed\) continue/);
});

test('DATED reminders are untouched by this change', () => {
  // The regression risk: breaking the existing timed-reminder path, which
  // carries Ken's "medication at 9 AM" behaviour from build 46.
  const code = codeOnly(CAL);
  assert.match(code, /const hasTimeComponent =/);
  assert.match(code, /const isAllDay = hasTimeComponent \? false : looksLikeAllDay/);
});

test('the snapshot uploader does NOT persist undated reminders', () => {
  // They are timeless and snapshot rows are date-keyed. Persisting one would
  // stamp it with whatever day the sync ran and re-upload it daily as that
  // stamp drifted. Device-local + always-today ⇒ the live read covers it.
  assert.match(codeOnly(SYNC), /includeUndated: false/);
});

test('the default is INCLUDE — the live read is the one that matters', () => {
  assert.match(codeOnly(CAL), /opts\.includeUndated \?\? true/);
});

test('the schedule says why the row has no hour', () => {
  assert.match(SCREEN, /r\.undated \? 'No due date' : undefined/);
});
