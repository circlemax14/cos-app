/**
 * The "About this medication" block (SCRUM-674b, visible half).
 *
 * The dangerous failures here are all about what the patient is told:
 *   - rendering an error they cannot act on, when the feature is simply dark
 *   - turning "the label does not say" into a reassurance
 *   - dropping the source line, which is what separates "the label says this"
 *     from "an app told me this"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const BLOCK = codeOnly(read('components/health-plan/DrugLabelFacts.tsx'));
const CLIENT = codeOnly(read('services/api/drug-label.ts'));
const SECTION = codeOnly(read('components/health-plan/MedicationsSection.tsx'));

test('DARK BY DEFAULT: nothing renders when the lookup finds nothing', () => {
  // The endpoint 404s while the flag is off, which is everywhere today. That
  // must be invisible, not an error message.
  assert.match(BLOCK, /if \(!data\?\.found\) return null/);
});

test('a failed request is a not-found, never a thrown error', () => {
  assert.match(CLIENT, /catch \{[\s\S]*return NOT_FOUND/);
});

test('THE TRI-STATE: "the label does not say" never renders as reassurance', () => {
  // isCorticosteroid is boolean | undefined. Rendering undefined as "not a
  // steroid" would be the app inventing a clinical reassurance.
  assert.match(BLOCK, /data\.isCorticosteroid === true/);
  assert.match(BLOCK, /data\.isCorticosteroid === false/);
  assert.doesNotMatch(
    BLOCK,
    /!data\.isCorticosteroid \?/,
    'a truthiness check would collapse undefined into false',
  );
});

test('the source is always shown with the facts', () => {
  assert.match(BLOCK, /\{data\.source\}|data\.source\}/);
  assert.match(BLOCK, /retrievedAt/);
});

test('it only appears on an EXPANDED row', () => {
  // Reference material a patient goes looking for, not something pushed into
  // a list they are scanning.
  assert.match(SECTION, /\{showControls && med\.name \? \(\s*<DrugLabelFactsBlock/);
});

test('only the drug name is sent', () => {
  assert.match(CLIENT, /params: \{ name: trimmed \}/);
  assert.doesNotMatch(CLIENT, /userId|patientId|sub:|token/i);
});
