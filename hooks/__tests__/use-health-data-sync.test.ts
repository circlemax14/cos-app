/**
 * ADR-0004 P1 (2026-07-30): unit tests for the pure logic backing
 * `useHealthDataSync` — the `isLabsRealtimeEnabled` flag parser, the
 * `isHealthDataChanged` payload type guard, the invalidation query-key
 * surface, and the `invalidateHealthDataQueries` helper.
 *
 * IMPORT STRATEGY
 * ---------------
 * Same discipline as `use-biopsychosocial-plan.test.ts`: the hook
 * module (`hooks/use-health-data-sync.ts`) transitively pulls in
 * `react`, `react-native`, `@tanstack/react-query`, and expo-secure-
 * store via `@/lib/auth-tokens` — none of which resolve under
 * `node --test` in the current toolchain (no jsdom / RN shim /
 * renderHook harness / TS-path-alias resolver).
 *
 * We therefore import the PURE surface from `lib/health-data-sync.ts`
 * (a React-import-free file — same shape as `lib/bio-regeneration.ts`
 * relative to `use-biopsychosocial-plan.ts`). The hook re-exports the
 * same symbols so runtime callers see them at their canonical
 * `@/hooks/use-health-data-sync` path.
 *
 * The React state / setInterval / WebSocket / AppState wiring stays
 * unreachable under node:test — it's pinned by the source-drift
 * trip-wires at the bottom of this file (static-text regex checks
 * against the hook file itself). "Two angles, one contract" — the
 * same pattern SCRUM-651 uses.
 *
 * If a React-hook renderer is added to the repo later (e.g.
 * `renderHook` from @testing-library/react-native), extend this file
 * with real hook renders exercising the WSS lifecycle, AppState
 * transitions, and reconnect backoff — and drop the trip-wires those
 * renders subsume.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM under `node --test`: __dirname isn't defined. Recompute it from
// import.meta.url so the trip-wire block below can read the sibling
// hook file regardless of how the test is invoked (npm test, direct
// node --test, or an IDE runner).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  HEALTH_DATA_QUERY_KEYS,
  invalidateHealthDataQueries,
  isHealthDataChanged,
  isLabsRealtimeEnabled,
} from '../../lib/health-data-sync.ts';

// ─── isLabsRealtimeEnabled — strict truthiness ──────────────────────────
//
// The flag MUST be the literal string 'true' after lowercase+trim.
// Anything else (undefined, 'false', '1', 'yes', 'TRUE ' with a stray
// space, empty string) is OFF. Locking this here so a well-meaning
// refactor to `Boolean(process.env.FOO)` or `!!process.env.FOO`
// doesn't silently flip labs realtime on for every stage that sets
// the var to any non-empty value.

test('isLabsRealtimeEnabled: false when env var is unset (undefined)', () => {
  const prev = process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  delete process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  try {
    assert.equal(isLabsRealtimeEnabled(), false);
  } finally {
    if (prev !== undefined) process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = prev;
  }
});

test('isLabsRealtimeEnabled: false when env var is empty string', () => {
  const prev = process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = '';
  try {
    assert.equal(isLabsRealtimeEnabled(), false);
  } finally {
    if (prev !== undefined) process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = prev;
    else delete process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  }
});

test('isLabsRealtimeEnabled: true when env var is the literal string "true"', () => {
  const prev = process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = 'true';
  try {
    assert.equal(isLabsRealtimeEnabled(), true);
  } finally {
    if (prev !== undefined) process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = prev;
    else delete process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  }
});

test('isLabsRealtimeEnabled: true when env var is "TRUE" (case-insensitive)', () => {
  const prev = process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = 'TRUE';
  try {
    assert.equal(isLabsRealtimeEnabled(), true);
  } finally {
    if (prev !== undefined) process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = prev;
    else delete process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  }
});

test('isLabsRealtimeEnabled: true when env var is " true " (whitespace-tolerant)', () => {
  const prev = process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = ' true ';
  try {
    assert.equal(isLabsRealtimeEnabled(), true);
  } finally {
    if (prev !== undefined) process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = prev;
    else delete process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  }
});

test('isLabsRealtimeEnabled: false for "1", "yes", "on" — strict "true" only', () => {
  const prev = process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  try {
    for (const val of ['1', 'yes', 'on', 'enabled', 'y']) {
      process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = val;
      assert.equal(
        isLabsRealtimeEnabled(),
        false,
        `expected ${JSON.stringify(val)} to be OFF`,
      );
    }
  } finally {
    if (prev !== undefined) process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = prev;
    else delete process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  }
});

test('isLabsRealtimeEnabled: false for "false"', () => {
  const prev = process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = 'false';
  try {
    assert.equal(isLabsRealtimeEnabled(), false);
  } finally {
    if (prev !== undefined) process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED = prev;
    else delete process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED;
  }
});

// ─── isHealthDataChanged — WSS payload type guard ───────────────────────

test('isHealthDataChanged: true for {type:"HEALTH_DATA_CHANGED", kinds:[]}', () => {
  assert.equal(
    isHealthDataChanged({ type: 'HEALTH_DATA_CHANGED', kinds: [] }),
    true,
  );
});

test('isHealthDataChanged: true for {type:"HEALTH_DATA_CHANGED", kinds:["lab","vaccine"]}', () => {
  assert.equal(
    isHealthDataChanged({
      type: 'HEALTH_DATA_CHANGED',
      kinds: ['lab', 'vaccine'],
    }),
    true,
  );
});

test('isHealthDataChanged: false for wrong type', () => {
  assert.equal(
    isHealthDataChanged({ type: 'ENTITLEMENTS_CHANGED', kinds: ['lab'] }),
    false,
  );
});

test('isHealthDataChanged: false when kinds is missing', () => {
  assert.equal(isHealthDataChanged({ type: 'HEALTH_DATA_CHANGED' }), false);
});

test('isHealthDataChanged: false when kinds is not an array (string)', () => {
  assert.equal(
    isHealthDataChanged({ type: 'HEALTH_DATA_CHANGED', kinds: 'lab' }),
    false,
  );
});

test('isHealthDataChanged: false when kinds is null', () => {
  assert.equal(
    isHealthDataChanged({ type: 'HEALTH_DATA_CHANGED', kinds: null }),
    false,
  );
});

test('isHealthDataChanged: false when kinds has a non-string element', () => {
  // Guard against a rogue null/number slipping past — the socket
  // handler iterates `kinds` and any consumer that assumes strings
  // (e.g. `kinds.map(k => k.toLowerCase())`) would crash.
  assert.equal(
    isHealthDataChanged({ type: 'HEALTH_DATA_CHANGED', kinds: ['lab', 42] }),
    false,
  );
  assert.equal(
    isHealthDataChanged({ type: 'HEALTH_DATA_CHANGED', kinds: ['lab', null] }),
    false,
  );
});

test('isHealthDataChanged: false for null / undefined / primitives / arrays', () => {
  assert.equal(isHealthDataChanged(null), false);
  assert.equal(isHealthDataChanged(undefined), false);
  assert.equal(isHealthDataChanged('HEALTH_DATA_CHANGED'), false);
  assert.equal(isHealthDataChanged(42), false);
  assert.equal(isHealthDataChanged([]), false);
});

// ─── HEALTH_DATA_QUERY_KEYS — invalidation surface ──────────────────────
//
// PIN the exact set of query-key prefixes so a caller elsewhere that
// starts using ['lab-reports', patientId] doesn't get silently
// stranded on stale data because someone renamed the invalidation
// entry to ['labReports'].

test('HEALTH_DATA_QUERY_KEYS: contains lab-reports, trends, health-summary, plan, lab-panels', () => {
  const flat = HEALTH_DATA_QUERY_KEYS.map((k) => k.join('/'));
  assert.deepEqual(
    [...flat].sort(),
    ['health-summary', 'lab-panels', 'lab-reports', 'plan', 'trends'].sort(),
  );
});

test('HEALTH_DATA_QUERY_KEYS: every entry is a non-empty readonly string[]', () => {
  for (const key of HEALTH_DATA_QUERY_KEYS) {
    assert.ok(Array.isArray(key), 'entry must be an array');
    assert.ok(key.length > 0, 'entry must not be empty (would match ALL queries)');
    for (const seg of key) {
      assert.equal(typeof seg, 'string', 'every segment must be a string');
    }
  }
});

// ─── invalidateHealthDataQueries — dispatch to QueryClient ──────────────

test('invalidateHealthDataQueries: calls qc.invalidateQueries once per key with the correct queryKey', () => {
  const calls: unknown[] = [];
  const fakeQc = {
    invalidateQueries(arg: unknown) {
      calls.push(arg);
      // Return a resolved promise so `void qc.invalidateQueries(...)`
      // doesn't emit an unhandled-rejection warning.
      return Promise.resolve();
    },
  };
  // The helper's parameter type is Pick<QueryClient, 'invalidateQueries'>
  // so the fake — a plain object with just that one method — satisfies
  // it structurally. No cross-package import needed at test time.
  invalidateHealthDataQueries(fakeQc);

  assert.equal(calls.length, HEALTH_DATA_QUERY_KEYS.length);
  const seen = calls.map((c) => (c as { queryKey: string[] }).queryKey.join('/')).sort();
  const expected = HEALTH_DATA_QUERY_KEYS.map((k) => k.join('/')).sort();
  assert.deepEqual(seen, expected);
});

// ─── Source-drift trip-wires — WSS lifecycle contract ───────────────────
//
// The React wiring (useEffect, WebSocket construction, AppState
// subscription, exponential backoff, cleanup) is unreachable under
// node:test without a hook renderer. We pin the shape of the source
// file with a small regex battery so a refactor that drops (say) the
// AppState close-on-background handler is caught at test time, not in
// a Sentry report weeks later.

const HOOK_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'use-health-data-sync.ts'),
  'utf8',
);
// Pure-logic file lives in `lib/`, so the flag-parser trip-wire has to
// point there — not at the hook file, which only re-exports.
const PURE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'lib', 'health-data-sync.ts'),
  'utf8',
);

test('source: reads EXPO_PUBLIC_LABS_REALTIME_ENABLED (not a typo like _ENABLE)', () => {
  assert.match(PURE_SOURCE, /EXPO_PUBLIC_LABS_REALTIME_ENABLED/);
  assert.doesNotMatch(PURE_SOURCE, /EXPO_PUBLIC_LABS_REALTIME_ENABLE\b/);
});

test('source: hook re-exports the pure surface from @/lib/health-data-sync', () => {
  // If the re-export block is dropped, callers importing from
  // `@/hooks/use-health-data-sync` (including this test file, via the
  // hook's canonical path) silently lose access to the helpers. Pin
  // the wire.
  assert.match(HOOK_SOURCE, /from\s+['"]@\/lib\/health-data-sync['"]/);
  assert.match(HOOK_SOURCE, /export\s*\{[\s\S]*isLabsRealtimeEnabled[\s\S]*\}/);
});

test('source: uses WSS endpoint env var EXPO_PUBLIC_WSS_ENDPOINT_URL', () => {
  assert.match(HOOK_SOURCE, /EXPO_PUBLIC_WSS_ENDPOINT_URL/);
});

test('source: 60s long-poll interval', () => {
  assert.match(HOOK_SOURCE, /POLL_INTERVAL_MS\s*=\s*60_000/);
});

test('source: reconnect base 1s, cap 30s', () => {
  assert.match(HOOK_SOURCE, /RECONNECT_BASE_MS\s*=\s*1_000/);
  assert.match(HOOK_SOURCE, /RECONNECT_CAP_MS\s*=\s*30_000/);
});

test('source: exponential backoff doubles (capped) — Math.min(backoff * 2, cap)', () => {
  assert.match(
    HOOK_SOURCE,
    /Math\.min\(\s*backoffRef\.current\s*\*\s*2\s*,\s*RECONNECT_CAP_MS\s*\)/,
  );
});

test('source: jitter is ±30% (0.7 .. 1.3 multiplier)', () => {
  // Pin the exact literals so a well-meaning "let's use the ±25%
  // pattern from entitlements-sync" edit doesn't silently narrow the
  // spread we deliberately widened for labs traffic patterns.
  assert.match(HOOK_SOURCE, /0\.7\s*\+\s*Math\.random\(\)\s*\*\s*0\.6/);
});

test('source: subscribes to AppState change', () => {
  assert.match(HOOK_SOURCE, /AppState\.addEventListener\(\s*['"]change['"]/);
});

test('source: closes socket on background/inactive', () => {
  assert.match(HOOK_SOURCE, /next\s*===\s*['"]background['"]/);
  assert.match(HOOK_SOURCE, /next\s*===\s*['"]inactive['"]/);
  assert.match(HOOK_SOURCE, /socketRef\.current\?\.close\(\)/);
});

test('source: reconnects + refetches on AppState "active"', () => {
  assert.match(HOOK_SOURCE, /next\s*===\s*['"]active['"]/);
  // The active branch must call invalidateHealthDataQueries AND
  // trigger a fresh connect if no socket is live.
  assert.match(
    HOOK_SOURCE,
    /if\s*\(next\s*===\s*['"]active['"]\)\s*\{[\s\S]*invalidateHealthDataQueries\(qc\)[\s\S]*if\s*\(!socketRef\.current\)\s*void\s+connect\(\)/,
  );
});

test('source: guards WSS connect on hasStoredSession() + getAccessToken()', () => {
  assert.match(HOOK_SOURCE, /await\s+hasStoredSession\(\)/);
  assert.match(HOOK_SOURCE, /await\s+getAccessToken\(\)/);
});

test('source: token passed via URL query, url-encoded', () => {
  assert.match(HOOK_SOURCE, /\?token=\$\{encodeURIComponent\(token\)\}/);
});

test('source: cleanup function tears down socket + both timers', () => {
  assert.match(HOOK_SOURCE, /return\s*\(\)\s*=>\s*\{[\s\S]*cancelledRef\.current\s*=\s*true/);
  assert.match(HOOK_SOURCE, /clearTimeout\(reconnectTimerRef\.current\)/);
  assert.match(HOOK_SOURCE, /clearInterval\(pollTimerRef\.current\)/);
  assert.match(HOOK_SOURCE, /socketRef\.current\.close\(\)/);
});

test('source: onclose reconnects only when not cancelled (no leak after unmount)', () => {
  assert.match(
    HOOK_SOURCE,
    /socket\.onclose\s*=\s*\(\)\s*=>\s*\{[\s\S]*if\s*\(!cancelledRef\.current\)\s*scheduleReconnect\(\)/,
  );
});
