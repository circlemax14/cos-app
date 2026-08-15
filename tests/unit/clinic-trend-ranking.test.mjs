/**
 * Clinic trends: all of them, most interesting first (Ken 2026-08-15).
 *
 * SCRUM-265 capped this row at the ten most interesting trends because ONE
 * flat row of every lab a clinic ever sent is unreadable. SCRUM-671 grouped
 * the row by body system, which removed that premise — and made the cap
 * actively bad: ten results across seven organ headings left Liver showing a
 * single card with no hint the rest existed.
 *
 * The subtle part, and the reason this file exists: the old ranking returned
 * an unordered SET, and the caller filtered the source array by it. So the
 * ranking chose WHICH trends appeared and never their order. Lift the cap and
 * the Set matches everything — and the ranking silently does nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SRC = codeOnly(readFileSync(join(ROOT, 'app/Home/health-trends.tsx'), 'utf8'));

test('the cap is gone — every clinic trend is shown', () => {
  assert.doesNotMatch(SRC, /MAX_SELECTED/, 'the cap constant must not survive');
  assert.doesNotMatch(SRC, /pickInitialSelection/, 'the Set-returning selector must not survive');
});

test('THE SUBTLE ONE: ranking returns an ORDERED array, not a Set', () => {
  // A Set cannot order anything. Filtering the source array by one preserves
  // the source order, which is why the old ranking did nothing once the cap
  // was lifted.
  assert.match(SRC, /function rankByInterest\(trends: LongitudinalTrend\[\]\): LongitudinalTrend\[\]/);
  assert.doesNotMatch(SRC, /new Set\(\s*\[\.\.\.trends\]/);
});

test('the ordered result is what gets rendered', () => {
  // Ranking that is computed and then discarded is worse than none — it reads
  // as though ordering happens.
  assert.match(SRC, /rankByInterest\(clinicTrends\)\s*\.map\(\(t\) => applyTimeFilter/);
});

test('the ordering rule still favours what needs attention', () => {
  // Out-of-range points outrank direction; worsening outranks improving;
  // ties break alphabetically so the list is stable across renders.
  assert.match(SRC, /interpretation !== 'normal'\) s \+= 2/);
  assert.match(SRC, /'worsening'\) s \+= 3/);
  assert.match(SRC, /'improving'\) s \+= 2/);
  assert.match(SRC, /score\(b\) - score\(a\) \|\| a\.metricName\.localeCompare\(b\.metricName\)/);
});

test('empty-after-filtering trends are still dropped', () => {
  // A card with no points in the selected window would render blank.
  assert.match(SRC, /\.filter\(\(t\) => t\.dataPoints\.length > 0\)/);
});
