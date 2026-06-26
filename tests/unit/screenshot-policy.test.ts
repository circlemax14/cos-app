import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREENSHOTS_BLOCKED,
  shouldPreventScreenCapture,
} from '../../lib/screenshot-policy.ts';

test('SCREENSHOTS_BLOCKED defaults to true (secure — PHI screenshot safeguard ON)', () => {
  // This is the HIPAA invariant: the default build MUST block capture.
  // The flag is a deliberate, temporary testing toggle only (COS-401).
  assert.equal(SCREENSHOTS_BLOCKED, true);
});

test('shouldPreventScreenCapture() with no arg honors the secure default', () => {
  assert.equal(shouldPreventScreenCapture(), true);
});

test('shouldPreventScreenCapture(true) prevents capture (block path)', () => {
  assert.equal(shouldPreventScreenCapture(true), true);
});

test('shouldPreventScreenCapture(false) allows capture (testing-toggle path)', () => {
  assert.equal(shouldPreventScreenCapture(false), false);
});
