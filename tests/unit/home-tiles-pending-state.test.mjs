/**
 * COS-1020 — a slow first response must not tell a patient they have no data.
 *
 * Vishal photographed Home mid-cold-start: the Wellbeing tile said "Take a
 * check-in" and Health Age said "Connect labs", on an account that has both.
 * The tile body was a BINARY — score, or empty — so while the first request was
 * in flight (cold Lambda, slow network) `data` is undefined and the terminal
 * EMPTY state rendered. That is worse than blank: it asserts something false and
 * invites the patient to redo work they already did.
 *
 * Asserted against source text because `node --test` cannot resolve the `@/`
 * alias, which is this repo's convention for component contracts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// Comments explain WHY isPending is wrong here, so an assertion about isPending
// must not read them. This exact trap has bitten before.
const ROW = stripComments(read('components/home/HeroInsightsRow.tsx'));
const CATALOG = read('hooks/use-score-catalog.ts');

test('THE POINT: neither tile can reach its empty state while still loading', () => {
  // Both bodies must branch three ways, not two.
  const wellbeing = ROW.slice(ROW.indexOf('function WellbeingTile'), ROW.indexOf('function HealthAgeTile'));
  const healthAge = ROW.slice(ROW.indexOf('function HealthAgeTile'), ROW.indexOf('function DailyReadTile'));

  for (const [name, body] of [['Wellbeing', wellbeing], ['HealthAge', healthAge]]) {
    assert.match(body, /<Empty\s+pending/, `${name} tile has no pending branch`);
    // The misleading CTA must sit AFTER the pending branch, never before it.
    const pendingAt = body.indexOf('<Empty\n            pending');
    const ctaAt = body.search(/hint=\{?\s*\n?\s*variant === 'large'\s*$/m);
    assert.ok(pendingAt > 0, `${name}: pending branch not found`);
    if (ctaAt > 0) assert.ok(pendingAt < ctaAt, `${name}: empty state precedes the pending state`);
  }
});

test('Health Age uses isLoading, NOT isPending — a disabled query is pending forever', () => {
  /*
   * react-query v5: isLoading === isPending && isFetching. useHealthAge is
   * `enabled: flag`, so when the feature flag is OFF the query never fetches
   * and status stays 'pending'. Keying the spinner off isPending would pin the
   * tile on "Checking…" permanently for every user without the flag.
   */
  const healthAge = ROW.slice(ROW.indexOf('function HealthAgeTile'), ROW.indexOf('function DailyReadTile'));
  assert.match(healthAge, /const \{ data, isLoading \} = useHealthAge\(flag\)/);
  assert.doesNotMatch(healthAge, /\bisPending\b/, 'isPending would never clear for a flag-off query');
});

test('the Wellbeing tile reads the isLoading the catalog already exposed', () => {
  // ScoreCatalog has carried this field all along; the tile simply ignored it.
  assert.match(CATALOG, /isLoading:\s*boolean/);
  const wellbeing = ROW.slice(ROW.indexOf('function WellbeingTile'), ROW.indexOf('function HealthAgeTile'));
  assert.match(wellbeing, /catalog\.isLoading/);
});

test('a loading tile does not announce "not available" to screen readers', () => {
  // The accessibility label is the one a blind patient actually receives; it
  // must not assert absence while the answer is still in flight.
  assert.match(ROW, /'Health age, checking'/);
  assert.match(ROW, /'Wellbeing score, checking'/);
});

test('Empty still renders the em dash when genuinely empty', () => {
  // The pending glyph must not leak into the real empty state.
  assert.match(ROW, /\{pending \? '· · ·' : '—'\}/);
});
