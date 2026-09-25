/**
 * COS-1133 — the summary card on Health Trends.
 *
 * The prose comes from a model and cannot be asserted. What can be is the
 * shape around it: that the domain headings become headings, that a failure
 * never reads as reassurance, and that the biometric digest is built from what
 * is already on screen rather than fetched twice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitDomains } from '../../lib/health-trend-summary-format.ts';

const SCREEN = readFileSync(new URL('../../app/Home/health-trends.tsx', import.meta.url), 'utf8');
const CARD_RAW = readFileSync(
  new URL('../../components/health/HealthTrendSummaryCard.tsx', import.meta.url),
  'utf8',
);
/*
 * Comments quote the very phrases under test — the card's own header explains
 * why it must never say "nothing to report". A guard that trips on the
 * documentation of the rule it enforces is a guard nobody keeps.
 */
const CARD = CARD_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

test("THE POINT: Ken's three domains become headings", () => {
  const out = splitDomains(
    'Biological\nYour heart rate is steady.\n\nPsychological\nMood scores improved.\n\nSocial / Faith\nYou see friends weekly.',
  );
  assert.deepEqual(out.map((s) => s.heading), ['Biological', 'Psychological', 'Social / Faith']);
  assert.match(out[0].body, /heart rate is steady/);
});

test('a sentence that MENTIONS a domain is not promoted to a heading', () => {
  // Only the name alone on its own line is a heading. Otherwise a sentence
  // like "Biological markers are stable" would split the prose in half.
  const out = splitDomains('Biological markers are stable and unremarkable.');
  assert.equal(out.length, 1);
  assert.equal(out[0].heading, null);
});

test('prose before the first heading is kept, not dropped', () => {
  const out = splitDomains('An opening line.\nBiological\nSteady.');
  assert.equal(out[0].heading, null);
  assert.match(out[0].body, /An opening line/);
  assert.equal(out[1].heading, 'Biological');
});

test('a failure never reads as a clinical all-clear', () => {
  // "Nothing to report" on a health screen is a finding. An outage is not.
  assert.match(CARD, /could not put your summary together/i);
  assert.doesNotMatch(CARD, /nothing to report|all clear|no issues found/i);
});

test('the biometric digest is built from what is already on screen', () => {
  // The backend cannot see HealthKit by design, so the device is the only
  // place this half exists — and re-reading it would be a second source that
  // could disagree with the carousels below.
  assert.match(SCREEN, /groupTrendsByBodySystem\(appleHealthTrends\)/);
  assert.match(SCREEN, /fetchHealthTrendSummary\(biometricDigest\)/);
});

test('the summary renders ABOVE the carousels', () => {
  const card = SCREEN.indexOf('<HealthTrendSummaryCard');
  const apple = SCREEN.indexOf('!appleHealthDisabled && appleHealthTrends.length > 0');
  assert.ok(card > -1 && apple > -1);
  assert.ok(card < apple, 'the answer comes before the evidence');
});
