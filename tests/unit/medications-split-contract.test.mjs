/**
 * The medications list is split into Medical and Psychiatric (SCRUM-674a).
 *
 * lib/medication-classification.test.mjs proves the classifier. This proves
 * the screen actually uses it, and uses it in the way that keeps the failure
 * one-sided.
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

test('the active list is split with the shared classifier', () => {
  assert.match(SECTION, /import \{ splitByMedicationClass \} from '@\/lib\/medication-classification'/);
  assert.match(SECTION, /splitByMedicationClass\(active\)/);
});

test('a heading renders for each NON-EMPTY group', () => {
  // The first cut required BOTH kinds, which made the feature invisible to
  // anyone taking no psychiatric medication — most people, including the first
  // person who tried to test it. A heading is how the patient learns the
  // grouping exists.
  assert.match(SECTION, /\{medical\.length > 0 && heading\('Medical', medical\.length\)\}/);
  assert.match(SECTION, /\{psychiatric\.length > 0 && heading\('Psychiatric', psychiatric\.length\)\}/);
});

test('an EMPTY group renders no heading', () => {
  // "PSYCHIATRIC · 0" would be both useless and, for some patients, a pointed
  // thing to display.
  assert.doesNotMatch(SECTION, /heading\('Psychiatric', 0\)/);
  assert.match(SECTION, /psychiatric\.length > 0 &&/);
});

test('both groups render, and neither is dropped', () => {
  assert.match(SECTION, /\{medical\.map\(renderCard\)\}/);
  assert.match(SECTION, /\{psychiatric\.map\(renderCard\)\}/);
});

test('the card itself is unchanged — one renderer for both groups', () => {
  // Two card renderers would drift; every action on a medication row must
  // behave identically whichever heading it sits under.
  const renderers = SECTION.match(/const renderCard = \(med: Medication\)/g) ?? [];
  assert.equal(renderers.length, 1);
  for (const prop of ['onEdit', 'onRemove', 'onToggleTracked', 'onSnooze', 'onRestore']) {
    assert.match(SECTION, new RegExp(`${prop}=`), `${prop} must survive the regroup`);
  }
});
