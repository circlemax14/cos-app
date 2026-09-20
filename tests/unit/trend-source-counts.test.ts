/**
 * COS-1072 — Home and the Trends screen must show the SAME number.
 *
 * Home said "11 things we track". The Health Trends screen said 106. Same
 * component, same words, same patient — because each screen fed
 * `buildTrendSources` whatever it had in hand:
 *
 *   Home:          { clinic: 0, checkins: 0, devices: healthKit.length }
 *   Health Trends: three deduped buckets
 *
 * COS-1045 shared the COMPONENT so two screens could not describe the same
 * data two ways. The counts stayed behind and did exactly that. These tests
 * cover the derivation both now share.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTrendSourceCounts,
  clinicTrendsFrom,
} from '../../lib/trend-source-counts.ts';

const t = (metricCode: string, metricName = metricCode) => ({ metricCode, metricName });

describe('COS-1072 — clinic trends', () => {
  test('backend and report trends combine', () => {
    const out = clinicTrendsFrom([t('glucose')], [t('ldl')]);
    assert.equal(out.length, 2);
  });

  test('THE POINT: a report trend the backend already covers is not counted twice', () => {
    /*
     * A lab panel that arrives both as an Observation and inside a report is
     * ONE thing tracked. Backend wins — it is the higher-fidelity source.
     */
    const out = clinicTrendsFrom([t('glucose', 'Glucose')], [t('glucose', 'Glucose')]);
    assert.equal(out.length, 1);
  });

  test('the collision check is case-insensitive on BOTH code and name', () => {
    assert.equal(clinicTrendsFrom([t('GLUCOSE', 'Glucose')], [t('glucose', 'x')]).length, 1);
    assert.equal(clinicTrendsFrom([t('a', 'Glucose')], [t('b', 'GLUCOSE')]).length, 1);
  });
});

describe('COS-1072 — the three counts', () => {
  const base = { backend: [], reports: [], healthKit: [], assessments: [] };

  test('THE POINT: a device metric the clinic already tracks is not a second thing', () => {
    /*
     * Clinic measures heart rate; so does the watch. That is one measure with
     * two sources, and counting it twice teaches the patient something false
     * about where their records come from.
     */
    const c = computeTrendSourceCounts({
      ...base,
      backend: [t('heart-rate')],
      healthKit: [t('heart-rate'), t('steps')],
    });
    assert.equal(c.clinic, 1);
    assert.equal(c.devices, 1);
  });

  test('THE POINT: check-ins count DISTINCT INSTRUMENTS, not submissions', () => {
    // PHQ-9 weekly for a year is one instrument, not fifty-two.
    const c = computeTrendSourceCounts({
      ...base,
      assessments: [{ instrumentId: 'phq-9' }, { instrumentId: 'phq-9' }, { instrumentId: 'gad-7' }],
    });
    assert.equal(c.checkins, 2);
  });

  test('empty everything is three zeroes, not a crash', () => {
    assert.deepEqual(computeTrendSourceCounts(base), { clinic: 0, checkins: 0, devices: 0 });
  });

  test("THE POINT: Home's old shape would have under-reported", () => {
    /*
     * The exact regression. Home hard-coded clinic:0 and checkins:0 and used a
     * raw device count; the real answer counts all three and dedupes.
     */
    const input = {
      backend: [t('glucose'), t('ldl')],
      reports: [t('hdl')],
      healthKit: [t('steps'), t('glucose')],
      assessments: [{ instrumentId: 'phq-9' }],
    };
    const real = computeTrendSourceCounts(input);
    assert.deepEqual(real, { clinic: 3, checkins: 1, devices: 1 });

    const homesOldAnswer = 0 + 0 + input.healthKit.length; // 2
    const total = real.clinic + real.checkins + real.devices; // 5
    assert.notEqual(homesOldAnswer, total);
  });
});
