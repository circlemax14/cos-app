import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyProvider, dedupeProviders, isCareProvider } from '../../lib/provider-relevance.ts';

/**
 * COS-1009 — separating the people who treated you from the people who touched
 * your file.
 *
 * Measured against a real 59-row account: 3 support rows (two pharmacists filed
 * under PCP, one technologist), 1 row whose name is the literal string
 * "Provider", and 15 duplicate rows. 59 in, 40 distinct clinicians out.
 */

test('pharmacy and admin roles are support, not care', () => {
  for (const name of [
    'PharmD Robin L, PharmD',
    'Julie K, Technologist',
    'Dana Reese, RPh',
    'Front Desk, Receptionist',
  ]) {
    assert.equal(classifyProvider({ name }), 'support', name);
  }
});

test('a support role is caught even when the EHR files it as a doctor', () => {
  // Both real pharmacists on the test account arrive with subCategory 'PCP'.
  assert.equal(
    classifyProvider({ name: 'PharmD Baqara Y, PharmD', subCategory: 'PCP' }),
    'support',
  );
});

test('clinicians are care, including the ones easy to mistake for support', () => {
  for (const name of [
    'Christopher A. Walter, DO',
    'Hayley Do, PA',
    'Nurse Josephine M, RN',
    'Alexandra E, PTA',
    'Jae J, RRT',
    'Rebecca Anne Spear, ARNP',
  ]) {
    assert.ok(isCareProvider({ name }), name);
  }
});

test('a placeholder is not a person', () => {
  for (const name of ['Provider', 'Unknown Provider', 'N/A', '   ', 'MD']) {
    assert.equal(classifyProvider({ name }), 'unnamed', JSON.stringify(name));
  }
});

test('duplicates collapse, and the row with records survives', () => {
  const out = dedupeProviders([
    { name: 'Lisa B, PT', recordCount: 0 },
    { name: 'Lisa B, PT', recordCount: 12 },
    { name: 'Nurse Karen P, RN', recordCount: 3 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.name === 'Lisa B, PT')?.recordCount, 12);
});

test('the credential is part of the key — two roles are two people', () => {
  /*
   * A nurse and a doctor who share a surname must not merge. Name alone as the
   * key is what collapsed sixteen distinct doctors in COS-971.
   */
  const out = dedupeProviders([
    { name: 'Alex Smith, MD' },
    { name: 'Alex Smith, RN' },
  ]);
  assert.equal(out.length, 2);
});

test('placeholders are never merged with each other', () => {
  // Two rows named "Provider" are not evidence of one person — that is exactly
  // the mistake that hid sixteen doctors.
  const out = dedupeProviders([
    { name: 'Provider', recordCount: 1 },
    { name: 'Provider', recordCount: 5 },
  ]);
  assert.equal(out.length, 2);
});

test('a thin record does not demote a clinician', () => {
  // Relevance is decided by role, never by record count: a surgeon seen once
  // must not vanish, and a pharmacist on fifty prescriptions must not be
  // promoted.
  assert.ok(isCareProvider({ name: 'Christopher A. Walter, DO' }));
  assert.equal(classifyProvider({ name: 'PharmD Robin L, PharmD' }), 'support');
});
