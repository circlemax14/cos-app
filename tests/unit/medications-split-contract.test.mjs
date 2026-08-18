/**
 * The medications list uses the shared classifier — and what it does with the
 * answer (SCRUM-674a, rewritten 2026-08-18).
 *
 * ─── WHY THIS FILE WAS RED ───────────────────────────────────────────
 *
 * It asserted the ORIGINAL two-headed-section design: `{medical.map(...)}`,
 * `{psychiatric.map(...)}`, and an uppercase "Psychiatric" heading. That
 * design was removed on 2026-08-18 (cos-app#421) after Vishal called it out —
 * the headings split the list in two, so a patient's medications no longer
 * appeared in one place and the order they were added in was destroyed.
 *
 * The removal shipped without this file being updated, so four tests sat red
 * on main asserting a design that no longer existed. That is exactly the
 * failure mode a contract test is supposed to PREVENT, and it happened
 * because the tests were written against the implementation's shape rather
 * than against the requirement.
 *
 * So this rewrite pins the REQUIREMENT — Ken's medical/psychiatric
 * distinction must reach the patient — while leaving the presentation free to
 * change again.
 *
 * lib/medication-classification.test.mjs proves the classifier itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SECTION = codeOnly(read('components/health-plan/MedicationsSection.tsx'));

test('the screen uses the SHARED classifier, not its own copy', () => {
  // The one-sided failure direction lives in that module. A second
  // implementation here would drift from it silently.
  assert.match(SECTION, /from '@\/lib\/medication-classification'/);
  assert.match(SECTION, /classifyMedication\(med\)/);
});

test("Ken's distinction still reaches the patient", () => {
  // The requirement, independent of how it is drawn. Today it is a violet
  // left rail plus the word; it was headed sections; it may become something
  // else. What must never happen is the classification being computed and
  // then not shown.
  assert.match(SECTION, /classMark\(medClass\)/);
  assert.match(SECTION, /\{mark\.label\}/, 'the word must render, not only a colour');
  assert.match(SECTION, /PSYCH_TINT/);
});

test('ONLY psychiatric is asserted — medical is a default, not a finding', () => {
  // classifyMedication returns 'medical' for anything not on its curated
  // list, including psychiatric drugs it does not know. Marking medical would
  // present a fallback as a conclusion on a screen a patient may hand to a
  // family member.
  assert.doesNotMatch(SECTION, /medical-services/, 'no medical glyph');
  assert.doesNotMatch(SECTION, /heading\('Medical'/, 'no Medical heading');
});

test('THE REGRESSION THIS FILE MISSED: one list, one order', () => {
  // Two separate .map() passes was the tell for the split design.
  assert.match(SECTION, /\{active\.map\(renderCard\)\}/);
  assert.doesNotMatch(SECTION, /\{medical\.map\(renderCard\)\}/);
  assert.doesNotMatch(SECTION, /\{psychiatric\.map\(renderCard\)\}/);
});

test('the counts survive, because they were the useful half of the headings', () => {
  // splitByMedicationClass is still used — for the legend and the count, not
  // for building two lists.
  assert.match(SECTION, /splitByMedicationClass\(active\)/);
  assert.match(SECTION, /showLegend/);
});
