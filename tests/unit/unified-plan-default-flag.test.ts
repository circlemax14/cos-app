/**
 * Pure-logic tests for Phase 4's default-flip predicate (COS-469).
 *
 * The React hook wrapper (`useUnifiedPlanDefaultEnabled`) isn't
 * covered here — this codebase doesn't ship a testing-library harness
 * yet. Everything unit-testable lives in the pure module.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAN_BPS_UNIFIED_DEFAULT_FLAG,
  isUnifiedPlanDefaultEnabled,
  pickDefaultPlanRoute,
} from '../../lib/unified-plan-default-flag.ts';

// ── pickDefaultPlanRoute ────────────────────────────────────────────

test('flag strictly true → unified-plan', () => {
  assert.equal(
    pickDefaultPlanRoute({ [PLAN_BPS_UNIFIED_DEFAULT_FLAG]: true }),
    'unified-plan',
  );
});

test('flag strictly false → health-plan', () => {
  assert.equal(
    pickDefaultPlanRoute({ [PLAN_BPS_UNIFIED_DEFAULT_FLAG]: false }),
    'health-plan',
  );
});

test('flag undefined → health-plan (loading / not shipped yet)', () => {
  assert.equal(pickDefaultPlanRoute({}), 'health-plan');
});

test('flags null → health-plan (query loading)', () => {
  assert.equal(pickDefaultPlanRoute(null), 'health-plan');
});

test('flags undefined → health-plan', () => {
  assert.equal(pickDefaultPlanRoute(undefined), 'health-plan');
});

test('other flags on, ours missing → health-plan (no bleed)', () => {
  assert.equal(
    pickDefaultPlanRoute({
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: true,
    }),
    'health-plan',
  );
});

// ── isUnifiedPlanDefaultEnabled ─────────────────────────────────────

test('predicate: true when flag strictly true', () => {
  assert.equal(
    isUnifiedPlanDefaultEnabled({ [PLAN_BPS_UNIFIED_DEFAULT_FLAG]: true }),
    true,
  );
});

test('predicate: false when flag false', () => {
  assert.equal(
    isUnifiedPlanDefaultEnabled({ [PLAN_BPS_UNIFIED_DEFAULT_FLAG]: false }),
    false,
  );
});

test('predicate: false when flag missing', () => {
  assert.equal(isUnifiedPlanDefaultEnabled({}), false);
});

test('predicate: false when data null (loading)', () => {
  assert.equal(isUnifiedPlanDefaultEnabled(null), false);
});

test('predicate: false when data undefined', () => {
  assert.equal(isUnifiedPlanDefaultEnabled(undefined), false);
});

// Truthy-but-not-strictly-true (defensive): non-boolean values must
// NOT flip the tab default. Prevents a backend typo from silently
// enabling the default swap.
test('predicate: false for non-boolean truthy value ("true" string)', () => {
  assert.equal(
    isUnifiedPlanDefaultEnabled({
      [PLAN_BPS_UNIFIED_DEFAULT_FLAG]: 'true' as unknown as boolean,
    }),
    false,
  );
});
