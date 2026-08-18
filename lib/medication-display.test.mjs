/**
 * How a medication row reads.
 *
 * These exist because the card's hierarchy was backwards: provenance was the
 * loudest thing on it and the dose was the quietest. Most of that is layout,
 * but the parts that CAN be tested — what the times say, what we assert about
 * the class, and which tags earn their space — are pinned here.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classMark,
  doseLine,
  formTagIfNotable,
  formatTimeLabel,
  formatTimes,
  provenanceLabel,
} from './medication-display.ts'

test('times read as a person says them, not as they are stored', () => {
  // "08:00, 14:00, 20:00, 02:00" is a string a patient has to decode.
  assert.equal(formatTimeLabel('08:00'), '8am')
  assert.equal(formatTimeLabel('14:00'), '2pm')
  assert.equal(formatTimeLabel('02:00'), '2am')
  assert.equal(formatTimes(['08:00', '14:00', '20:00', '02:00']), '8am · 2pm · 8pm · 2am')
})

test('midnight and noon do not collapse into each other', () => {
  // The classic 12-hour bug: both would read "12" with a naive modulo.
  assert.equal(formatTimeLabel('00:00'), '12am')
  assert.equal(formatTimeLabel('12:00'), '12pm')
  assert.equal(formatTimeLabel('00:30'), '12:30am')
  assert.equal(formatTimeLabel('12:30'), '12:30pm')
})

test('minutes survive when they matter, and vanish when they do not', () => {
  assert.equal(formatTimeLabel('19:30'), '7:30pm')
  assert.equal(formatTimeLabel('19:00'), '7pm')
})

test('an unparseable time is shown, not swallowed', () => {
  // Dropping a dose time silently is worse than printing whatever we stored.
  assert.equal(formatTimeLabel('bedtime'), 'bedtime')
  assert.equal(formatTimeLabel('with meals'), 'with meals')
  assert.equal(formatTimeLabel('99:99'), '99:99')
  assert.equal(formatTimeLabel(''), '')
  assert.equal(formatTimeLabel(null), '')
})

test('no times means no schedule line at all', () => {
  assert.equal(formatTimes([]), '')
  assert.equal(formatTimes(null), '')
  assert.equal(formatTimes(undefined), '')
})

test('THE CONFIDENCE ONE: only psychiatric is asserted', () => {
  // classifyMedication returns 'medical' for anything not on its curated
  // list, INCLUDING psychiatric drugs it does not know. Marking that as a
  // finding would have the app claim "this is medical" when what it knows is
  // "this is not in my psychiatric list".
  assert.equal(classMark('psychiatric').show, true)
  assert.equal(classMark('psychiatric').label, 'psychiatric')
  assert.equal(classMark('medical').show, false)
  // An unrecognised value must not start asserting things either.
  assert.equal(classMark('unknown').show, false)
  assert.equal(classMark('').show, false)
})

test('a tag that is true of every row does not earn its space', () => {
  // "ORAL" appeared on every card, which is information-free. An injectable
  // is worth calling out because it changes what the patient does.
  assert.equal(formTagIfNotable(false), null)
  assert.equal(formTagIfNotable(true), 'injectable')
})

test('provenance is a footnote, not a shout', () => {
  // It was a bordered, filled, uppercase chip competing with the drug name.
  const ehr = provenanceLabel(true)
  const manual = provenanceLabel(false)
  assert.equal(ehr, ehr.toLowerCase(), 'no caps')
  assert.equal(manual, manual.toLowerCase(), 'no caps')
  assert.match(ehr, /records/)
  assert.match(manual, /added by you/)
})

test('a missing dose says so rather than leaving a blank', () => {
  // An empty line where the instruction belongs reads as a rendering bug, and
  // a patient whose dose we never captured needs to see that we do not have it.
  assert.equal(doseLine('500 mg', 'twice daily'), '500 mg · twice daily')
  assert.equal(doseLine('500 mg', null), '500 mg')
  assert.equal(doseLine(null, 'twice daily'), 'twice daily')
  assert.equal(doseLine(null, null), 'No dose set')
  assert.equal(doseLine('   ', '  '), 'No dose set')
})
