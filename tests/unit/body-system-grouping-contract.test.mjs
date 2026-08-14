/**
 * Health Trends groups labs and Apple Health by body system / organ.
 *
 * Ken 2026-08-14: "These I'd like to group by body system/organ."
 *
 * lib/body-system-grouping.test.mjs proves the matching. What it cannot prove
 * is the thing most likely to rot: the code table is a HAND-MAINTAINED COPY of
 * two lists that live elsewhere —
 *
 *   - the 17 `hk-*` metric specs in services/health.ts
 *   - the tracked LOINC list in cos-backend trend-computation.service.ts
 *
 * Add a metric to either and forget this table, and it does not crash, does not
 * fail a test, and does not look broken in review. It silently drops into
 * "Other" on a real patient's screen. So these tests read the sources and
 * assert the table still covers them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { bodySystemForMetric } from '../../lib/body-system-grouping.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SCREEN = read('app/Home/health-trends.tsx');

const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('ANTI-ROT: every hk-* metric in services/health.ts is classified', () => {
  const codes = [...read('services/health.ts').matchAll(/metricCode: '(hk-[a-z-]+)'/g)]
    .map((m) => m[1]);
  const unique = [...new Set(codes)];
  assert.ok(unique.length >= 17, `expected the full HealthKit set, found ${unique.length}`);
  const unclassified = unique.filter((c) => bodySystemForMetric({ metricCode: c }) === null);
  assert.deepEqual(
    unclassified, [],
    'these Apple Health metrics would silently render under "Other"',
  );
});

test('ANTI-ROT: every backend tracked LOINC is classified', () => {
  // Sibling repo — skip rather than fail when cos-backend is not checked out.
  let src;
  try {
    src = readFileSync(join(ROOT, '..', 'cos-backend/src/services/trend-computation.service.ts'), 'utf8');
  } catch {
    return;
  }
  const codes = [...src.matchAll(/\{ code: '([0-9-]+)', name: '([^']+)'/g)].map((m) => ({ code: m[1], name: m[2] }));
  assert.ok(codes.length >= 9, `expected the tracked metric list, found ${codes.length}`);
  const unclassified = codes.filter((c) => bodySystemForMetric({ metricCode: c.code }) === null);
  assert.deepEqual(
    unclassified.map((c) => `${c.code} ${c.name}`), [],
    'these clinic metrics would silently render under "Other"',
  );
});

test('both sections on the screen are grouped, not just one', () => {
  // Ken asked for the labs AND the Apple data.
  const code = codeOnly(SCREEN);
  assert.match(code, /groupTrendsByBodySystem\(appleHealthTrends\)/, 'Apple Health section');
  assert.match(code, /groupTrendsByBodySystem\(clinicSliderTrends\)/, 'From Your Clinic section');
});

test('a heading is only rendered when the group HAS one', () => {
  // The ungrouped fallback returns label ''. Rendering it unguarded would put
  // an empty heading band above the flat carousel.
  const code = codeOnly(SCREEN);
  const guards = code.match(/\{group\.label \? \(/g) ?? [];
  assert.equal(guards.length, 2, 'both sections must guard the heading on a non-empty label');
});

test('cards still open the trend modal from inside a group', () => {
  // The regrouping moved the .map() one level deeper; losing onPress here would
  // make every card on the screen inert.
  const code = codeOnly(SCREEN);
  const presses = code.match(/group\.metrics\.map\(\(t\) => \(\s*<AppleHealthMiniCard[\s\S]*?onPress=\{\(\) => setActiveTrend\(t\)\}/g) ?? [];
  assert.equal(presses.length, 2, 'both grouped carousels must keep onPress');
});
