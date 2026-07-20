/**
 * Pure-logic tests for the round-2 per-user AsyncStorage key builders
 * (COS-475). Storage I/O is exercised in the RTL integration tests;
 * here we just prove the key shape is stable across releases so no one
 * regresses back to device-wide leaks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dismissedKeyFor,
  snoozedKeyFor,
  LEGACY_DISMISSED_KEY,
  LEGACY_SNOOZED_KEY,
} from '../../lib/plan-v2/dismissed-suggestions.ts';
import {
  hideReadingsKeyFor,
  LEGACY_KEY_PREFIX,
} from '../../lib/plan-v2/hide-readings.ts';

const SUB = 'a1b2-c3d4-e5f6';

test('dismissed / snoozed keys embed the userSub', () => {
  assert.equal(dismissedKeyFor(SUB), `planV2:${SUB}:suggestion:dismissed`);
  assert.equal(snoozedKeyFor(SUB), `planV2:${SUB}:suggestion:snoozed`);
});

test('legacy dismissed/snoozed keys are the pre-round-2 device-wide names', () => {
  assert.equal(LEGACY_DISMISSED_KEY, 'planV2:suggestion:dismissed');
  assert.equal(LEGACY_SNOOZED_KEY, 'planV2:suggestion:snoozed');
});

test('hide-readings key is per-user AND per-section', () => {
  assert.equal(
    hideReadingsKeyFor(SUB, 'biological'),
    `planV2:${SUB}:hideReadings:biological`,
  );
  assert.equal(
    hideReadingsKeyFor(SUB, 'psychological'),
    `planV2:${SUB}:hideReadings:psychological`,
  );
  assert.equal(
    hideReadingsKeyFor(SUB, 'socialSpiritual'),
    `planV2:${SUB}:hideReadings:socialSpiritual`,
  );
});

test('legacy hide-readings prefix is the pre-round-2 device-wide name', () => {
  assert.equal(LEGACY_KEY_PREFIX, 'planV2:hideReadings:');
});

test('different subs produce different keys (no accidental sharing)', () => {
  assert.notEqual(dismissedKeyFor('user-1'), dismissedKeyFor('user-2'));
  assert.notEqual(hideReadingsKeyFor('user-1', 'biological'), hideReadingsKeyFor('user-2', 'biological'));
});

test('all per-user keys start with the planV2: prefix (PHI purge sweep matches)', () => {
  assert.equal(dismissedKeyFor(SUB).startsWith('planV2:'), true);
  assert.equal(snoozedKeyFor(SUB).startsWith('planV2:'), true);
  assert.equal(hideReadingsKeyFor(SUB, 'biological').startsWith('planV2:'), true);
});
