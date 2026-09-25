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

test('an unlabelled group is NOT wrapped in an accordion', () => {
  /*
   * The ungrouped fallback returns label ''. COS-1130 turned each labelled
   * group into a SummaryCardShell; an accordion titled "" would be a control
   * that says nothing about what it hides, so the flat carousel is returned
   * directly instead.
   *
   * The guard used to be duplicated at both render sites. It now lives once,
   * inside SystemAccordion, which is why this asserts one occurrence rather
   * than two.
   */
  const code = codeOnly(SCREEN);
  assert.match(code, /if \(!group\.label\) return cards/);
  const shells = code.match(/<SummaryCardShell/g) ?? [];
  assert.equal(shells.length, 1, 'both sections must share ONE accordion component');
});

test('cards still open the trend modal from inside a group', () => {
  // Losing onPress would make every card on the screen inert. COS-1130 moved
  // the map into SystemAccordion, so the tap is wired once and BOTH render
  // sites must pass the handler down.
  const code = codeOnly(SCREEN);
  assert.match(code, /onPress=\{\(\) => onSelect\(t\)\}/);
  const wired = code.match(/onSelect=\{setActiveTrend\}/g) ?? [];
  assert.equal(wired.length, 2, 'both sections must pass setActiveTrend to the accordion');
});

test('COS-1130: the accordion is the SAME component Health Status uses', () => {
  // A lookalike would drift — different caret, different tap target, and a fix
  // to one would silently not reach the other.
  assert.match(
    codeOnly(SCREEN),
    /import SummaryCardShell from '@\/components\/health-summary\/SummaryCardShell'/,
  );
});
