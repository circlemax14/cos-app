/**
 * The record-measurement modal's actions must survive large accessibility text.
 *
 * Ken 2026-08-14, with Bold Text and Larger Text both on: "skip recording
 * button is half out of modal."
 *
 * The row was `flexDirection: row` + `justifyContent: 'flex-end'` with a
 * `minWidth: 130` primary button. At large text the two buttons are wider than
 * the card — and because the row is end-justified, the overflow goes off the
 * LEFT edge. So the button that gets clipped is the SECONDARY one, and "Skip
 * recording" became partly unreachable. A patient who does not want to record
 * a value had no way out of the modal except the backdrop.
 *
 * This is the fourth bug in this family (habits time picker, timeline
 * alignment, timeline hour column, this). The pattern is always the same: a
 * layout that is fine at 1.0x and impossible at 1.5x. So these assertions are
 * about the LAYOUT RULES rather than about pixels, since pixels are what we
 * cannot measure here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'components/home/record-metric-modal.tsx'), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = codeOnly(SRC);

test('the actions stack at large text instead of overflowing', () => {
  assert.match(CODE, /const stackActions = PixelRatio\.getFontScale\(\) >= 1\.3;/);
  assert.match(CODE, /styles\.buttonRow, stackActions && styles\.buttonColumn/);
});

test('it reads the RAW OS scale, not the app-damped one', () => {
  // getScaledFontSize damps the OS scale to ~1.05 on phones, so it cannot tell
  // us that the OS is rendering labels at 1.5x — which is what overflows.
  assert.match(CODE, /PixelRatio\.getFontScale\(\)/);
  assert.doesNotMatch(
    CODE,
    /const stackActions = getScaledFontSize/,
    'the damped scale would never cross the threshold',
  );
});

test('BOTH buttons get the stacked style, not just one', () => {
  // Stretching only one leaves the other mis-sized beside it.
  const hits = CODE.match(/stackActions && styles\.btnStacked/g) ?? [];
  assert.equal(hits.length, 2);
});

test('the stacked style releases the primary minWidth', () => {
  // minWidth: 130 is exactly what makes the pair too wide to fit; leaving it
  // set while stacking would keep a floor under the overflow.
  assert.match(CODE, /btnStacked: \{[^}]*minWidth: 0/);
  assert.match(CODE, /btnStacked: \{[^}]*(width: '100%'|alignSelf: 'stretch')/);
});

test('the row can wrap even below the threshold', () => {
  // Belt and braces: the threshold is a judgement call, and a device that
  // overflows just under it must still not clip.
  assert.match(CODE, /buttonRow: \{[^}]*flexWrap: 'wrap'/);
});

test('stacking puts the PRIMARY action on top without duplicating JSX', () => {
  // DOM order is (skip, save). column-reverse renders that as (save, skip), so
  // the primary keeps the prominent position it holds in the row layout.
  assert.match(CODE, /buttonColumn: \{[^}]*flexDirection: 'column-reverse'/);
  // Scoped to the button row. An unscoped indexOf finds the handler
  // DEFINITIONS higher up the file, which are in the opposite order and say
  // nothing about render order — the same trap that produced two false
  // failures in the timeline tests.
  const row = CODE.slice(CODE.indexOf('styles.buttonRow'));
  const skipAt = row.indexOf('onPress={handleSkip}');
  const saveAt = row.indexOf('onPress={handleSave}');
  assert.ok(skipAt !== -1 && saveAt !== -1, 'both handlers must be wired in the row');
  assert.ok(skipAt < saveAt, 'skip must come FIRST in the DOM for column-reverse to work');
});

test('both actions meet the 44pt minimum target', () => {
  assert.match(CODE, /btnGhost: \{[^}]*minHeight: 44/);
  assert.match(CODE, /btnPrimary: \{[^}]*minHeight: 44/);
});

test('the actions stay OUTSIDE the ScrollView', () => {
  // Established rule for this app's modals: actions inside the scroller become
  // unreachable behind the numeric keypad.
  const closeScroll = CODE.indexOf('</ScrollView>');
  const row = CODE.indexOf('styles.buttonRow');
  assert.ok(closeScroll !== -1 && row > closeScroll, 'buttons must follow </ScrollView>');
});
