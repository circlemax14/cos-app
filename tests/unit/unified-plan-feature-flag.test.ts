/**
 * Pure-logic tests for the unified-plan feature-disabled sentinel +
 * error predicate (COS-467).
 *
 * These are the pieces that let `useUnifiedPlan` keep 404 FEATURE_DISABLED
 * out of react-query's error path — so a covering test lives here even
 * though the react-query hook itself needs a testing-library harness
 * this codebase does not yet ship.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isFeatureDisabled,
  isFeatureDisabledError,
} from '../../lib/unified-plan-feature-flag.ts';

// ── isFeatureDisabled (sentinel narrowing) ─────────────────────────

test('sentinel object → true', () => {
  assert.equal(isFeatureDisabled({ __featureDisabled: true }), true);
});

test('null → false', () => {
  assert.equal(isFeatureDisabled(null), false);
});

test('undefined → false', () => {
  assert.equal(isFeatureDisabled(undefined), false);
});

test('normal plan view object → false', () => {
  assert.equal(
    isFeatureDisabled({ meta: { generatedAt: 'x', hasLegacy: false, hasBps: true, refreshInFlight: false }, sections: {} }),
    false,
  );
});

test('object with __featureDisabled=false → false', () => {
  assert.equal(isFeatureDisabled({ __featureDisabled: false } as never), false);
});

// ── isFeatureDisabledError (raw axios error shape) ─────────────────

test('404 + code=FEATURE_DISABLED → true', () => {
  const err = { response: { status: 404, data: { code: 'FEATURE_DISABLED' } } };
  assert.equal(isFeatureDisabledError(err), true);
});

test('404 but different code → false', () => {
  const err = { response: { status: 404, data: { code: 'NOT_FOUND' } } };
  assert.equal(isFeatureDisabledError(err), false);
});

test('non-404 with FEATURE_DISABLED code → false (belt-and-suspenders)', () => {
  const err = { response: { status: 500, data: { code: 'FEATURE_DISABLED' } } };
  assert.equal(isFeatureDisabledError(err), false);
});

test('network error (no response) → false', () => {
  assert.equal(isFeatureDisabledError(new Error('Network down')), false);
});

test('null/undefined → false', () => {
  assert.equal(isFeatureDisabledError(null), false);
  assert.equal(isFeatureDisabledError(undefined), false);
});

test('response present but no data body → false', () => {
  assert.equal(isFeatureDisabledError({ response: { status: 404 } }), false);
});
