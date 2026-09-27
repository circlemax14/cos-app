/**
 * COS-1139 — the trends download carries the narrative, not just the numbers.
 *
 * Ken, 2026-09-26: "Data download is useful. Would be great to be able to
 * integrate AI summary and BPS summary in download for sharing as well."
 *
 * He shares this file with clinicians. A bare table of analyte values is the
 * half a clinician already has from the lab; the summaries are the half that
 * says what the platform made of it.
 *
 * `buildTrendsCsv` is module-private to the screen, so these are source-text
 * assertions — the same pattern as the COS-1133 card tests next door. What
 * they pin is the shape that would fail silently: a preamble that stops being
 * prepended, or an absent summary that starts reading like an empty one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREEN = readFileSync(new URL('../../app/Home/health-trends.tsx', import.meta.url), 'utf8');

/*
 * Comments in the screen quote the phrases under test, so a bare substring
 * search would match the documentation of the rule rather than the rule. Strip
 * comments first — a guard that trips on its own explanation is a guard
 * somebody deletes.
 */
const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the preamble is prepended to the data rows, not appended', () => {
  // Appended, it lands below hundreds of data rows and nobody scrolls to it.
  assert.match(CODE, /const rows: string\[\] = \[\.\.\.preamble, header\]/);
});

test('both summaries reach the builder', () => {
  assert.match(CODE, /buildTrendsCsv\(allVisible, \{/);
  assert.match(CODE, /ai,/);
  assert.match(CODE, /bps:/);
});

test('an absent AI summary says so rather than being omitted', () => {
  /*
   * "Not generated" and "nothing to report" must never read the same on a
   * page someone makes decisions from. An omitted section reads as the
   * second; this states the first.
   */
  assert.match(CODE, /Not generated for this download\./);
});

test('a half-loaded BPS summary is not exported as if it were complete', () => {
  // trendSummary starts { loading: true, summary: '' }. Exporting that state
  // would ship an empty section that reads as "we looked and found nothing".
  assert.match(CODE, /trendSummary\.error \|\| trendSummary\.loading \? '' : trendSummary\.summary/);
});

test('the download reuses an on-screen summary before paying for a new one', () => {
  // A download must not quietly cost a Bedrock call the patient did not ask
  // for — but must not quietly omit the narrative either.
  assert.match(CODE, /sharedSummary \?\? \(await fetchTrendsSummary\(\)\.catch\(\(\) => null\)\)/);
});

test('the shared file carries the same AI disclaimer the screen shows', () => {
  // The file outlives the screen it came from and gets forwarded on. The
  // caveat has to travel with it.
  assert.match(CODE, /not a diagnosis or treatment plan/);
});

test('SummarizeCard still owns its own loading state', () => {
  /*
   * SCRUM-279 kept this state inside the child so the rest of the screen does
   * not re-render while Bedrock works. Lifting the RESULT up for the download
   * must not turn into lifting the whole thing up.
   */
  assert.match(CODE, /function SummarizeCard\(\{ onLoaded \}/);
  assert.match(CODE, /const \[loading, setLoading\] = useState\(false\)/);
});
