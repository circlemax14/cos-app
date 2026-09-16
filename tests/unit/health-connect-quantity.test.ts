/**
 * COS-938 — reading a Health Connect quantity.
 *
 * The bug: Health Connect has TWO shapes for the same physical quantity —
 * a RECORD field `{ value, unit }` and an AGGREGATE `{ inGrams, inKilograms }`.
 * Six trend readers used the aggregate spelling on record fields, so blood
 * pressure, active energy, blood glucose, body temperature, weight and
 * distance returned null for every sample.
 *
 * On screen that is indistinguishable from "this patient has no data", which
 * is exactly the state we spent days trying to diagnose. Hence these tests:
 * a wrong reader must fail here, not look like an empty store on a device.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readAggregate, readQuantity } from '../../lib/health-connect-quantity.ts';

test('THE POINT: a record field is { value, unit }, not { inX }', () => {
  // The exact shape the broken readers assumed, which yields nothing.
  assert.equal(readQuantity({ inKilograms: 78.4 }, 'mass-lb'), null);
  // ...and the shape a record actually has.
  const lb = readQuantity({ value: 100, unit: 'kilograms' }, 'mass-lb');
  assert.ok(lb !== null);
  assert.equal(Math.round(lb), 220);
});

test('THE POINT: the unit is read, never assumed', () => {
  /*
   * Health Connect stores whatever the writing app chose, so the same field
   * can arrive in kilograms from one app and pounds from another ON THE SAME
   * DEVICE. Taking .value and ignoring .unit is a 2.2x error in a clinical
   * number, appearing only for patients whose app disagrees with ours.
   */
  assert.equal(readQuantity({ value: 150, unit: 'pounds' }, 'mass-lb'), 150);
  const fromKg = readQuantity({ value: 150, unit: 'kilograms' }, 'mass-lb');
  assert.ok(fromKg !== null && Math.round(fromKg) === 331);
});

test('temperature converts on the offset scale, not by a factor', () => {
  // A multiplier is wrong for temperature and would be wrong by ~32 at body
  // temperature — plausible enough to ship.
  assert.equal(readQuantity({ value: 0, unit: 'celsius' }, 'temperature-f'), 32);
  assert.equal(readQuantity({ value: 37, unit: 'celsius' }, 'temperature-f'), 98.6);
  assert.equal(readQuantity({ value: 98.6, unit: 'fahrenheit' }, 'temperature-f'), 98.6);
});

test('each kind converts to the unit iOS reports', () => {
  // Both platforms must emit one metricCode in one unit, or a patient
  // switching device gets a discontinuity in their own trend.
  const miles = readQuantity({ value: 1609.344, unit: 'meters' }, 'length-miles');
  assert.ok(miles !== null && Math.abs(miles - 1) < 1e-9);

  const kcal = readQuantity({ value: 1000, unit: 'calories' }, 'energy-kcal');
  assert.equal(kcal, 1);

  assert.equal(readQuantity({ value: 120, unit: 'millimetersOfMercury' }, 'pressure-mmhg'), 120);

  const mgdl = readQuantity({ value: 5.5, unit: 'millimolesPerLiter' }, 'glucose-mgdl');
  assert.ok(mgdl !== null && Math.round(mgdl) === 99);
});

test('THE POINT: an unknown unit is a GAP, not a raw number', () => {
  /*
   * A weight of "78" that might be kilograms or pounds is worse than missing:
   * a gap is visibly absent, a wrong number is quietly acted on. If Health
   * Connect adds a unit we do not know, the metric goes silent until someone
   * adds the conversion.
   */
  assert.equal(readQuantity({ value: 78, unit: 'stones' }, 'mass-lb'), null);
  assert.equal(readQuantity({ value: 78, unit: 'kelvin' }, 'temperature-f'), null);
  assert.equal(readQuantity({ value: 78 }, 'mass-lb'), null, 'a missing unit reads as unknown');
});

test('a plain number passes through — some record fields have no unit', () => {
  // percentage, rate and count are bare numbers on their records. One reader
  // means a caller cannot pick the wrong one.
  assert.equal(readQuantity(97, 'pressure-mmhg'), 97);
  assert.equal(readQuantity(Number.NaN, 'pressure-mmhg'), null);
});

test('junk in gives null out, never NaN', () => {
  // NaN would flow into a chart and into trendDirection arithmetic.
  for (const junk of [null, undefined, 'x', {}, { value: 'x', unit: 'kilograms' }, []]) {
    assert.equal(readQuantity(junk, 'mass-lb'), null, `${JSON.stringify(junk)}`);
  }
});

test('readAggregate is the OTHER shape, kept separate on purpose', () => {
  /*
   * Aggregates really do use `inX` keys. The two functions are separate rather
   * than one with a mode flag, because a mode flag preserves exactly the
   * ambiguity that caused the bug.
   */
  assert.equal(readAggregate({ inKilocalories: 240, inJoules: 1 }, 'inKilocalories'), 240);
  assert.equal(readAggregate({ value: 240, unit: 'kilocalories' }, 'inKilocalories'), null);
  // COUNT_TOTAL and BPM_AVG are genuinely plain numbers.
  assert.equal(readAggregate(4213, ''), 4213);
});
