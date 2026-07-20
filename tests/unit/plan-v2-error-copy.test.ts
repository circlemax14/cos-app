/**
 * Pure-logic tests for the Phase 6.4 round-2 swipe-error classifier
 * (COS-475). Centralises the per-row error mapping so drift between
 * SwipeableTaskRow and SwipeableRoutineRow can't recur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySwipeError,
  errorCodeOf,
  SUCCESS_COPY,
  FEATURE_DISABLED_BANNER,
} from '../../lib/plan-v2/error-copy.ts';

function wrapped(code: string): { code: string } {
  return { code };
}

test('errorCodeOf extracts .code from a WrappedApiError-shaped object', () => {
  assert.equal(errorCodeOf(wrapped('FOO')), 'FOO');
  assert.equal(errorCodeOf({}), undefined);
  assert.equal(errorCodeOf(null), undefined);
  assert.equal(errorCodeOf({ code: 123 }), undefined);
});

test('FEATURE_DISABLED classifies as feature-disabled + reverts + no refetch', () => {
  const c = classifySwipeError(wrapped('FEATURE_DISABLED'), 'skip');
  assert.equal(c.kind, 'feature-disabled');
  assert.equal(c.revert, true);
  assert.equal(c.refetch, false);
  assert.equal(c.toast, 'Editing unavailable');
});

test('OCCURRENCE_CLOSED is terminal + refetch + explanatory copy (no auto-retry)', () => {
  const c = classifySwipeError(wrapped('OCCURRENCE_CLOSED'), 'snooze');
  assert.equal(c.kind, 'occurrence-closed');
  assert.equal(c.refetch, true);
  assert.equal(c.revert, true);
  assert.match(c.toast ?? '', /already closed/i);
});

test('OVERRIDE_CONCURRENT_WRITE on attempt 1 stays silent so caller can retry', () => {
  const c = classifySwipeError(wrapped('OVERRIDE_CONCURRENT_WRITE'), 'skip', 1);
  assert.equal(c.kind, 'concurrent-write');
  assert.equal(c.toast, null);
  assert.equal(c.refetch, false);
  assert.equal(c.revert, false);
});

test('OVERRIDE_CONCURRENT_WRITE on attempt 2 surfaces care-team copy + refetch', () => {
  const c = classifySwipeError(wrapped('OVERRIDE_CONCURRENT_WRITE'), 'skip', 2);
  assert.equal(c.kind, 'concurrent-write');
  assert.match(c.toast ?? '', /care team/i);
  assert.equal(c.refetch, true);
  assert.equal(c.revert, true);
});

test('unknown code falls back to per-action generic copy + revert', () => {
  const skip = classifySwipeError(wrapped('WEIRD'), 'skip');
  const snz = classifySwipeError(wrapped('WEIRD'), 'snooze');
  const rsc = classifySwipeError(wrapped('WEIRD'), 'reschedule');
  assert.equal(skip.kind, 'unknown');
  assert.match(skip.toast ?? '', /skip/i);
  assert.match(snz.toast ?? '', /snooze/i);
  assert.match(rsc.toast ?? '', /reschedule/i);
  for (const c of [skip, snz, rsc]) {
    assert.equal(c.revert, true);
    assert.equal(c.refetch, false);
  }
});

test('INVALID_TIME classifies with dedicated copy', () => {
  const c = classifySwipeError(wrapped('INVALID_TIME'), 'reschedule');
  assert.equal(c.kind, 'invalid-time');
  assert.match(c.toast ?? '', /time/i);
  assert.equal(c.revert, true);
});

test('SUCCESS_COPY.skipped is plain and non-misleading (no "Undo")', () => {
  assert.equal(SUCCESS_COPY.skipped, 'Skipped for today');
  assert.doesNotMatch(SUCCESS_COPY.skipped, /undo/i);
});

test('SUCCESS_COPY.snoozed interpolates the new time', () => {
  assert.equal(SUCCESS_COPY.snoozed('09:15'), 'Snoozed to 09:15');
});

test('FEATURE_DISABLED_BANNER mentions pull-to-refresh', () => {
  assert.match(FEATURE_DISABLED_BANNER, /refresh/i);
});

test('null / undefined error → unknown', () => {
  const c = classifySwipeError(null, 'skip');
  assert.equal(c.kind, 'unknown');
});
