/**
 * COS-1225 — the PIN pad and the "Forgot PIN?" escape hatch must be reachable
 * on every device and every orientation. (Supersedes
 * lock-screen-android-overflow.test.mjs, COS-941.)
 *
 * COS-941 found this on Android: the nav bar is a real 144px window (measured
 * on an S26 as navigationBars frame=[0,2196][1080,2340]) where iOS's home
 * indicator costs ~34px, so the extra ~110px pushed the column's last child
 * past the safe-area box. React Native does not clip overflow, so it was drawn
 * UNDER the nav bar: faintly visible, completely untappable. COS-941 wrapped
 * the column in a ScrollView on Android ONLY, on the stated grounds that
 * "there is no iOS symptom to fix and no reason to take the risk".
 *
 * There is an iOS symptom. The column is ~720pt at font scale 1, which fits a
 * phone in portrait and an iPad in portrait — and does not fit any phone in
 * landscape (~390pt of viewport) or any iPad in landscape (mini 744pt, 11"
 * 834pt) once the text is scaled, because stores/accessibility-store.tsx
 * deliberately does NOT dampen the system font scale on tablets and applies a
 * 1.3x accessibility multiplier on top. What leaves the screen first is the
 * NumberPad and then "Forgot PIN?", the COS-376 link that exists so a patient
 * is "never permanently locked out" — on a screen that renders the same
 * logo.png as the splash and makes no network calls, so being stranded on it
 * is indistinguishable from a hung launch. Reinstalling does not help: the PIN
 * lives in expo-secure-store (the Keychain) and survives app deletion.
 *
 * Two days of lockout for the clinical lead. The fork is gone; both platforms
 * scroll. setup-pin and confirm-pin are the same column shape with no escape
 * hatch at all, so they are pinned here too.
 *
 * Grep-style contract tests over source read as text — the repo idiom (no `@/`
 * alias under `node --test`). Negative assertions run against comment-stripped
 * source, because the prose explaining a removed thing satisfies a grep for it.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LOCK = strip(read('app/(security)/lock-screen.tsx'));
const SETUP = strip(read('app/(security)/setup-pin.tsx'));
const CONFIRM = strip(read('app/(security)/confirm-pin.tsx'));
const PAD_SCREENS = [
  ['lock-screen', LOCK],
  ['setup-pin', SETUP],
  ['confirm-pin', CONFIRM],
];

test('THE POINT: no platform fork leaves iOS unwrapped', () => {
  /*
   * This is the COS-941 shape, and it is what stranded the clinical lead:
   *   {Platform.OS === 'android' ? (<ScrollView>{lockColumn}</ScrollView>) : lockColumn}
   * Production is iOS. A scroll container that only exists on the platform
   * nobody ships to is not a fix, it is a fix for the test devices.
   */
  for (const [name, code] of PAD_SCREENS) {
    assert.doesNotMatch(
      code,
      /Platform\.OS === 'android'\s*\?/,
      `${name}: the scroll container must not be chosen by platform`,
    );
    assert.doesNotMatch(
      code,
      /Platform\.OS === 'ios'\s*\?\s*\(?\s*<ScrollView/,
      `${name}: nor the other way round`,
    );
  }
});

test('THE POINT: the pad is inside a scrollable region on all three PIN screens', () => {
  // If the pad is outside the scroll container it cannot be scrolled to, which
  // is the entire bug — on setup-pin and confirm-pin there is not even a
  // "Forgot PIN?" link to fall back on.
  for (const [name, code] of PAD_SCREENS) {
    const open = code.indexOf('<ScrollView');
    const close = code.indexOf('</ScrollView>');
    assert.ok(open >= 0, `${name}: must render a ScrollView`);
    assert.ok(close > open, `${name}: ScrollView must be closed after it opens`);
    const scrollable = code.slice(open, close);
    const padded = name === 'lock-screen' ? /\{lockColumn\}/ : /<NumberPad/;
    assert.match(scrollable, padded, `${name}: the pad must be inside the ScrollView`);
  }
});

test('THE POINT: "Forgot PIN?" scrolls with the column it lives in', () => {
  /*
   * COS-376's guarantee. If it were hoisted out of lockColumn to "fix" the
   * overflow it would stop scrolling with the content and strand itself again,
   * which is precisely what COS-941 ruled out on Android.
   */
  const start = LOCK.indexOf('const lockColumn = (');
  const end = LOCK.indexOf('<ScrollView');
  assert.ok(start >= 0 && end > start, 'lockColumn must be declared before the ScrollView');
  assert.match(LOCK.slice(start, end), /Forgot PIN\?/);
});

test('flexGrow, not flex — a column that already fits must lay out exactly as before', () => {
  /*
   * `flex: 1` on the content container forces the column to the viewport height
   * and re-distributes the spacing, changing a phone-portrait screen that is
   * correct today. flexGrow keeps the natural height and only scrolls on
   * overflow. Phone portrait is the common case and it must not regress.
   */
  for (const [name, code] of PAD_SCREENS) {
    assert.match(
      code,
      /scrollContent:\s*\{\s*flexGrow:\s*1\s*\}/,
      `${name}: content container must use flexGrow`,
    );
    assert.doesNotMatch(code, /scrollContent:\s*\{\s*flex:\s*1\s*\}/, `${name}: not flex`);
  }
});

test('THE POINT: a tap on the pad is never swallowed by the scroll container', () => {
  /*
   * RN's default is keyboardShouldPersistTaps="never": a tap inside the scroll
   * view is consumed dismissing the keyboard and never reaches the child.
   * COS-1192 was the fourth report of a control on a scroll surface costing two
   * taps for exactly that reason. These screens have no TextInput, so there is
   * nothing they should ever spend a tap dismissing — and the app can lock
   * while a keyboard is up on the screen behind it.
   */
  for (const [name, code] of PAD_SCREENS) {
    assert.match(
      code,
      /keyboardShouldPersistTaps="always"/,
      `${name}: the ScrollView must persist taps`,
    );
    assert.doesNotMatch(code, /keyboardShouldPersistTaps="never"/, `${name}`);
  }
});

test('the pad is not nested inside another touch handler that could eat the press', () => {
  // A Touchable/Pressable wrapped around the pad (e.g. a tap-to-dismiss
  // backdrop) competes with the key presses in the responder chain.
  for (const [name, code] of PAD_SCREENS) {
    assert.doesNotMatch(
      code,
      /<(TouchableWithoutFeedback|TouchableOpacity|Pressable)[^>]*>\s*<NumberPad/,
      `${name}: nothing may wrap the pad in a touch handler`,
    );
  }
  // And the keys themselves are still Pressables, not something nested deeper.
  assert.match(strip(read('components/ui/number-pad.tsx')), /<Pressable\s/);
});

test('ALWAYS scroll — no measurement pass or extra commit at cold mount', () => {
  /*
   * A conditional "scroll only when it overflows" needs
   * onLayout/onContentSizeChange -> setState, i.e. a SECOND synchronous commit
   * at cold mount on the screen that gates all PHI. The crash this app has had
   * in production (COS-435, project_ios26_biopsychosocial_parked) was density in
   * one commit, so a measure-then-restate is nearer the documented trigger than
   * the unconditional wrapper is. Always-scroll also means Android and iOS take
   * the identical path, and Android has shipped it since COS-941.
   */
  for (const [name, code] of PAD_SCREENS) {
    assert.doesNotMatch(code, /onContentSizeChange/, `${name}`);
    assert.doesNotMatch(code, /scrollEnabled=\{/, `${name}: scrolling must not be conditional`);
  }
});

test('bounces is left at its default, so a drag always answers', () => {
  /*
   * COS-941 passed bounces={false}, which on Android did nothing — bounces is
   * an iOS-only prop. On the one screen whose failure is "the patient cannot
   * tell there is anything below", a drag that does nothing is the worst
   * available answer; the rubber-band says "this moves, and that is all of it".
   */
  for (const [name, code] of PAD_SCREENS) {
    assert.doesNotMatch(code, /bounces=\{false\}/, `${name}`);
  }
});

test('the column is declared ONCE, not duplicated per branch', () => {
  /*
   * Duplicating the JSX puts the screen's own Platform.OS checks inside a
   * narrowed branch where they are statically dead — tsc reports exactly that.
   * It is also two copies to keep in sync.
   */
  assert.equal((LOCK.match(/const lockColumn = \(/g) ?? []).length, 1);
  for (const [name, code] of PAD_SCREENS) {
    assert.equal((code.match(/<NumberPad/g) ?? []).length, 1, `${name}: the pad appears once`);
    assert.equal(
      (code.match(/<ScrollView/g) ?? []).length,
      1,
      `${name}: exactly one scroll container`,
    );
  }
});
