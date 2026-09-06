/**
 * COS-927 — height conversion.
 *
 * Pure and separate so it can run under `node --test`. Getting this wrong is
 * not cosmetic: `height_in` feeds BMI (703 * lb / in²), which feeds the health
 * age and the care plan. A height that is wrong by a factor of 2.54 produces a
 * BMI wrong by a factor of 6.45.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cmToInches,
  formatHeight,
  ftInToInches,
  inchesToCm,
  inchesToFtIn,
  preferredUnitFor,
} from '../../lib/height-units.ts';

test('the two units agree on the same person', () => {
  // 5 ft 11 in is 180 cm to the nearest centimetre.
  assert.equal(ftInToInches(5, 11), 71);
  assert.equal(inchesToCm(71), 180);
});

test('THE POINT: a whole number of centimetres survives the round trip', () => {
  // The reason cmToInches keeps two decimals. At one decimal, 182 cm stores as
  // 71.7 in and reads back as 182.1 cm — the patient sees a number they did not
  // type, on a screen whose whole job is confirming what they told us.
  for (const cm of [150, 160, 165, 170, 175, 180, 182, 185, 190, 200]) {
    const inches = cmToInches(cm);
    assert.ok(inches !== null);
    assert.equal(inchesToCm(inches), cm, `${String(cm)} cm did not survive the round trip`);
  }
});

test('THE POINT: feet and inches never renders "5 ft 12 in"', () => {
  /*
   * The bug the rounding order exists to prevent. 71.65 inches split naively is
   * 5 ft and 11.65 in; rounding the inches part alone gives 12, so the display
   * says "5 ft 12 in" — which is not how anyone states a height, and reads as
   * broken. Total inches are rounded first, so the feet carry.
   */
  const parts = inchesToFtIn(71.65);
  assert.deepEqual(parts, { feet: 6, inches: 0 });

  // Exhaustively: the inches part is ALWAYS 0-11, for every tenth of an inch
  // across the whole plausible human range.
  for (let tenths = 360; tenths <= 960; tenths++) {
    const p = inchesToFtIn(tenths / 10);
    assert.ok(p !== null);
    assert.ok(p.inches >= 0 && p.inches <= 11, `${String(tenths / 10)} in gave ${String(p.inches)}`);
  }
});

test('an inches part of 12 or more is understood, not rejected', () => {
  // Someone who types 5 ft 13 in means 6 ft 1 in. Refusing it is worse than
  // understanding it.
  assert.equal(ftInToInches(5, 13), 73);
  assert.deepEqual(inchesToFtIn(73), { feet: 6, inches: 1 });
});

test('nothing answered reads as nothing, never as zero', () => {
  // A placeholder that reads like an answer is how someone skips a question
  // believing they filled it in.
  assert.equal(formatHeight(null, 'cm'), null);
  assert.equal(formatHeight(undefined, 'ftin'), null);
  assert.equal(formatHeight(0, 'cm'), null);
  assert.equal(cmToInches(0), null);
  assert.equal(ftInToInches(0, 0), null);
});

test('junk in gives null out, not NaN', () => {
  // NaN would be stored, and `typeof NaN === 'number'` passes the server's
  // validator — a silently corrupt height that only shows up as a wrong BMI.
  assert.equal(cmToInches(Number.NaN), null);
  assert.equal(cmToInches(Number.POSITIVE_INFINITY), null);
  assert.equal(cmToInches(-5), null);
  assert.equal(ftInToInches(Number.NaN, 4), null);
  assert.equal(ftInToInches(5, Number.NaN), null);
  assert.equal(ftInToInches(-1, 4), null);
  assert.equal(inchesToFtIn(Number.NaN), null);
  assert.equal(inchesToCm(Number.NaN), null);
});

test('formatting says it the way a person would', () => {
  assert.equal(formatHeight(71, 'ftin'), '5 ft 11 in');
  assert.equal(formatHeight(71, 'cm'), '180 cm');
  assert.equal(formatHeight(72, 'ftin'), '6 ft 0 in');
});

test('a returning patient lands on the unit they used last time', () => {
  // Derived from the value rather than a stored preference that would have to
  // be kept in sync. A whole number of inches was typed as feet and inches; a
  // fractional one was converted from centimetres.
  assert.equal(preferredUnitFor(71), 'ftin');
  assert.equal(preferredUnitFor(71.65), 'cm');
  // Nothing on file: ft/in, which is the unit we store.
  assert.equal(preferredUnitFor(null), 'ftin');
  assert.equal(preferredUnitFor(0), 'ftin');
});

test('the range the server enforces is expressible in both units', () => {
  // The question is min 36 / max 96 INCHES. A patient typing centimetres must
  // be able to reach both ends, or the toggle would offer a unit that cannot
  // answer the question.
  const low = cmToInches(92); // ~3 ft
  const high = cmToInches(243); // ~8 ft
  assert.ok(low !== null && low >= 36, 'the bottom of the range is reachable in cm');
  assert.ok(high !== null && high <= 96, 'the top of the range is reachable in cm');
});
