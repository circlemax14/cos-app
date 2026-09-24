/**
 * COS-1111 — HealthKit must be asked for the unit we store and threshold in.
 *
 * react-native-health defaults blood glucose to mmol/L
 * (RCTAppleHealthKit+Methods_Results.m:19-21). We passed no `unit` key, so
 * every iOS glucose reading arrived in mmol/L and was labelled and evaluated
 * as mg/dL.
 *
 * The failure INVERTS rather than merely shifting. A real 180 mg/dL is
 * 10.0 mmol/L, so evaluateGlucose(10) returned "Glucose below 70 mg/dL" — an
 * amber HYPOglycaemia flag on a hyperglycaemic reading. That flag is POSTed to
 * the backend and feeds the AI health summary, and vitals_red_flag_enabled is
 * true on production.
 *
 * Source-text contract: no @/ alias is available to node --test, and the read
 * path needs a real device, so the guard is on the source itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HEALTH = readFileSync(new URL('../../services/health.ts', import.meta.url), 'utf8');

/**
 * One VITAL_SPECS entry, from its metricCode to the start of the next spec.
 * Slicing at the first "}," would stop inside refRange.
 */
function specBlock(metricCode) {
  const start = HEALTH.indexOf(`metricCode: '${metricCode}'`);
  assert.ok(start > -1, `spec ${metricCode} not found`);
  const rest = HEALTH.slice(start + 1);
  const next = rest.indexOf('metricCode:');
  return next === -1 ? rest : rest.slice(0, next);
}

test('THE POINT: glucose explicitly requests mg/dL, never the mmol/L default', () => {
  const block = specBlock('hk-glucose');
  assert.match(block, /hkUnit:\s*'mgPerdL'/, 'hk-glucose must pin hkUnit to mgPerdL');
  assert.match(block, /unit:\s*'mg\/dL'/, 'and must still be stored as mg/dL');
});

test('the requested unit actually reaches the native options object', () => {
  // Pinning the spec is useless if nothing forwards it. There are two fetch
  // paths (daily series and latest sample) and BOTH must forward it — the
  // first version of this fix patched only one.
  const forwards = HEALTH.match(/\.\.\.\(spec\.hkUnit \? \{ unit: spec\.hkUnit \} : \{\}\)/g) ?? [];
  assert.equal(forwards.length, 2, 'both HealthInputOptions builders must forward spec.hkUnit');
});

test('SpO2 keeps its fraction→percent scale (regression)', () => {
  // The sibling defect class: HealthKit returns SpO2 as 0..1. Removing this
  // would report every patient at 0.97% saturation.
  assert.match(specBlock('hk-spo2'), /scale:\s*\(v\)\s*=>\s*v \* 100/);
});

test('body temperature is Celsius on iOS and is NOT given an hkUnit override', () => {
  // react-native-health defaults body temperature to degreeCelsius
  // (RCTAppleHealthKit+Methods_Vitals.m:321), which already matches our spec.
  // An override here would reintroduce exactly the bug above.
  const block = specBlock('hk-body-temp');
  assert.match(block, /unit:\s*'°C'/);
  assert.doesNotMatch(block, /hkUnit/, 'Celsius is already the native default — do not override');
});
