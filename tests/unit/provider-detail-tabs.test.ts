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

test('Notes shows visits that HAVE notes, and only those', () => {
  // A visit that produced nothing would render "no medicines or tests were
  // recorded" under a heading called Notes — a row whose only content is that
  // it has none.
  assert.match(code, /visitCards\.filter\(\(v\) => v\.reports\.length > 0\)/);
  assert.match(code, /renderVisitList\(visitsWithNotes, 'Visits with notes'\)/);
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

test('COS-1132: Appointments is its own tab, not a section inside Notes', () => {
  /*
   * It arrived under Notes when COS-1090 collapsed five tabs to three. It
   * carries its OWN past/recommended switch, so nesting it left the Notes tab
   * ending in a set of tabs belonging to something else.
   *
   * NOTE: this makes FOUR tabs where Ken asked for three. Restored on Vishal's
   * instruction; if Ken wants three again, this assertion is the first thing
   * to delete.
   */
  assert.match(code, /\{ id: 'appointments', label: 'Appointments' \}/);
  assert.match(code, /\{activeTab === 'appointments' && renderAppointments\(\)\}/);
  assert.match(code, /\{activeTab === 'progress' && renderProgressNotes\(\)\}/);
});
