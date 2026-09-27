/**
 * COS-1147 — the Heart Age card.
 *
 * Ken asked whether his health age should improve with a better A1c and lower
 * triglycerides. Health Age structurally could not answer; this card is the
 * separate published figure that responds to lipids.
 *
 * The assertions here are about HONESTY rather than layout, because the two
 * ways this card can mislead are both silent:
 *   - merging into Health Age, so a risk equivalence reads as a biological age
 *   - showing a number that moved for other reasons while the patient believes
 *     his triglycerides moved it
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREEN = readFileSync(new URL('../../app/Home/health-age.tsx', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../../services/api/heart-age.ts', import.meta.url), 'utf8');

/* Comments quote the rules under test, so match code only. */
const CODE = SCREEN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the card states what the model does NOT use', () => {
  // The whole reason Ken's question needs answering in the UI and not just a PR.
  assert.match(CODE, /does not use \{data\.excludes\.join\(' or '\)\}/);
  assert.match(CODE, /no published heart-age/);
});

test('exclusions travel on the wire, not only in the copy', () => {
  // So any future consumer carries the caveat too.
  assert.match(CLIENT, /excludes: string\[\]/);
});

test('Heart Age is rendered as its own block, not folded into Health Age', () => {
  const heart = CODE.indexOf('<HeartAgeCard');
  const markers = CODE.indexOf('<ContributorsAccordion');
  assert.ok(heart > -1, 'card is rendered');
  assert.ok(markers > -1, 'Health Age markers still render');
  assert.ok(heart > markers, 'Heart Age sits below Health Age');
  // And never arithmetically combined with it.
  assert.ok(!CODE.includes('healthAge + heartAge'));
  assert.ok(!CODE.includes('(healthAge + '));
});

test('the capped case renders "80+" rather than a number', () => {
  /*
   * D'Agostino's own published table tops out at ">80", and the female SBP
   * coefficients climb fast — a 60-year-old can compute to 87.8. Printing that
   * reads as a prediction rather than a risk equivalence.
   */
  assert.match(CODE, /data\.capped \? '80\+'/);
});

test('an unavailable figure says WHICH inputs are missing', () => {
  // "Not available" with no reason is the one thing a patient cannot act on.
  assert.match(CODE, /We need a few more results first: \$\{data\.missing\.join\(', '\)\}/);
  assert.match(CODE, /only validated for ages 30 to 74/);
});

test('an assumed BP-medication answer is disclosed', () => {
  /*
   * The treated-SBP coefficient is the LARGER one, so assuming untreated is
   * the conservative direction — but the patient still has to be told it was
   * assumed, or the number looks like it was measured.
   */
  assert.match(CODE, /data\.bpTreatmentAssumed/);
  assert.match(CODE, /assumed you are not taking blood-pressure medication/);
});

test('a disabled backend collapses the card silently', () => {
  // Route is always mounted and 404s FEATURE_DISABLED; the card must vanish
  // rather than show a network error on a health screen.
  assert.match(CLIENT, /class HeartAgeFeatureDisabledError/);
  assert.match(CODE, /if \(hidden \|\| !data\) return null/);
});
