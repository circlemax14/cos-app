/**
 * Pure-logic tests for the Phase 6.4 render flag predicate (COS-475).
 * Follows the repo convention `node --test tests/unit/*.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isPlanScreenV2Enabled,
  PLAN_SCREEN_V2_FLAG,
} from '../../lib/plan-v2/plan-screen-v2-flag.ts';

test('PLAN_SCREEN_V2_FLAG is the shared flag key', () => {
  assert.equal(PLAN_SCREEN_V2_FLAG, 'plan_screen_v2_enabled');
});

test('isPlanScreenV2Enabled is strict === true', () => {
  assert.equal(isPlanScreenV2Enabled(null), false);
  assert.equal(isPlanScreenV2Enabled(undefined), false);
  assert.equal(isPlanScreenV2Enabled({}), false);
  assert.equal(isPlanScreenV2Enabled({ plan_screen_v2_enabled: false }), false);
  assert.equal(
    isPlanScreenV2Enabled({ plan_screen_v2_enabled: undefined }),
    false,
  );
  assert.equal(
    isPlanScreenV2Enabled({ plan_screen_v2_enabled: true }),
    true,
  );
});

test('does not confuse the tab-default flag for the render flag', () => {
  const flags = { plan_bps_unified_default_enabled: true };
  assert.equal(isPlanScreenV2Enabled(flags), false);
});
