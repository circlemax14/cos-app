/**
 * Medical vs Psychiatric medication grouping (SCRUM-674a).
 *
 * The asymmetry drives every test here: an antipsychotic under "Medical" is a
 * missed grouping; lisinopril under "Psychiatric" is the app asserting
 * something false about the patient on a screen they may show a family member.
 * So the classifier is one-sided, and these tests mostly prove it does NOT
 * over-call.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyMedication,
  splitByMedicationClass,
  DUAL_INDICATION_NOT_CLASSIFIED,
} from './medication-classification.ts';

const c = (name) => classifyMedication({ name });

test('common psychiatric medications are named, by generic AND brand', () => {
  const PSYCH = [
    'Sertraline', 'Zoloft 50mg', 'fluoxetine', 'Prozac',
    'Quetiapine', 'Seroquel XR', 'Aripiprazole', 'Abilify',
    'Lithium carbonate', 'Lithobid',
    'Alprazolam', 'Xanax', 'Lorazepam 0.5 mg', 'buspirone',
    'Zolpidem tartrate', 'Ambien CR',
    'Lisdexamfetamine', 'Vyvanse 30mg', 'Adderall XR', 'atomoxetine',
    'Donepezil', 'Aricept', 'memantine',
    'Trazodone 50 mg', 'Bupropion SR', 'Wellbutrin XL', 'mirtazapine',
  ];
  for (const n of PSYCH) {
    assert.equal(c(n), 'psychiatric', `${n} should be psychiatric`);
  }
});

test('THE ERROR THAT MATTERS: ordinary medications are never called psychiatric', () => {
  const MEDICAL = [
    'Lisinopril 10mg', 'Atorvastatin', 'Metformin 500 mg', 'Levothyroxine',
    'Amlodipine', 'Omeprazole', 'Albuterol inhaler', 'Aspirin 81mg',
    'Insulin glargine', 'Warfarin', 'Furosemide', 'Prednisone',
    'Ibuprofen', 'Acetaminophen', 'Vitamin D3', 'Amoxicillin',
    'Hydrochlorothiazide', 'Losartan', 'Rosuvastatin', 'Gabapentin 300mg',
  ];
  for (const n of MEDICAL) {
    assert.equal(c(n), 'medical', `${n} must NOT be called psychiatric`);
  }
});

test('dual-indication drugs are left as medical, deliberately', () => {
  // Each has a common non-psychiatric use. Asserting the psychiatric one from
  // a name alone would be a guess about why the patient takes it.
  for (const n of DUAL_INDICATION_NOT_CLASSIFIED) {
    assert.equal(c(n), 'medical', `${n} is dual-indication and must stay medical`);
  }
});

test('mood stabilisers are NOT psychiatric by default, but can be flipped', () => {
  // ATC N03. Whether they read as psychiatric depends on the indication, which
  // we do not hold — so this is Ken's call, exposed as a flag.
  for (const n of ['Lamotrigine', 'Lamictal', 'Divalproex', 'Depakote', 'Carbamazepine']) {
    assert.equal(c(n), 'medical', `${n} defaults to medical`);
    assert.equal(
      classifyMedication({ name: n }, { treatMoodStabilisersAsPsychiatric: true }),
      'psychiatric',
      `${n} flips when Ken says so`,
    );
  }
});

test('dose, form and strength do not defeat matching', () => {
  for (const n of [
    'SERTRALINE HCL 100 MG TABLET', 'quetiapine fumarate 25mg tab',
    'Aripiprazole (Abilify) 5 mg', 'zolpidem-tartrate 10mg', 'Adderall-XR 20mg',
  ]) {
    assert.equal(c(n), 'psychiatric', `${n} should still match`);
  }
});

test('the generic name is consulted when the display name is a brand we do not know', () => {
  assert.equal(
    classifyMedication({ name: 'SomeUnknownBrand', genericName: 'sertraline hydrochloride' }),
    'psychiatric',
  );
});

test('a substring is not a match — word boundaries hold', () => {
  // 'lithium' inside a longer word, and near-misses that must not trip.
  assert.equal(c('Lithotripsy follow-up'), 'medical');
  assert.equal(c('Ambient humidifier'), 'medical');
});

test('junk input is medical, never psychiatric', () => {
  for (const m of [null, undefined, {}, { name: '' }, { name: '   ' }, { name: '???' }]) {
    assert.equal(classifyMedication(m), 'medical');
  }
});

test('splitting preserves order within each bucket and drops nothing', () => {
  const meds = [
    { name: 'Lisinopril' }, { name: 'Sertraline' }, { name: 'Metformin' },
    { name: 'Quetiapine' }, { name: 'Aspirin' },
  ];
  const { medical, psychiatric } = splitByMedicationClass(meds);
  assert.deepEqual(medical.map((m) => m.name), ['Lisinopril', 'Metformin', 'Aspirin']);
  assert.deepEqual(psychiatric.map((m) => m.name), ['Sertraline', 'Quetiapine']);
  assert.equal(medical.length + psychiatric.length, meds.length, 'nothing dropped');
});

test('an empty list splits into two empty lists', () => {
  assert.deepEqual(splitByMedicationClass([]), { medical: [], psychiatric: [] });
});
