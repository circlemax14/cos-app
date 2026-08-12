/**
 * Turning a notification category off actually stops the notifications.
 *
 * Reported 2026-08-12: "i disabled all reminders for my user
 * gvtechsolutions21@gmail.com but still i am recieving task notifications."
 *
 * Their stored prefs had all seven categories `false` and all three digest
 * slots `false`, the backend gate flag was `true` in production, and the
 * backend send-chokepoint honours the prefs. The notifications were LOCAL ones
 * already sitting in the iOS queue, from two paths that never cancelled them:
 *
 *   1. the toggle handler only reconciled when today's tasks happened to be in
 *      the react-query cache, so a cold cache meant nothing was cancelled and
 *      everything already scheduled kept firing for up to 7 days
 *   2. calendar-notifications consulted the per-CALENDAR toggles but never the
 *      per-CATEGORY ones, so "Appointments" and "Reminders" were promises
 *      nothing kept
 *
 * Both are the same shape as the "Routine reminders" bug fixed earlier today: a
 * switch the patient can see, wired to nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HOOK = read('hooks/use-notification-categories.ts');
const CAL_NOTIF = read('services/calendar-notifications.ts');
const APPTS = read('app/Home/appointments.tsx');
const PLAN_NOTIF = read('services/plan-task-notifications.ts');

const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('toggling a category reconciles even with NO cached tasks', () => {
  // The bug: `if (cached && cached.length > 0)` made cancellation depend on
  // today's tasks being in the query cache. Open settings on a cold cache and
  // nothing was cancelled.
  const code = codeOnly(HOOK);
  assert.match(code, /reconcilePlanTaskNotifications\(cached \?\? \[\], gate\)/);
  assert.doesNotMatch(
    code,
    /if \(cached && cached\.length > 0\)/,
    'cancellation must not depend on a cache hit',
  );
});

test('an empty task list means CANCEL, which is why passing [] is safe', () => {
  // reconcile cancels before it schedules, so [] cancels everything and
  // schedules nothing. If that order ever inverted, passing [] would become a
  // no-op and this bug would return silently.
  const code = codeOnly(PLAN_NOTIF);
  const fn = code.slice(code.indexOf('export async function reconcilePlanTaskNotifications'));
  const cancelAt = fn.indexOf('cancelAllPlanTaskScheduled');
  const scheduleAt = fn.indexOf('scheduleNotificationAsync');
  assert.ok(cancelAt > -1 && scheduleAt > -1, 'both steps must exist');
  assert.ok(cancelAt < scheduleAt, 'cancel must happen BEFORE scheduling');
});

test('calendar notifications are gated by the category prefs at all', () => {
  // Previously ungated: it consulted per-calendar toggles and never the
  // per-category ones.
  const code = codeOnly(CAL_NOTIF);
  assert.match(code, /categoryPrefs\?: \{ appointments\?: boolean; reminders\?: boolean \}/);
  assert.match(code, /categoryPrefs\?\.reminders === false/);
  assert.match(code, /categoryPrefs\?\.appointments === false/);
});

test('iOS Reminders map to "Reminders", everything else to "Appointments"', () => {
  // Following the labels the patient actually reads in the settings screen.
  const code = codeOnly(CAL_NOTIF);
  assert.match(code, /if \(event\.origin === 'reminder'\) \{[\s\S]{0,120}categoryPrefs\?\.reminders === false/);
});

test('the gate FAILS OPEN — absent prefs never suppress', () => {
  // Matches the backend chokepoint's stance: a prefs read failure must not
  // silently swallow a medication reminder. Only an explicit false suppresses.
  const code = codeOnly(CAL_NOTIF);
  assert.doesNotMatch(code, /categoryPrefs\?\.reminders\s*\)/, 'must test === false, not truthiness');
  assert.match(code, /=== false/);
});

test('the caller passes the prefs, or the gate is dead code', () => {
  assert.match(APPTS, /useNotificationCategories\(\)/);
  assert.match(APPTS, /notifCategories\?\.preferences/);
});

test('the calendar reconcile is no longer gated on having events', () => {
  // Same trap as the cache guard: `events.length > 0` would leave already
  // queued notifications firing after the last event was removed.
  const code = codeOnly(APPTS);
  assert.doesNotMatch(
    code,
    /permissions\.state\.granted && events\.length > 0/,
    'must reconcile even with no events, so cancellation always runs',
  );
});
