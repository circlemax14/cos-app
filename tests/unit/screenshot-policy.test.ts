/**
 * The PHI capture safeguard, and the decision that changed it.
 *
 * COS-1034 (2026-09-17): capture is now ALLOWED for every user, by product
 * decision, so patients can keep and share their own records. Vishal asked for
 * it and confirmed after being shown the cost: PHI renders on virtually every
 * authenticated screen, and a screenshot lands in iCloud Photos / Google
 * Photos, neither of which is BAA-covered.
 *
 * WHY THIS TEST STILL EXISTS, inverted rather than deleted.
 *
 * COS-905: the constant was flipped to false on 2026-06-26 for a round of
 * screenshot testing and never flipped back — ten weeks, on main, through
 * every build and OTA. It survived because THIS TEST WAS REWRITTEN TO AGREE
 * WITH IT, with a comment saying it was temporary. A guard edited to agree
 * with the thing it guards is not a guard.
 *
 * The lesson was never "false is forbidden". It was that the value must always
 * be the one someone DECIDED, and that changing it must cost a visible diff.
 * So the assertion is inverted, not removed: if anyone flips this back to true
 * — which may well be right, if counsel or Apple says so — this test fails and
 * they must come here and say why. The mechanism is intact and pointed the
 * other way.
 *
 * If it does go back to true, restore the wording below from git history
 * rather than writing new: the old text explains the HIPAA reasoning better
 * than a fresh paraphrase will.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAPTURE_BLOCK_ENTITLEMENT,
  SCREENSHOTS_BLOCKED,
  shouldPreventScreenCapture,
} from '../../lib/screenshot-policy.ts';

test('THE POINT: capture is allowed, and that is a decision someone signed', () => {
  assert.equal(
    SCREENSHOTS_BLOCKED,
    false,
    'SCREENSHOTS_BLOCKED is true. If capture protection has been restored — which may be ' +
      'right — say why HERE and in the commit, and restore the HIPAA wording from git history. ' +
      'This value must always be one somebody decided, never one that drifted.',
  );
});

test('the shipped default is what the app actually applies', () => {
  assert.equal(shouldPreventScreenCapture(), false);
});

test('the helper still honours an explicit argument, both ways', () => {
  assert.equal(shouldPreventScreenCapture(true), true);
  assert.equal(shouldPreventScreenCapture(false), false);
});

test('the app wires the policy to expo-screen-capture, not to a literal', () => {
  /*
   * COS-1038 — the call site MOVED, and the move is the change.
   *
   * It used to be a useEffect in RootLayout. RootLayout is the component that
   * renders <QueryProvider>, so it sits outside the query context and cannot
   * read an entitlement — which is why a plan could not govern capture until
   * now. The effect therefore lives in a headless child mounted inside the
   * provider (components/privacy/ScreenCaptureBridge.tsx), the same shape
   * FeatureFlagBridge already uses for the same reason.
   *
   * This asserts the unchanged PROPERTY in its new home: the decision comes
   * from the policy module, never from a literal at the call site. And it
   * still asserts _layout.tsx MOUNTS the bridge, because a bridge that is
   * never rendered applies no policy at all and nothing else would notice.
   */
  const strip = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const bridge = strip(
    readFileSync(new URL('../../components/privacy/ScreenCaptureBridge.tsx', import.meta.url), 'utf8'),
  );
  assert.match(bridge, /shouldPreventScreenCapture\(/);
  assert.doesNotMatch(
    bridge,
    /if \((true|false)\)\s*\{\s*ScreenCapture\.preventScreenCaptureAsync/,
    'the call site must not hard-code the decision',
  );

  const layout = strip(readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8'));
  assert.match(layout, /<ScreenCaptureBridge \/>/, 'the bridge must actually be mounted');
  assert.match(
    layout,
    /<QueryProvider>[\s\S]*<ScreenCaptureBridge \/>/,
    'the bridge must be inside QueryProvider or its entitlement hook has no client',
  );
});

test('THE POINT: the plan is the lever, and absence is permissive', () => {
  /*
   * COS-1038. Vishal: "it must be a permission so I can disable directly in
   * the plan". The direction is the part that is easy to get backwards, so it
   * is pinned here rather than left to the comment.
   *
   * The key names the RESTRICTION. A plan carrying it blocks that patient; a
   * plan without it leaves capture allowed, which is the shipped default from
   * COS-1034. Flipping this naming would require editing every existing plan
   * before anyone could screenshot anything.
   */
  assert.equal(
    CAPTURE_BLOCK_ENTITLEMENT,
    'privacy-controls.block-screen-capture',
    'the key must match the backend catalog entry exactly — a feature string that ' +
      'exists only on the client is a permanent deny (COS-1019).',
  );

  // The plan supplies `blocked`; the helper is unchanged underneath it.
  assert.equal(shouldPreventScreenCapture(true, false), true, 'plan carries the key: blocked');
  assert.equal(shouldPreventScreenCapture(false, false), false, 'plan does not: allowed');
});

test('THE POINT: a debug build may be screenshotted, a release build may not', () => {
  /*
   * COS-939. Vishal needs to send UI screenshots from the Android build, and
   * FLAG_SECURE blocks adb screencap and uiautomator too — so nobody could see
   * the screen.
   *
   * The sanctioned path was to flip SCREENSHOTS_BLOCKED, collect, flip back.
   * That is EXACTLY the procedure that failed: COS-905 records ten weeks on
   * main with capture protection off for every patient because the flip back
   * never came.
   *
   * `__DEV__` is compiled out of every release bundle by Metro, so this
   * exception cannot reach a production binary or an OTA to one — there is
   * nothing to flip back.
   */
  assert.equal(shouldPreventScreenCapture(true, true), false, 'debug build: allowed');
  assert.equal(shouldPreventScreenCapture(true, false), true, 'release build: still blocked');
  assert.equal(shouldPreventScreenCapture(true), true, 'explicit block still blocks');
  /*
   * COS-1034 — the omitted-argument case now follows the shipped default,
   * which is `false`. The two explicit assertions above are the ones that
   * prove the __DEV__ exception itself, and they are unchanged: the helper's
   * logic did not move, only the constant it defaults to.
   *
   * Kept rather than deleted because it is the line that will fail first if
   * the policy is ever restored, and that failure is the intended signal.
   */
  assert.equal(shouldPreventScreenCapture(), false);
});

test('the debug exception is strictly an exception — the flag still governs release', () => {
  // SCREENSHOTS_BLOCKED remains the only lever for letting a TestFlight or
  // internal-track tester screenshot a RELEASE build, and keeps its guard.
  assert.equal(shouldPreventScreenCapture(false, false), false);
  assert.equal(shouldPreventScreenCapture(true, false), true);
});

test('the warning in the source still says never to ship it false', () => {
  // If someone deletes the warning, they are removing the only context the
  // next person gets.
  const src = readFileSync(new URL('../../lib/screenshot-policy.ts', import.meta.url), 'utf8');
  assert.match(src, /Never ship a binary or a\s*\n\s*\* lasting OTA with this set to false/);
});
