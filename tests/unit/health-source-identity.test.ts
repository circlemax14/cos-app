/**
 * COS-930 — the label follows the device, not the codebase's history.
 *
 * A patient on a Galaxy S26 was shown "Enable Apple Health". Six user-visible
 * strings had been left hard-coded to Apple's brand when Health Connect was
 * wired underneath, including the switch label and its accessibility label.
 *
 * Pure module, so this runs under `node --test` with no React and no device.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveHealthSourceIdentity } from '../../lib/health-source-identity.ts';

test('THE POINT: a Samsung is never offered Apple Health', () => {
  const s = resolveHealthSourceIdentity('android', 'samsung');
  assert.equal(s.label, 'Samsung Health');
  assert.doesNotMatch(s.label, /Apple/);
  // ...and it is Health Connect we actually read.
  assert.equal(s.api, 'health-connect');
});

test('iOS keeps Apple Health and reads HealthKit', () => {
  const s = resolveHealthSourceIdentity('ios');
  assert.equal(s.label, 'Apple Health');
  assert.equal(s.api, 'healthkit');
  // No mechanism line: HealthKit is not something a patient enables
  // separately, and naming it introduces a word they have never seen.
  assert.equal(s.via, null);
});

test('any other Android device gets the generic word, not another brand', () => {
  // Naming Xiaomi/Huawei/OnePlus apps means a table that is wrong for whatever
  // device we did not think of, and a Pixel user told to "Enable Samsung
  // Health" is worse off than one told "Enable Health".
  for (const make of ['Google', 'xiaomi', 'OnePlus', 'motorola', 'HUAWEI', '', null, undefined]) {
    const s = resolveHealthSourceIdentity('android', make as string | null | undefined);
    assert.equal(s.label, 'Health', `manufacturer ${String(make)} should get the generic label`);
    assert.equal(s.api, 'health-connect');
    assert.equal(s.isBrandedLabel, false);
  }
});

test('manufacturer matching survives OEM casing and padding', () => {
  // Platform.constants.Manufacturer is not normalised by the OS and varies.
  for (const make of ['samsung', 'Samsung', 'SAMSUNG', '  Samsung  ']) {
    assert.equal(
      resolveHealthSourceIdentity('android', make).label,
      'Samsung Health',
      `"${make}" should be recognised as Samsung`,
    );
  }
});

test('THE POINT: Android always says how the data reaches us', () => {
  /*
   * The sentence that stops an empty screen being a mystery. Samsung Health
   * reaches Health Connect only once the patient enables that sync INSIDE
   * Samsung Health — so a button bearing their app's name over an empty screen
   * is a bug report unless we say where to look.
   */
  for (const make of ['samsung', 'google']) {
    const s = resolveHealthSourceIdentity('android', make);
    assert.ok(s.via, `${make}: via must be present on Android`);
    assert.match(s.via, /Health Connect/);
  }
  // Samsung's names the specific thing to check.
  assert.match(resolveHealthSourceIdentity('android', 'samsung').via ?? '', /Samsung Health/);
});

test('a platform with no health API is not offered one', () => {
  const s = resolveHealthSourceIdentity('web');
  assert.equal(s.api, 'none');
  assert.equal(s.via, null);
});

test('the label is always usable inline in a sentence', () => {
  // It is interpolated into "Enable X", "Could not connect to X", "we never
  // write to X". An empty or punctuated value would read as broken copy.
  for (const [os, make] of [['ios', null], ['android', 'samsung'], ['android', 'google'], ['web', null]]) {
    const { label } = resolveHealthSourceIdentity(os as string, make as string | null);
    assert.ok(label.length > 0);
    assert.doesNotMatch(label, /[.:;]$/);
    assert.equal(label, label.trim());
  }
});
