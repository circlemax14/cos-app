/**
 * COS-871 — reminders must arrive in the patient's own morning.
 *
 * Ken, in the US, was getting notifications on India time. Neither, in fact —
 * on UTC. healthPlanReminders fires three fixed EventBridge crons (09:00 /
 * 13:00 / 19:00 UTC) and serverless.yml says "UTC for v1; per-user timezone
 * scheduling is a Phase 2 follow-up". 09:00 UTC is 04:00 in New York.
 *
 * Phase 2 was built and deployed — the tzReminders sweeper, the PUT endpoint,
 * and the `if (item.timezone) continue;` handoff in
 * health-plan-reminders.service.ts. Nothing in the app ever sent the value, so
 * every user took the legacy UTC path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const HOOK = read('hooks/use-timezone-sync.ts');
const LAYOUT = read('app/_layout.tsx');

test('THE POINT: the app sends its IANA timezone to the endpoint that exists', () => {
  assert.match(HOOK, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(HOOK, /'\/v1\/patients\/me\/notification-prefs\/timezone'/);
  assert.match(LAYOUT, /useTimezoneSync\(\)/, 'must be mounted at the root layout');
});

test('THE POINT: it re-sends on foreground — a traveller changes zone without restarting', () => {
  assert.match(HOOK, /AppState\.addEventListener\('change'/);
  assert.match(HOOK, /s === 'active'/);
});

test('it does not PUT on every foreground, only when the zone actually changed', () => {
  // Otherwise every app-switch is a network request for a value that is the
  // same 364 days a year.
  assert.match(HOOK, /tz === lastSent\.current/);
});

test('it never fires while signed out, and never surfaces a failure', () => {
  // An unauthenticated PUT 401s on every foreground; and a failed timezone
  // write must not block or interrupt a patient — the backend just keeps them
  // on the legacy path until the next attempt.
  assert.match(HOOK, /hasStoredSession\(\)/);
  assert.match(HOOK, /catch \{/);
});

test('the backend half it depends on is still there', () => {
  const svc = read('../cos-backend/src/services/health-plan-reminders.service.ts');
  assert.match(svc, /if \(item\.timezone\) continue;/,
    'the legacy sweeper must keep handing tz-set users to the tz sweeper');
  const yml = read('../cos-backend/serverless.yml');
  assert.match(yml, /tzReminders:/, 'the per-user-TZ sweeper must stay scheduled');
});
