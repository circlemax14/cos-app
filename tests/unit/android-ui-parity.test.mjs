/**
 * COS-1031 — "in iOS everything was so sophisticated and aligned, but in
 * Android everything was so big — it is actually touching the edge."
 *
 * Two independent causes, both verified against the source:
 *
 * BIG — the icon layer. iOS resolves icon-symbol.ios.tsx and renders a
 * <SymbolView resizeMode="scaleAspectFit"> into a size x size box, so an SF
 * Symbol's ink occupies ~0.6-0.75 of it. Android resolves icon-symbol.tsx and
 * renders MaterialIcons, a FONT whose glyph fills its em box (~0.85-0.95). At
 * the same nominal `size` the Android mark is 25-40% heavier — most visibly in
 * the header and tab bar, which are on screen the whole session.
 *
 * EDGE — iPhone-derived fixed geometry. The Home orbit used radius 172.8 with
 * 120dp bubbles, needing 465.6dp of width. A common Android phone is 360dp, so
 * the 9 and 3 o'clock bubbles ran off both edges of the landing screen.
 *
 * An earlier hypothesis — that the 49-vs-3 Platform.OS ternary asymmetry was
 * the cause — was WRONG, and so was the audit's own first answer that blamed
 * iOS-only `presentationStyle="pageSheet"`. All 11 of those Modals already
 * consume their Android insets. Recorded here so neither is re-chased.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ANDROID_ICON = stripComments(read('components/ui/icon-symbol.tsx'));
const IOS_ICON = read('components/ui/icon-symbol.ios.tsx');
const HOME = stripComments(read('app/Home/index.tsx'));

test('THE POINT: the Android glyph is scaled down to SF Symbol ink weight', () => {
  assert.match(ANDROID_ICON, /ANDROID_INK_RATIO = 0\.8/);
  assert.match(ANDROID_ICON, /size=\{Math\.round\(size \* ANDROID_INK_RATIO\)\}/);
  // The raw pass-through is what made them heavy.
  assert.doesNotMatch(ANDROID_ICON, /<MaterialIcons[^>]*\ssize=\{size\}/);
});

test('the LAYOUT box is untouched — only the ink shrinks', () => {
  // Callers still reserve `size`, so nothing reflows and no spacing moves.
  // If this ever becomes a width/height override, spacing changes too and the
  // fix stops being safe.
  assert.doesNotMatch(ANDROID_ICON, /width: Math\.round\(size/);
  assert.doesNotMatch(ANDROID_ICON, /height: Math\.round\(size/);
});

test('iOS cannot be affected — it resolves a different file', () => {
  // Structural, not a promise: React Native picks .ios.tsx on iOS and never
  // loads icon-symbol.tsx at all.
  assert.match(IOS_ICON, /SymbolView/);
  assert.match(IOS_ICON, /resizeMode="scaleAspectFit"/);
  assert.doesNotMatch(IOS_ICON, /ANDROID_INK_RATIO/);
});

test('THE POINT: the Home orbit is clamped to the viewport on Android', () => {
  assert.match(HOME, /Platform\.OS === 'android'/);
  assert.match(HOME, /IOS_ORBIT_RADIUS = 144 \* 1\.2/);
  assert.match(HOME, /Math\.min\(\s*IOS_ORBIT_RADIUS/);
});

test('iOS keeps the exact literal it shipped with', () => {
  // The whole point of gating: iOS layout is signed off and must not move.
  const block = HOME.slice(HOME.indexOf('const IOS_ORBIT_RADIUS'), HOME.indexOf('const hasCareManager'));
  assert.match(block, /: IOS_ORBIT_RADIUS;/);
});

test('a very narrow device degrades to a tight orbit, never an inverted one', () => {
  assert.match(HOME, /Math\.max\(96,/);
});

test('the arithmetic that caused the clipping is still true, so the floor matters', () => {
  // radius*2 + bubble = 172.8*2 + 120 = 465.6dp required, on a 360dp phone.
  const required = 144 * 1.2 * 2 + 120;
  assert.ok(required > 360, `orbit needs ${required}dp, which is why 360dp clipped`);
});
