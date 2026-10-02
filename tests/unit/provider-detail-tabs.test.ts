/**
 * COS-1131 — what each provider tab is FOR.
 *
 * Ken, on the provider screen: "remember conditions will have AI summary,
 * notes will have visits with notes."
 *
 * Source-text contract: doctor-detail.tsx is a ~2,900-line screen that
 * `node --test` cannot mount, and what is being pinned is which section sits
 * in which tab — a structural fact the source states plainly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREEN = readFileSync(new URL('../../app/Home/doctor-detail.tsx', import.meta.url), 'utf8');

/** Comments quote the very strings under test; strip them first. */
const code = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

test('THE POINT: the AI summary leads Conditions, above the diagnoses', () => {
  // It was always rendered — but below a twelve-card visit list, so the tab
  // opened on "Your visits" and the summary was off the bottom of the screen.
  // Ken asked for a thing that existed and could not be seen.
  const summaryAt = code.indexOf('<WhatChangedCard');
  const emptyAt = code.indexOf('isEmpty ? (');
  assert.ok(summaryAt > -1, 'the Conditions tab must render the AI summary');
  assert.ok(emptyAt > -1, 'the diagnosis section moved — re-check this guard');
  assert.ok(summaryAt < emptyAt, 'the summary must come before the diagnosis cards');
});

test('the visit list is NOT in the Conditions tab any more', () => {
  /*
   * Bounded by the NEXT definition in file order, which is renderProgressNotes
   * — not renderProviderMedications, which sits further down. Slicing to the
   * wrong one swallows the Notes tab and this test then fails on the very code
   * it is meant to approve.
   */
  const treatmentStart = code.indexOf('const renderTreatmentPlan');
  const treatmentEnd = code.indexOf('const renderProgressNotes');
  assert.ok(treatmentStart > -1 && treatmentEnd > treatmentStart, 'definition order changed');
  const body = code.slice(treatmentStart, treatmentEnd);
  assert.doesNotMatch(body, /renderVisitList\(/, 'visits belong to Notes now');
});

test('COS-1239: Notes renders EVERY past visit, not only visits with reports', () => {
  /*
   * COS-1131 filtered to `reports.length > 0`. Ken, 2026-10-02: "the
   * appointments should detail perhaps why I was there" — and the visits that
   * filter hid were exactly the ones whose whole record is that reason.
   */
  assert.doesNotMatch(code, /reports\.length > 0\)/, 'the reports-only filter is gone');
  assert.match(code, /toVisitCards\(detail\)\.visits\.filter\(\(v\) => isPastVisit\(v\.encounter, today\)\)/);
  assert.match(code, /groupVisitsByCondition\(detail, visits\)/, 'grouping sees every past visit');
  assert.match(code, /renderVisitList\(visitCards, 'Your visits'\)/);
  // A cap would hide older visits with no way to reach them, and Notes is now
  // the only place they live.
  assert.doesNotMatch(code, /cards\.slice\(0, 12\)/);
});

test('COS-1239: every card says why you were there, or that the clinic did not', () => {
  assert.match(code, /renderCardLabel\('Why you were there'\)/);
  assert.match(code, /const reason = visitReason\(v\.encounter\)/);
  assert.match(code, /The clinic didn't record a reason for this visit\./);
  assert.match(code, /renderCardLabel\('Diagnoses at this visit'\)/);
  assert.match(code, /From the clinic&apos;s visit summary/);
  assert.match(code, /recordedNothing\(v\) \?/, 'the empty line only when the card is truly empty');
});

test('COS-1239: the visit note collapses to 4 lines and EXPANDS in place', () => {
  // The only numberOfLines on the card, and it must be undoable — at large
  // text sizes a permanent clamp hides the note entirely.
  assert.match(code, /numberOfLines=\{longNote && !noteOpen \? 4 : undefined\}/);
  assert.match(code, /noteOpen \? 'Show less' : 'Read the full note'/);
  const card = code.slice(code.indexOf('const renderVisitList ='), code.indexOf('const renderTreatmentPlan ='));
  assert.equal((card.match(/numberOfLines/g) ?? []).length, 1, 'no other clamp on visit content');
  assert.doesNotMatch(card, /Modal/, 'inline, not a modal');
});

test('the visit card is built ONCE, not copied into both tabs', () => {
  // The Health Trends carousel had exactly this duplication and it drifted:
  // the second copy is the one that gets forgotten.
  const defs = code.match(/const renderVisitList =/g) ?? [];
  assert.equal(defs.length, 1, 'there must be exactly one visit-list renderer');
});

test('formatDate is shared rather than redefined per section', () => {
  const defs = code.match(/const formatDate = \(iso/g) ?? [];
  assert.equal(defs.length, 1, 'one date formatter for the screen');
});

test("the tabs keep Ken's names", () => {
  // "Progress Notes" -> "Notes" was his: "it may not be progress, right?"
  assert.match(code, /\{ id: 'treatment', label: 'Conditions' \}/);
  assert.match(code, /\{ id: 'progress', label: 'Notes' \}/);
  assert.match(code, /\{ id: 'share', label: 'Shared Data' \}/);
});

test('COS-1239: three tabs — Appointments folded into Notes (reverses COS-1132)', () => {
  /*
   * COS-1132 made it four tabs at Vishal's request, pending a talk with Ken.
   * Ken, 2026-10-02: "the appointment information again should be in the
   * notes section." This pins the answer.
   */
  const tabs = code.slice(code.indexOf('const tabs = ['), code.indexOf('];', code.indexOf('const tabs = [')));
  assert.deepEqual(
    [...tabs.matchAll(/label: '([^']+)'/g)].map((m) => m[1]),
    ['Conditions', 'Notes', 'Shared Data'],
  );
  assert.doesNotMatch(code, /id: 'appointments'/);
  assert.doesNotMatch(code, /renderAppointments/);
  assert.match(code, /\{activeTab === 'progress' && renderProgressNotes\(\)\}/);
});

test('COS-1239: what the Appointments tab held now lives in Notes', () => {
  // No nested Past/Recommended switch — COS-1132's objection to the first fold.
  assert.doesNotMatch(code, /appointmentSubTab/);
  const notes = code.slice(code.indexOf('const renderProgressNotes ='), code.indexOf('const handleSwitchChange ='));
  const rec = notes.indexOf("renderSectionHeading('Recommended next visits')");
  const booked = notes.indexOf("renderSectionHeading('Booked visits')");
  const past = notes.indexOf('conditionGroups.length > 0 ?');
  assert.ok(rec > -1 && booked > rec && past > booked, 'recommended, then booked, then past');
  assert.match(notes, /recommendedForProvider\.length > 0 \?/, 'recommended only when there are any');
  assert.match(notes, /<RecommendedCard/);
  assert.match(notes, /<AppointmentCard/);
});

test('COS-1239: an empty Notes says WHICH empty it is', () => {
  // "You have nothing" and "we could not check" are different claims.
  assert.match(code, /setVisitsFailed\(!detail\)/);
  assert.match(code, /Loading your visits…/);
  assert.match(code, /We couldn't load your visits with this provider just now\./);
  assert.match(code, /Your record has no past visits with this provider\./);
  // ...and "just now" must be retryable: pull-to-refresh re-runs the visit fetch.
  assert.match(code, /setVisitsReload\(\(n\) => n \+ 1\)/);
  assert.match(code, /\}, \[providerId, visitsReload\]\);/);
});

test('COS-1239: the non-EHR provider page folds Appointments into Notes too', () => {
  // One rule for every provider page — Ken: "You can look at these on all of
  // my providers."
  // Not comment-stripped: this file contains 'image/*', which the strip regex
  // reads as the start of a block comment.
  const src = readFileSync(new URL('../../app/Home/non-ehr-provider-detail.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /id: 'appointments'/);
  assert.doesNotMatch(src, /renderAppointmentsTab/);
  const notes = src.slice(src.indexOf('const renderNotesTab ='), src.indexOf('const renderFilesTab ='));
  assert.match(notes, /sortedApts\.map\(apt => renderAppointmentCard\(apt\)\)/);
});
