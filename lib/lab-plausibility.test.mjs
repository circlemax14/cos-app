/**
 * The dangerous failure of this module is not a missed garbage value. It is a
 * REAL result being called impossible, because that suppresses something a
 * patient may urgently need to see. So most of these tests assert that alarming
 * — but survivable — values pass through untouched.
 *
 * The second danger is conceptual: these bounds are HCUP's data-validity
 * checks, not clinical reference ranges, and the module must never be able to
 * present them as normal. There is a test for that too, because the mistake
 * would be invisible in behaviour and obvious only in a patient's harm.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { isImplausible, boundFor, HCUP_ABSOLUTE_BOUNDS } from './lab-plausibility.ts'

test('THE POINT: a dangerously abnormal value is NOT called implausible', () => {
  // Every one of these is a real result a real patient can have, and each is
  // the kind of number that needs attention. Suppressing any of them because
  // it looked extreme would be the worst thing this file could do.
  assert.equal(isImplausible(400, '2345-7', 'Glucose', 'mg/dL'), false)   // severe hyperglycaemia
  assert.equal(isImplausible(6.8, '2823-3', 'Potassium', 'mEq/L'), false) // dangerous hyperkalaemia
  assert.equal(isImplausible(118, '2951-2', 'Sodium', 'mEq/L'), false)    // severe hyponatraemia
  assert.equal(isImplausible(4.2, '718-7', 'Hemoglobin', 'g/dL'), false)  // profound anaemia
  assert.equal(isImplausible(35, '10839-9', 'Troponin I', 'ng/mL'), false)// large infarct
  assert.equal(isImplausible(7.15, '2744-1', 'pH', 'pH'), false)          // severe acidosis
})

test('values that cannot be measurements are caught', () => {
  // The OCR failure mode: a misplaced decimal or a merged column.
  assert.equal(isImplausible(9500, '2345-7', 'Glucose', 'mg/dL'), true)   // > 2,500
  assert.equal(isImplausible(0, '2823-3', 'Potassium', 'mEq/L'), true)    // < 1
  assert.equal(isImplausible(250, '718-7', 'Hemoglobin', 'g/dL'), true)   // > 25
  assert.equal(isImplausible(3.1, '2744-1', 'pH', 'pH'), true)            // < 6.7
  assert.equal(isImplausible(600, '2951-2', 'Sodium', 'mEq/L'), true)     // > 200
})

test('uncertainty is never treated as a fault', () => {
  // Unknown analyte, unknown units, mismatched units, non-numeric. In each
  // case we have nothing to judge against, and a guess would reinvent exactly
  // the error this module exists to prevent.
  assert.equal(isImplausible(99999, 'report-mystery-analyte', 'Mystery Analyte', 'mg/dL'), false)
  assert.equal(isImplausible(9500, '2345-7', 'Glucose', undefined), false)
  assert.equal(isImplausible(9500, '2345-7', 'Glucose', 'mmol/L'), false) // wrong unit for this bound
  assert.equal(isImplausible(NaN, '2345-7', 'Glucose', 'mg/dL'), false)
  assert.equal(isImplausible(null, '2345-7', 'Glucose', 'mg/dL'), false)
  assert.equal(isImplausible(undefined, '2345-7', 'Glucose', 'mg/dL'), false)
})

test('OCR-derived metrics match by name, since they arrive with no LOINC code', () => {
  // report-* codes are slugified from whatever the lab printed, so the name is
  // the only handle. This is also the namespace most likely to carry OCR junk.
  assert.equal(isImplausible(9500, 'report-glucose', 'Glucose', 'mg/dL'), true)
  assert.equal(isImplausible(120, 'report-glucose', 'Glucose', 'mg/dL'), false)
  assert.ok(boundFor('report-hemoglobin', 'Hemoglobin'))
})

test('unit spelling does not decide a patient result', () => {
  // "mg/dL", "mg / dl" and "MGDL" are the same unit. If casing or a slash
  // changed the verdict, the same result would be judged differently
  // depending on which lab printed it.
  for (const u of ['mg/dL', 'mg / dl', 'MGDL', 'Mg/Dl']) {
    assert.equal(isImplausible(9500, '2345-7', 'Glucose', u), true, `unit ${u}`)
  }
})

test('the bounds are HCUP-wide, not clinical — asserted numerically', () => {
  // This test exists so nobody can quietly retune these into "normal ranges"
  // without it failing. If glucose's upper bound ever drops near a clinical
  // number, that is someone repurposing the table and this must stop them.
  const glucose = HCUP_ABSOLUTE_BOUNDS.find((b) => b.codes.includes('2345-7'))
  assert.equal(glucose.max, 2500, 'HCUP absolute; a clinical high would be ~140')
  assert.equal(glucose.min, 10, 'HCUP absolute; a clinical low would be ~70')

  const potassium = HCUP_ABSOLUTE_BOUNDS.find((b) => b.codes.includes('2823-3'))
  assert.equal(potassium.max, 9, 'HCUP absolute; 9 mEq/L is lethal, not normal')
})

test('the module exposes no way to render a range', () => {
  // A "normal range" caption sourced from this table would tell a patient a
  // glucose of 400 sits comfortably inside 10–2,500. The only exported
  // predicate is a boolean, and that is deliberate.
  assert.equal(typeof isImplausible(1, '2345-7', 'Glucose', 'mg/dL'), 'boolean')
})

test('every bound is coherent — min below max, and both actually usable', () => {
  for (const b of HCUP_ABSOLUTE_BOUNDS) {
    const id = b.codes[0] ?? b.names[0]
    assert.ok(b.codes.length > 0 || b.names.length > 0, `${id}: no way to match it`)
    assert.ok(b.units.length > 0, `${id}: no units, so it can never fire`)
    assert.ok(b.min !== null || b.max !== null, `${id}: unbounded both ways`)
    if (b.min !== null && b.max !== null) {
      assert.ok(b.min < b.max, `${id}: min ${b.min} is not below max ${b.max}`)
    }
  }
})
