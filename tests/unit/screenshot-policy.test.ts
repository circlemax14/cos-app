/**
 * The PHI capture safeguard, and the guard that failed.
 *
 * COS-905. SCREENSHOTS_BLOCKED was flipped to false on 2026-06-26 for a round
 * of screenshot testing and never flipped back — ten weeks, on main, through
 * every build and OTA in between.
 *
 * The reason it survived that long is in this file's own history: the test was
 * rewritten to assert `false`, with a comment explaining that this was
 * temporary. A guard edited to agree with the thing it guards is not a guard.
 * It turned a deliberate exception into the documented expectation, and the
 * only signal left was a comment nobody was reading.
 *
 * So the assertion below is written to be UNCOMFORTABLE to change. If a tester
 * genuinely needs capture allowed, flip the constant, edit this test, and both
 * changes land in one diff with a reviewer looking at them — which is the whole
 * mechanism. What must not happen again is the test quietly agreeing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SCREENSHOTS_BLOCKED,
  shouldPreventScreenCapture,
} from '../../lib/screenshot-policy.ts';

test('THE POINT: capture protection is ON — PHI renders on every authenticated screen', () => {
  // On iOS a screenshot syncs to iCloud Photos, which is not a BAA'd third
  // party. This is the HIPAA invariant, not a preference.
  assert.equal(
    SCREENSHOTS_BLOCKED,
    true,
    'SCREENSHOTS_BLOCKED is false. If that is deliberate and temporary, say so HERE and in the ' +
      'commit — and flip it back before the next build. It was left false for ten weeks last time.',
  );
});

test('the shipped default is what the app actually applies', () => {
  assert.equal(shouldPreventScreenCapture(), true);
});

test('the helper still honours an explicit argument, both ways', () => {
  assert.equal(shouldPreventScreenCapture(true), true);
  assert.equal(shouldPreventScreenCapture(false), false);
});

test('the app wires the policy to expo-screen-capture, not to a literal', () => {
  // A screen that calls allowScreenCaptureAsync() unconditionally would defeat
  // the constant entirely.
  const layout = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.match(layout, /shouldPreventScreenCapture\(\)|SCREENSHOTS_BLOCKED/);
});

test('the warning in the source still says never to ship it false', () => {
  // If someone deletes the warning, they are removing the only context the
  // next person gets.
  const src = readFileSync(new URL('../../lib/screenshot-policy.ts', import.meta.url), 'utf8');
  assert.match(src, /Never ship a binary or a\s*\n\s*\* lasting OTA with this set to false/);
});
