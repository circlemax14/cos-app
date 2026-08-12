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
  assert.match(code, /today\.setHours\(0, 0, 0, 0\)/);
  assert.match(code, /today < windowStart \|\| today > windowEnd/);
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
