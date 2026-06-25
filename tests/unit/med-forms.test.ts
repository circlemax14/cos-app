import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MED_FORMS_ENABLED,
  DEFAULT_MED_FORM,
  DEFAULT_MED_CADENCE,
  CADENCE_OPTIONS,
  normalizeForm,
  normalizeCadence,
  supplyUnitLabel,
  formTagLabel,
  cadenceLabel,
} from '../../lib/med-forms.ts';

// ─── Kill-switch default ────────────────────────────────────────────────────

test('MED_FORMS_ENABLED is enabled (COS-375 rollout — backend med_forms_enabled is live)', () => {
  assert.equal(MED_FORMS_ENABLED, true);
});

// ─── Defaults ───────────────────────────────────────────────────────────────

test('defaults: missing form is a consumable, missing cadence is daily', () => {
  assert.equal(DEFAULT_MED_FORM, 'consumable');
  assert.equal(DEFAULT_MED_CADENCE, 'daily');
});

// ─── normalizeForm ──────────────────────────────────────────────────────────

test('normalizeForm: only "injectable" is injectable; everything else is consumable', () => {
  assert.equal(normalizeForm('injectable'), 'injectable');
  assert.equal(normalizeForm('consumable'), 'consumable');
  // Back-compat: absent / null / unknown collapse to the default consumable.
  assert.equal(normalizeForm(null), 'consumable');
  assert.equal(normalizeForm(undefined), 'consumable');
  assert.equal(normalizeForm(''), 'consumable');
  assert.equal(normalizeForm('pill'), 'consumable');
});

// ─── normalizeCadence ───────────────────────────────────────────────────────

test('normalizeCadence: known cadences pass through; unknown collapses to daily', () => {
  assert.equal(normalizeCadence('daily'), 'daily');
  assert.equal(normalizeCadence('weekly'), 'weekly');
  assert.equal(normalizeCadence('biweekly'), 'biweekly');
  assert.equal(normalizeCadence('monthly'), 'monthly');
  assert.equal(normalizeCadence(null), 'daily');
  assert.equal(normalizeCadence(undefined), 'daily');
  assert.equal(normalizeCadence('yearly'), 'daily');
});

// ─── supplyUnitLabel ────────────────────────────────────────────────────────

test('supplyUnitLabel: form-appropriate units', () => {
  assert.equal(supplyUnitLabel('consumable'), 'pills/tablets/mL');
  assert.equal(supplyUnitLabel('injectable'), 'pens/vials/doses');
  // Unknown / missing falls back to the consumable (pre-feature) label.
  assert.equal(supplyUnitLabel(null), 'pills/tablets/mL');
  assert.equal(supplyUnitLabel(undefined), 'pills/tablets/mL');
});

// ─── formTagLabel ───────────────────────────────────────────────────────────

test('formTagLabel: Injectable vs Oral', () => {
  assert.equal(formTagLabel('injectable'), 'Injectable');
  assert.equal(formTagLabel('consumable'), 'Oral');
  assert.equal(formTagLabel(null), 'Oral');
});

// ─── cadenceLabel ───────────────────────────────────────────────────────────

test('cadenceLabel: human-readable per cadence', () => {
  assert.equal(cadenceLabel('daily'), 'Daily');
  assert.equal(cadenceLabel('weekly'), 'Weekly');
  assert.equal(cadenceLabel('biweekly'), 'Every 2 weeks');
  assert.equal(cadenceLabel('monthly'), 'Monthly');
  // Unknown / missing → daily label.
  assert.equal(cadenceLabel(null), 'Daily');
  assert.equal(cadenceLabel('annually'), 'Daily');
});

// ─── CADENCE_OPTIONS ────────────────────────────────────────────────────────

test('CADENCE_OPTIONS: ordered set covering every cadence exactly once', () => {
  assert.deepEqual(CADENCE_OPTIONS, ['daily', 'weekly', 'biweekly', 'monthly']);
  // Every option must round-trip through normalize + have a label.
  for (const c of CADENCE_OPTIONS) {
    assert.equal(normalizeCadence(c), c);
    assert.equal(typeof cadenceLabel(c), 'string');
    assert.ok(cadenceLabel(c).length > 0);
  }
});
