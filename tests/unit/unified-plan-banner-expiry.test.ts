/**
 * Pure-logic tests for the 7-day dismissal window on
 * TryUnifiedPlanBanner (COS-467). The banner reads a timestamp from
 * AsyncStorage and delegates the "still dismissed?" decision to this
 * pure predicate — kept side-effect free so it can be tested from
 * `node --test` without RN or a fake AsyncStorage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBannerDismissed, DISMISS_WINDOW_MS } from '../../lib/unified-plan-banner.ts';

const NOW = new Date('2026-07-17T12:00:00Z').getTime();

test('null raw → not dismissed (first visit)', () => {
  assert.equal(isBannerDismissed(null, NOW), false);
});

test('undefined raw → not dismissed', () => {
  assert.equal(isBannerDismissed(undefined, NOW), false);
});

test('empty string raw → not dismissed', () => {
  assert.equal(isBannerDismissed('', NOW), false);
});

test('garbage raw → not dismissed', () => {
  assert.equal(isBannerDismissed('not-a-number', NOW), false);
});

test('zero raw → not dismissed', () => {
  assert.equal(isBannerDismissed('0', NOW), false);
});

test('dismissed just now → still dismissed', () => {
  assert.equal(isBannerDismissed(String(NOW - 1000), NOW), true);
});

test('dismissed 6 days ago → still dismissed', () => {
  const sixDays = 6 * 24 * 60 * 60 * 1000;
  assert.equal(isBannerDismissed(String(NOW - sixDays), NOW), true);
});

test('dismissed exactly 7 days ago → expired (banner reappears)', () => {
  assert.equal(isBannerDismissed(String(NOW - DISMISS_WINDOW_MS), NOW), false);
});

test('dismissed 8 days ago → expired (banner reappears)', () => {
  const eightDays = 8 * 24 * 60 * 60 * 1000;
  assert.equal(isBannerDismissed(String(NOW - eightDays), NOW), false);
});

test('future timestamp (clock skew) → treated as dismissed (fail-safe)', () => {
  // If the stored ts is somehow in the future, `now - ts` is negative,
  // which is < windowMs → dismissed. Fail-safe: err toward not showing
  // an already-dismissed banner rather than spamming it during clock
  // adjustments.
  assert.equal(isBannerDismissed(String(NOW + 60_000), NOW), true);
});

test('custom window overrides default', () => {
  const oneDay = 24 * 60 * 60 * 1000;
  assert.equal(isBannerDismissed(String(NOW - 2 * oneDay), NOW, oneDay), false);
  assert.equal(isBannerDismissed(String(NOW - 30 * 60 * 1000), NOW, oneDay), true);
});
