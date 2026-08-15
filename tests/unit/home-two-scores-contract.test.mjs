/**
 * Home shows exactly two scores (SCRUM-676).
 *
 * Ken 2026-08-14: "we should have only 2 scores, wellbeing score and health
 * age, and in home screen we should have these at top and remove other."
 *
 * The risks here are removal risks, not layout risks:
 *   - deleting a surface that something else depends on
 *   - showing the SAME wellbeing number twice on one screen, which makes a
 *     patient distrust both
 *   - quietly dropping Daily Read, which is a content card and not a score
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ROW = codeOnly(read('components/home/HeroInsightsRow.tsx'));
const HOME = codeOnly(read('app/Home/index.tsx'));

test('the top row renders exactly the two scores Ken asked for', () => {
  const render = ROW.slice(ROW.indexOf('const enabledCount'));
  assert.match(render, /<WellbeingTile variant=\{variant\} \/>/);
  assert.match(render, /healthAgeEnabled && <HealthAgeTile variant=\{variant\} \/>/);
  assert.doesNotMatch(render, /<ReadinessTile/, 'readiness must not be in the scores row');
  assert.doesNotMatch(render, /<DailyReadTile/, 'daily read must not be in the scores row');
});

test('ONE wellbeing number on the screen, from ONE implementation', () => {
  // The tile and the row both show "your wellbeing score", and the logic is
  // not a field read — it prefers composite and falls back to a mean of rows.
  // Two copies would drift, and a patient seeing two different wellbeing
  // scores on one screen would rightly distrust both.
  assert.match(ROW, /pickWellbeingDisplayScore\(catalog\)/);
  assert.match(
    codeOnly(read('components/home/WellbeingScoreTile.tsx')),
    /pickWellbeingDisplayScore\(catalog\)/,
  );
  // ...and the lower row no longer renders the tile beside the map.
  assert.doesNotMatch(HOME, /<WellbeingScoreTile \/>/, 'would be the same score twice');
});

test('Daily Read and the wellbeing map are OFF Home', () => {
  // Vishal 2026-08-14: "daily reads and wellbeing map not required on home
  // screen." This overruled my earlier guess that Ken meant scores only.
  //
  // Scoped to the LIVE tree: index.tsx also contains a dead HOME_V2 layout
  // that still references the map preview, and an unscoped check would fail
  // on code that never renders.
  const live = HOME.slice(HOME.indexOf('<HeroInsightsRow />'));
  assert.doesNotMatch(live, /<DailyReadCard \/>/);
  assert.doesNotMatch(live, /<WellbeingMapPreview \/>/);
});

test('removing them orphaned two screens — recorded so it is not a surprise', () => {
  // WellbeingMapPreview held the only live link to /Home/wellbeing-map, and
  // DailyReadCard the only one to /Home/daily-read. Both screens still exist
  // and work; nothing on Home routes to them. If that is wrong, the fix is an
  // entry point elsewhere, not reverting this.
  // Read RAW, not codeOnly — the note is a comment, and codeOnly strips them.
  const raw = read('app/Home/index.tsx');
  assert.match(raw, /last live link to \/Home\/daily-read/);
  assert.match(raw, /last live link to\s*\n?\s*\/\/?\s*\/Home\/wellbeing-map|last live link to[\s\S]{0,40}wellbeing-map/);
});

test('nothing was deleted, only unrouted', () => {
  // Readiness is OFF fleet-wide and Daily Read may come back; both tiles stay
  // in the file so restoring either is one line rather than a rewrite.
  assert.match(ROW, /function ReadinessTile/);
  assert.match(ROW, /function DailyReadTile/);
  // ScoreCardGrid stays imported: useScoreCatalog also feeds SCRUM-600.
  assert.match(HOME, /import \{ ScoreCardGrid \}/);
});

test('the scores row sits above the greeting, i.e. at the top', () => {
  const row = HOME.indexOf('<HeroInsightsRow />');
  const title = HOME.indexOf('styles.titleRow');
  assert.ok(row !== -1 && title !== -1);
  assert.ok(row < title, 'the two scores must come before the title row');
});

test('the two screens Home stopped linking to are reachable again', () => {
  // Removing the Home cards took away their ONLY live links. Both screens
  // still existed and still worked, but nothing routed to them — dead code
  // that looks alive. They now live on the wellbeing score screen, which is
  // where the map belonged anyway.
  const SCORE = codeOnly(read('app/Home/wellbeing-score.tsx'));
  assert.match(SCORE, /'\/Home\/wellbeing-map'/);
  assert.match(SCORE, /'\/Home\/daily-read'/);
});
