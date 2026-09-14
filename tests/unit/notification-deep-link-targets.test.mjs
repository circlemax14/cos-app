/**
 * COS-947 — every notification the backend sends must resolve to a real screen.
 *
 * Vishal tapped a help-and-support notification and landed on Home. Making
 * sign-in replay the deferred route was necessary and NOT sufficient:
 * SUPPORT_TICKET_STATUS had no case at all, so the tap resolved to null, which
 * use-notifications turns into '/Home' BEFORE the queue ever sees it. The queue
 * then replayed /Home perfectly. The fix would have looked broken while working.
 *
 * These tests therefore assert two different things, and the second is the one
 * that would have caught the original bug:
 *   1. the routing table maps the types the backend actually sends
 *   2. every route it returns EXISTS as a file under app/
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../../lib/notification-routing.ts', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('THE POINT: SUPPORT_TICKET_STATUS routes to the ticket, not to Home', () => {
  assert.match(code, /case 'SUPPORT_TICKET_STATUS'/);
  assert.match(code, /support-ticket-detail\?ticketId=/);
  // Falls back to the list when the id is missing — Support beats Home.
  assert.match(code, /'\/Home\/support'/);
});

test('the id is URL-encoded — a ticket id is server data, not a literal', () => {
  assert.match(code, /encodeURIComponent\(ticketId\)/);
});

test('the other four senders that were silently reaching Home are mapped', () => {
  for (const t of ['TASK_REMINDER', 'HABIT_REMINDER', 'HEALTH_SUMMARY_READY', 'NUDGE']) {
    assert.match(code, new RegExp(`case '${t}'`), `${t} must be routed`);
  }
});

test('THE POINT: every route the table returns exists as a file under app/', () => {
  /*
   * The check the original bug needed. A returned path that no file serves is a
   * dead tap, and nothing else in the codebase notices — expo-router just drops
   * the route and the user lands wherever the fallback sends them.
   */
  const appDir = new URL('../../app/', import.meta.url);
  const paths = [...code.matchAll(/return\s+`?'?(\/Home\/[A-Za-z0-9-]+)/g)].map((m) => m[1]);
  assert.ok(paths.length >= 8, `expected several routes, found ${paths.length}`);

  const missing = paths.filter((p) => {
    const name = p.replace('/Home/', '');
    return !existsSync(new URL(`Home/${name}.tsx`, appDir))
      && !existsSync(new URL(`Home/${name}/index.tsx`, appDir));
  });
  assert.deepEqual(missing, [], `notification targets with no screen: ${missing.join(', ')}`);
});

test('THE POINT: no file under app/ lacks a default export', () => {
  /*
   * app/Home/integrative-screen.tsx had none — 800 lines exporting only a named
   * function. Every file under app/ is a route, so it was a permanently broken
   * deep-link target that threw "Element type is invalid" in production. Moved
   * to components/. This pins the whole tree so the next one is caught.
   */
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const child = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, dir);
    if (e.isDirectory()) return walk(child);
    return e.name.endsWith('.tsx') ? [child] : [];
  });

  const offenders = walk(new URL('../../app/', import.meta.url))
    .filter((f) => {
      const t = readFileSync(f, 'utf8');
      return !/export\s+default/.test(t) && !/export\s*\{[^}]*default/.test(t);
    })
    .map((f) => f.pathname.split('/app/')[1]);

  assert.deepEqual(offenders, [], `route files with no default export: ${offenders.join(', ')}`);
});
