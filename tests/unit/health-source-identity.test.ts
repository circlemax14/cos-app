/**
 * COS-930 — the label follows the device, not the codebase's history.
 *
 * A patient on a Galaxy S26 was shown "Enable Apple Health". Six user-visible
 * strings had been left hard-coded to Apple's brand when Health Connect was
 * wired underneath, including the switch label and its accessibility label.
 *
 * Pure module, so this runs under `node --test` with no React and no device.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveHealthSourceIdentity } from '../../lib/health-source-identity.ts';

test('THE POINT: Android is Health Connect, whatever the handset', () => {
  /*
   * COS-935. The earlier version named the OEM app — "Samsung Health" on a
   * Samsung — reasoning that the brand is what a patient recognises. Vishal
   * asked what the two things actually ARE, and the answer showed the label
   * was a category error:
   *
   *   Apple Health   is a hub AND an app. iOS has one component.
   *   Health Connect is the hub.
   *   Samsung Health is a recorder that writes into it — Android's Apple
   *                  Watch, not its Apple Health.
   *
   * Calling the feature "Samsung Health" was the same mistake as calling the
   * iOS feature "Apple Watch", and it promised something we do not do: we read
   * Health Connect, which holds Samsung Health, Fitbit and Google Fit together.
   */
  for (const make of ['samsung', 'Samsung', 'google', 'xiaomi', 'OnePlus', '', null, undefined]) {
    const s = resolveHealthSourceIdentity('android', make as string | null | undefined);
    assert.equal(s.label, 'Health Connect', `manufacturer ${String(make)}`);
    assert.equal(s.api, 'health-connect');
  }
});

test('no OEM app is ever named as the feature', () => {
  // There is no table of manufacturer apps to keep in sync, and no device can
  // be told to enable a product we do not read.
  const src = readFileSync(new URL('../../lib/health-source-identity.ts', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const brand of ['Samsung Health', 'Google Fit', 'Fitbit', 'Mi Fitness', 'Huawei Health']) {
    assert.ok(
      !new RegExp(`label: '${brand}'`).test(code),
      `${brand} must not be used as the feature LABEL`,
    );
  }
});

test('iOS keeps Apple Health and reads HealthKit', () => {
  const s = resolveHealthSourceIdentity('ios');
  assert.equal(s.label, 'Apple Health');
  assert.equal(s.api, 'healthkit');
  // No mechanism line: Apple Health is hub and recorder in one, so there is no
  // second app for the patient to go and switch on.
  assert.equal(s.via, null);
});

test('THE POINT: Android always says how the data reaches us', () => {
  /*
   * The two-app split is the single most common reason an Android patient sees
   * an empty screen: Samsung Health, Fitbit and Google Fit only reach Health
   * Connect once the patient turns that sync on inside THAT app. iOS needs no
   * equivalent sentence because Apple Health is both halves at once.
   *
   * So the RECORDERS are named here — in the explanation of where data comes
   * from — while the FEATURE is named Health Connect. That is the distinction
   * the label got wrong.
   */
  for (const make of ['samsung', 'google', null]) {
    const s = resolveHealthSourceIdentity('android', make);
    assert.ok(s.via, `${String(make)}: via must be present on Android`);
    assert.match(s.via, /Health Connect/);
    assert.match(s.via, /Samsung Health/);
  }
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
