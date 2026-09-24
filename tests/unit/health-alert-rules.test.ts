/**
 * COS-1112 — Health Alerts thresholds.
 *
 * The load-bearing assertion in this file is not any single threshold: it is
 * that an ABSENT reading never becomes green. A crisis indicator that reports
 * "nothing flagged" to a patient with no data is a false reassurance, and it
 * is the one failure mode that would make this feature worse than not shipping
 * it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alertColor,
  alertShouldFlash,
  evaluateBloodPressure,
  evaluateGad7,
  evaluateGlucoseMgDl,
  evaluatePainScore,
  evaluatePhq9,
  evaluateRespirationRate,
  evaluateSpo2Percent,
  evaluateTemperatureCelsius,
  rollUpAlerts,
} from '../../lib/health-alert-rules.ts';

test('THE POINT: nothing measured is NOT green', () => {
  const r = rollUpAlerts([null, null, null]);
  assert.equal(r.level, null, 'no readings must not resolve to a level');
  assert.equal(r.measuredCount, 0);
  // And the colour must not be the reassuring one.
  assert.notEqual(alertColor(null), alertColor('none'));
});

test('every evaluator returns null for an absent or unusable reading', () => {
  const absent = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY];
  for (const v of absent) {
    assert.equal(evaluateGlucoseMgDl(v), null);
    assert.equal(evaluateSpo2Percent(v), null);
    assert.equal(evaluateRespirationRate(v), null);
    assert.equal(evaluateTemperatureCelsius(v), null);
    assert.equal(evaluatePhq9(v), null);
    assert.equal(evaluateGad7(v), null);
    assert.equal(evaluatePainScore(v), null);
    assert.equal(evaluateBloodPressure(v, 80), null);
    assert.equal(evaluateBloodPressure(120, v), null);
  }
});

test('BP: Ken’s bands, and each limb of the crisis test fires alone', () => {
  assert.equal(evaluateBloodPressure(118, 76)?.level, 'none');
  assert.equal(evaluateBloodPressure(140, 88)?.level, 'moderate');
  assert.equal(evaluateBloodPressure(130, 92)?.level, 'moderate');
  assert.equal(evaluateBloodPressure(179, 109)?.level, 'moderate');
  // Systolic alone.
  assert.equal(evaluateBloodPressure(182, 78)?.level, 'critical');
  // Diastolic alone — the case a single combined comparison would miss.
  assert.equal(evaluateBloodPressure(130, 124)?.level, 'critical');
});

test('BP moderate here is what the MONITORING rules call red — the scales differ on purpose', () => {
  // vitals-red-flag-rules calls 140/90 red. This module calls it moderate and
  // reserves critical for a hypertensive crisis. If these ever converge,
  // someone has merged two different clinical questions.
  assert.equal(evaluateBloodPressure(140, 90)?.level, 'moderate');
});

test('glucose: severe hypo and severe hyper are both critical', () => {
  assert.equal(evaluateGlucoseMgDl(54)?.level, 'critical');
  assert.equal(evaluateGlucoseMgDl(301)?.level, 'critical');
  assert.equal(evaluateGlucoseMgDl(150)?.level, 'moderate');
  assert.equal(evaluateGlucoseMgDl(65)?.level, 'moderate');
  assert.equal(evaluateGlucoseMgDl(90)?.level, 'none');
});

test('REGRESSION COS-1111: a mmol/L value must not be read as mg/dL', () => {
  // 10.0 mmol/L IS 180 mg/dL — genuinely high. Passed raw it looks like 10,
  // which this module reports as a severe LOW. That inversion shipped to
  // production once already, so the guard lives here too: the caller owes us
  // mg/dL, and the name of the function says so.
  assert.equal(evaluateGlucoseMgDl(10)?.level, 'critical');
  assert.match(evaluateGlucoseMgDl(10)?.reason ?? '', /hypoglyc/i);
  // The real value, correctly converted, is the opposite verdict.
  assert.equal(evaluateGlucoseMgDl(180)?.level, 'moderate');
});

test('SpO2: a 0..1 fraction is rejected, not reported as a desaturation', () => {
  // HealthKit returns a fraction. Reporting 0.97 as "1% — severe hypoxaemia"
  // would be the COS-1111 bug in a new metric.
  assert.equal(evaluateSpo2Percent(0.97), null);
  assert.equal(evaluateSpo2Percent(1), null);
  assert.equal(evaluateSpo2Percent(97)?.level, 'none');
  assert.equal(evaluateSpo2Percent(92)?.level, 'moderate');
  assert.equal(evaluateSpo2Percent(89)?.level, 'critical');
});

test('respiration: critical at both ends', () => {
  assert.equal(evaluateRespirationRate(9)?.level, 'critical');
  assert.equal(evaluateRespirationRate(26)?.level, 'critical');
  assert.equal(evaluateRespirationRate(22)?.level, 'moderate');
  assert.equal(evaluateRespirationRate(16)?.level, 'none');
});

test('temperature is CELSIUS — a Fahrenheit value would be absurd, not silently graded', () => {
  assert.equal(evaluateTemperatureCelsius(36.8)?.level, 'none');
  assert.equal(evaluateTemperatureCelsius(38.5)?.level, 'moderate');
  assert.equal(evaluateTemperatureCelsius(40.5)?.level, 'critical');
  // 98.6°F passed by mistake grades critical, which is loud and wrong — the
  // opposite of silent. Documented so nobody "fixes" it by widening the band.
  assert.equal(evaluateTemperatureCelsius(98.6)?.level, 'critical');
});

test('PHQ-9 and GAD-7 use their published bands', () => {
  assert.equal(evaluatePhq9(4)?.level, 'none');
  assert.equal(evaluatePhq9(12)?.level, 'moderate');
  assert.equal(evaluatePhq9(21)?.level, 'critical');
  assert.equal(evaluateGad7(4)?.level, 'none');
  assert.equal(evaluateGad7(11)?.level, 'moderate');
  assert.equal(evaluateGad7(16)?.level, 'critical');
});

test('pain: out-of-range input is rejected rather than clamped', () => {
  assert.equal(evaluatePainScore(11), null);
  assert.equal(evaluatePainScore(-1), null);
  assert.equal(evaluatePainScore(8)?.level, 'critical');
  assert.equal(evaluatePainScore(5)?.level, 'moderate');
  assert.equal(evaluatePainScore(2)?.level, 'none');
});

test('roll-up takes the worst level and orders firing verdicts worst-first', () => {
  const r = rollUpAlerts([
    evaluateSpo2Percent(97),
    evaluateBloodPressure(145, 92),
    evaluateRespirationRate(28),
    null,
  ]);
  assert.equal(r.level, 'critical');
  assert.equal(r.firing[0].level, 'critical');
  assert.equal(r.firing[1].level, 'moderate');
  assert.equal(r.clear.length, 1);
  assert.equal(r.measuredCount, 3);
});

test('all-clear resolves to none, and only critical flashes', () => {
  const r = rollUpAlerts([evaluateSpo2Percent(98), evaluateBloodPressure(118, 74)]);
  assert.equal(r.level, 'none');
  assert.equal(r.firing.length, 0);
  assert.equal(alertShouldFlash('none'), false);
  assert.equal(alertShouldFlash('moderate'), false);
  assert.equal(alertShouldFlash('critical'), true);
  assert.equal(alertShouldFlash(null), false);
});

test('one unusable reading among good ones does not drag the roll-up to unknown', () => {
  const r = rollUpAlerts([evaluateSpo2Percent(0.97), evaluateBloodPressure(118, 74)]);
  assert.equal(r.level, 'none');
  assert.equal(r.measuredCount, 1);
});
