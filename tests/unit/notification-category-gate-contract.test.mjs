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

// ── Health alerts get their own switch (2026-08-12) ──────────────────

test('vitals rechecks are gated by their OWN category, not a borrowed one', () => {
  // Not `otherTask`: it is the only category that defaults OFF, so borrowing
  // it would silence the most clinically urgent alert we send for every
  // patient who never opens the screen.
  // Not `nudges`: that promises "AI-informed prompts"; these are rule-based.
  const VITALS = read('services/vitals-recheck-notifications.ts');
  assert.match(codeOnly(VITALS), /healthAlertsEnabled\?: boolean/);
  assert.match(codeOnly(VITALS), /if \(healthAlertsEnabled === false\)/);
});

test('turning Health alerts off CANCELS what is already queued', () => {
  // Merely not scheduling more would leave existing alerts firing for their
  // full cooldown window — the same trap as the plan-task cache guard.
  const VITALS = read('services/vitals-recheck-notifications.ts');
  const code = codeOnly(VITALS);
  assert.match(code, /async function cancelAllVitalsScheduled/);
  const branch = code.slice(code.indexOf('if (healthAlertsEnabled === false)'));
  assert.match(branch.slice(0, 300), /cancelAllVitalsScheduled\(\)/);
});

test('cancellation is TAG-SCOPED so it cannot touch other schedulers', () => {
  // plan-task and calendar reminders share the same iOS queue.
  const VITALS = read('services/vitals-recheck-notifications.ts');
  const fn = codeOnly(VITALS).slice(codeOnly(VITALS).indexOf('async function cancelAllVitalsScheduled'));
  assert.match(fn.slice(0, 600), /if \(tag !== TAG\) continue/);
});

test('health alerts FAIL OPEN — only an explicit false suppresses', () => {
  const VITALS = read('services/vitals-recheck-notifications.ts');
  assert.doesNotMatch(
    codeOnly(VITALS),
    /if \(!healthAlertsEnabled\)/,
    'must test === false, or a loading prefs query would silence a BP alert',
  );
});

test('the hook reads the pref and re-runs when it changes', () => {
  const HOOK2 = read('hooks/use-vitals-red-flag-notifications.ts');
  assert.match(HOOK2, /preferences\?\.healthAlerts/);
  // Assert healthAlertsEnabled is IN the dependency array, rather than pinning
  // the array's exact contents.
  //
  // This used to read /\}, \[trends, disabled, healthAlertsEnabled\]\)/, which
  // says more than the test's own name claims: it failed on any legitimate
  // dependency addition. SCRUM-715 added `enabled` (the entitlement gate) and
  // tripped it, even though the pref is still read and still a dependency.
  // The contract being defended is "the effect re-runs when the pref changes";
  // that is exactly what this now checks, and nothing more.
  const deps = /\}, \[([^\]]*)\]\)/.exec(HOOK2);
  assert.ok(deps, 'expected a useEffect dependency array in the hook');
  const names = deps[1].split(',').map((s) => s.trim());
  assert.ok(
    names.includes('healthAlertsEnabled'),
    `healthAlertsEnabled must be a dependency so the effect re-runs when the pref changes; found [${names.join(', ')}]`,
  );
});

test('the category exists on every surface, or the type system lied', () => {
  // Record<NotificationCategory, ...> is exhaustive, so a missing entry is a
  // compile error — but the SETTINGS ROW is what the patient actually needs.
  assert.match(read('lib/notification-categories.ts'), /healthAlerts: true/);
  assert.match(read('app/Home/reminder-settings.tsx'), /title: 'Health alerts'/);
});

// ── Schedulers no longer cancel each other's work (2026-08-14) ───────

test('the calendar reconcile cancels ONLY its own tags', () => {
  // It used to cancel any tag starting with `csh-`, which was deliberate
  // (build 30: stale csh-test schedules ate the 64-notification cap) and had
  // a consequence nobody noticed: csh-plan-task-v1 and csh-vitals-recheck-v1
  // start with `csh-` too. Every mount of the Appointments screen silently
  // deleted the patient's plan-task reminders AND their vitals alerts.
  const CAL = read('services/calendar-notifications.ts');
  const code = codeOnly(CAL);
  assert.match(code, /OWNED_TAG_PREFIXES = \['csh-calendar', 'csh-test'\]/);
  assert.match(code, /if \(!ownsTag\(tag\)\) continue/);
  // Scoped to the AUTOMATIC reconcile only. clearAllAppNotifications keeps the
  // broad `csh-` match on purpose: it is a user-tapped "reset stuck queues"
  // diagnostic in calendar-settings, where wiping everything is the point.
  // The bug was an automatic path doing it silently on every screen mount.
  const auto = code.slice(
    code.indexOf('async function cancelAllAppScheduled'),
    code.indexOf('export async function clearAllAppNotifications'),
  );
  assert.ok(auto.length > 0, 'cancelAllAppScheduled must precede the manual wipe');
  assert.doesNotMatch(
    auto,
    /startsWith\('csh-'\)/,
    'the automatic reconcile must not reach into the other schedulers',
  );
});

test('the MANUAL reset button may still wipe everything', () => {
  // Deliberate, and worth pinning so nobody "fixes" it into uselessness: the
  // patient taps it precisely because the queue is stuck.
  const CAL = read('services/calendar-notifications.ts');
  const manual = codeOnly(CAL).slice(codeOnly(CAL).indexOf('export async function clearAllAppNotifications'));
  assert.match(manual, /startsWith\('csh-'\)/);
});

test('the owned prefixes cannot match the other schedulers', () => {
  // Executable rather than asserted in a comment: prove the real tags are
  // excluded, so renaming a prefix cannot silently re-break this.
  const OWNED = ['csh-calendar', 'csh-test'];
  const owns = (t) => OWNED.some((p) => t.startsWith(p));
  assert.equal(owns('csh-calendar-v1'), true);
  assert.equal(owns('csh-test-diagnostic'), true);
  assert.equal(owns('csh-plan-task-v1'), false, 'must not cancel plan tasks');
  assert.equal(owns('csh-vitals-recheck-v1'), false, 'must not cancel vitals alerts');
});

test('turning Health alerts off cancels the vitals queue from the TOGGLE', () => {
  // The 2026-08-12 fix routed this only through use-vitals-red-flag-
  // notifications, which sits behind two early returns and is mounted on one
  // screen — so the cancel never ran if Apple Health was off.
  const code = codeOnly(HOOK);
  assert.match(code, /updated\.preferences\.healthAlerts === false/);
  assert.match(code, /cancelAllVitalsScheduled\(\)/);
});
