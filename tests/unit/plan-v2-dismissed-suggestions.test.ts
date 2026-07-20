/**
 * Pure-logic tests for the dismissed-suggestion predicate (COS-475).
 * Uses only the pure `isDismissed` helper — AsyncStorage-touching
 * functions are exercised in the RTL integration tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISMISS_TTL_MS,
  isDismissed,
} from '../../lib/plan-v2/dismissed-suggestions.ts';

const NOW = 1_800_000_000_000;

test('returns false when maps are null/empty', () => {
  assert.equal(isDismissed('id', NOW, null, null), false);
  assert.equal(isDismissed('id', NOW, {}, {}), false);
});

test('returns true within the 7d TTL', () => {
  const dismissed = { id: NOW - DISMISS_TTL_MS / 2 };
  assert.equal(isDismissed('id', NOW, dismissed, null), true);
});

test('returns false past the 7d TTL', () => {
  const dismissed = { id: NOW - DISMISS_TTL_MS - 1 };
  assert.equal(isDismissed('id', NOW, dismissed, null), false);
});

test('non-numeric / zero timestamps do not count as dismissed', () => {
  // @ts-expect-error — runtime bad value
  assert.equal(isDismissed('id', NOW, { id: 'nope' }, null), false);
  assert.equal(isDismissed('id', NOW, { id: 0 }, null), false);
});

test('snoozeUntil > now dismisses', () => {
  const snoozed = { id: NOW + 1000 };
  assert.equal(isDismissed('id', NOW, null, snoozed), true);
});

test('snoozeUntil <= now does not dismiss', () => {
  const snoozed = { id: NOW - 1 };
  assert.equal(isDismissed('id', NOW, null, snoozed), false);
});

test('either map alone can dismiss', () => {
  assert.equal(isDismissed('id', NOW, { id: NOW }, {}), true);
  assert.equal(isDismissed('id', NOW, {}, { id: NOW + 60_000 }), true);
});
