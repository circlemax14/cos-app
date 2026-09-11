/**
 * COS-941 — "Forgot PIN?" must be reachable on Android.
 *
 * Found by screenshotting the device, which COS-939 made possible.
 *
 * The Android nav bar is a real window — measured on an S26 as
 * navigationBars frame=[0,2196][1080,2340], a 144px bottom inset. iOS has no
 * equivalent; its home indicator costs ~34px. That extra ~110px is enough to
 * push the lock screen's LAST child past the safe-area box, and React Native
 * does not clip overflow, so it renders UNDERNEATH the nav bar. The nav-bar
 * window sits on top and consumes the touch, so the element is faintly visible
 * and completely untappable.
 *
 * The last child is "Forgot PIN?" — whose own comment (COS-376) states the
 * guarantee: "always-visible recovery so a forgot-PIN user (esp. with no Face
 * ID) is never permanently locked out." On Android that did not hold.
 *
 * Verified on the device before and after: before, a swipe did nothing and the
 * link stayed under the nav bar; after, the column scrolls and the link sits
 * fully above it.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../../app/(security)/lock-screen.tsx', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('THE POINT: on Android the column is scrollable, so nothing is stranded', () => {
  assert.match(
    code,
    /Platform\.OS === 'android' \? \(\s*<ScrollView/,
    'the Android branch must wrap the column in a ScrollView',
  );
  assert.match(code, /contentContainerStyle=\{styles\.androidScrollContent\}/);
});

test('flexGrow, not flex — the layout must be unchanged when it already fits', () => {
  /*
   * `flex: 1` on the content container would force the column to the viewport
   * height and re-distribute the spacing, changing a screen that is correct
   * today on most devices. flexGrow lets it keep its natural height and only
   * scroll once it exceeds the viewport.
   */
  assert.match(code, /androidScrollContent:\s*\{\s*flexGrow:\s*1\s*\}/);
  assert.doesNotMatch(code, /androidScrollContent:\s*\{\s*flex:\s*1\s*\}/);
});

test('THE POINT: iOS renders the identical tree it did before', () => {
  /*
   * Production is iOS, this screen gates all PHI access, and cos-app/CLAUDE.md
   * records that this app has crashed in production from cold-mount rendering.
   * There is no iOS symptom, so iOS gets no new wrapper — the column is
   * rendered bare, not inside a View or a ScrollView.
   */
  assert.match(
    code,
    /\) : \(\s*lockColumn\s*\)/,
    'the non-Android branch must render lockColumn directly, with no wrapper',
  );
});

test('the column is declared ONCE, not duplicated per branch', () => {
  /*
   * Duplicating the JSX puts the screen's own `Platform.OS === 'ios'` checks
   * inside an Android-narrowed branch, where they are statically dead — tsc
   * reports exactly that. It is also two copies to keep in sync.
   */
  assert.equal((code.match(/const lockColumn = \(/g) ?? []).length, 1);
  assert.equal((code.match(/<NumberPad/g) ?? []).length, 1, 'the pad must appear once');
});

test('the recovery link is still inside the column it was in', () => {
  // If it were hoisted out of lockColumn to "fix" the overflow it would stop
  // scrolling with the content and land back under the nav bar.
  const start = code.indexOf('const lockColumn = (');
  const end = code.indexOf('Platform.OS === \'android\' ?');
  assert.ok(start >= 0 && end > start);
  assert.match(code.slice(start, end), /Forgot PIN\?/);
});
