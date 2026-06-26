import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREENSHOTS_BLOCKED,
  shouldPreventScreenCapture,
} from '../../lib/screenshot-policy.ts';

test('SCREENSHOTS_BLOCKED is TEMPORARILY false for Ken testing (SCRUM-537) — restore to true after', () => {
  // The SECURE default is true (the HIPAA invariant). It is deliberately +
  // temporarily flipped to false (2026-06-26) so Ken can capture screenshots.
  // Restore to true (and this assertion) the moment testing is done.
  assert.equal(SCREENSHOTS_BLOCKED, false);
});

test('shouldPreventScreenCapture() honors the (temporarily allow-capture) flag', () => {
  assert.equal(shouldPreventScreenCapture(), false);
});

test('shouldPreventScreenCapture(true) prevents capture (block path)', () => {
  assert.equal(shouldPreventScreenCapture(true), true);
});

test('shouldPreventScreenCapture(false) allows capture (testing-toggle path)', () => {
  assert.equal(shouldPreventScreenCapture(false), false);
});
