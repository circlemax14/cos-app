/**
 * COS-1140 — the provider's focus summary leads the Conditions tab.
 *
 * Ken, 2026-09-26: "This AI summary at the bottom of the notes page should be
 * the first thing you open to on the conditions page. The notes can stand
 * alone but the conditions page should have a summary of what the provider's
 * focus has been the past year or two."
 *
 * The whole change is WHERE a block renders and WHEN it is fetched, so these
 * assert exactly that. The one that matters most is the fetch trigger: a
 * summary rendered on Conditions but loaded on Notes shows its empty state to
 * anyone who opens Conditions first — which is everyone, since Conditions is
 * the first tab.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREEN = readFileSync(new URL('../../app/Home/doctor-detail.tsx', import.meta.url), 'utf8');

/*
 * Strip comments before matching. This screen's comments quote Ken's request
 * verbatim, including the words "notes" and "conditions", so a raw search
 * matches the documentation of the rule rather than the rule.
 */
const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function sliceBetween(from: string, to: string): string {
  const i = CODE.indexOf(from);
  assert.ok(i > -1, `expected to find ${from}`);
  const j = CODE.indexOf(to, i);
  return CODE.slice(i, j > -1 ? j : undefined);
}

test('Conditions opens on the focus summary, above "What changed"', () => {
  const focus = CODE.indexOf('renderProviderFocusSummary()');
  const whatChanged = CODE.indexOf('<WhatChangedCard');
  assert.ok(focus > -1, 'focus summary is rendered');
  assert.ok(whatChanged > -1, '"What changed" still exists');
  assert.ok(focus < whatChanged, 'focus summary leads the tab');
});

test('"What changed" was not deleted to make room', () => {
  /*
   * Ken asked for the focus summary to lead, not for the deltas card to go.
   * They answer different questions — recent change vs the last year or two —
   * and removing one on the strength of a request about the other is the kind
   * of tidy-up nobody asked for.
   */
  assert.match(CODE, /state=\{insightFor\('treatment'\)\}/);
});

test('Notes no longer renders the narrative — it stands alone', () => {
  const notes = sliceBetween('const renderProgressNotes =', 'const handleSwitchChange =');
  assert.ok(!notes.includes('aiProgressNotes'), 'narrative is gone from Notes');
  assert.ok(!notes.includes('styles.progressNoteCard'), 'its card is gone from Notes');
});

test('it is fetched for the tab that renders it', () => {
  /*
   * THE bug this guards. Left pointing at 'progress', the summary would only
   * load once the patient visited a tab it is no longer on — so opening
   * straight to Conditions, which is exactly what Ken asked for, would show
   * "No progress notes yet" forever.
   */
  assert.match(CODE, /if \(!providerId \|\| activeTab !== 'treatment'\) return;\s*\n\s*if \(aiProgressNotes \|\| aiProgressLoading\) return;/);
});

test('there is exactly one copy of the narrative', () => {
  // Two copies of a 7-day-cached narrative is two places for it to disagree
  // with itself, and Ken was explicit that Notes stands alone.
  const copies = CODE.match(/\{aiProgressNotes\.narrative\}/g) ?? [];
  assert.equal(copies.length, 1);
});

test('the refresh control and the generated-at stamp moved with it', () => {
  // A cached summary that cannot say how old it is, or be refreshed, is the
  // stale-data complaint this whole line of work started from.
  const fn = sliceBetween('const renderProviderFocusSummary =', 'const renderProgressNotes =');
  assert.ok(fn.includes('aiProgressNotes.generatedAt'), 'shows when it was generated');
  assert.ok(fn.includes('fromCache'), 'says when it is cached');
  assert.ok(fn.includes('loadAiProgressNotes'), 'can be refreshed');
});

/**
 * COS-1151 — Ken's spec rendered, and honest when it cannot be.
 *
 * Measured on the raw clinic exports rather than assumed: exports carrying
 * `encounter-diagnosis` conditions link 88-92% of them to a visit, exports
 * carrying only problem-list entries link 0%. So grouping is available for
 * some patients and impossible for others, and the fallback is the common
 * case today — including for the clinician who asked for the feature.
 */
test('Notes groups by condition when the record links them', () => {
  assert.match(CODE, /conditionGroups\.length > 0 \?/);
  assert.match(CODE, /renderVisitList\(g\.visits, g\.condition\.name\)/);
});

test('visits no diagnosis claimed are still shown, under Other visits', () => {
  // Nothing may be lost by being ungroupable.
  assert.match(CODE, /renderVisitList\(ungroupedVisits, 'Other visits'\)/);
});

test('the flat fallback SAYS why it is flat', () => {
  /*
   * The empty-grouping case is the common one today, so it gets a sentence
   * rather than silently looking like the feature was never built. A clinician
   * who reads "your clinic's records don't link diagnoses to visits" can act
   * on it; one who sees an ordinary date list cannot.
   */
  assert.match(CODE, /listed by date because this clinic/);
});

test('grouping is computed from the detail already in hand, not refetched', () => {
  assert.match(CODE, /groupVisitsByCondition\(detail, visits\)/);
});
