/**
 * COS-1106 — the icon's artwork must stay inside its box at every frame.
 *
 * This bit twice. COS-1104 checked each arc's ENDPOINT x and found it inside
 * the viewBox; an arc's widest point is its MIDDLE, and the outer pair bulged
 * to 25.0 in a 24-wide box. COS-1105 then scaled those views to 1.06 and 1.08 —
 * and an absoluteFill view scaled past 1 has its content clipped at the view
 * bounds, so the waves were cut on screen.
 *
 * The rule, for any arc:  (12 + radius + strokeWidth/2) * maxScale <= 24
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('components/ui/health-status-icon.tsx', 'utf8');

test('every arc fits the viewBox at its WIDEST point, not just its ends', () => {
  // radius and stroke are read from the file so this cannot drift from it.
  const arcs = [...src.matchAll(/A(\d+(?:\.\d+)?) \1 0 0 [01] [\d.]+ [\d.]+"\s+stroke=\{color\}\s+strokeWidth=\{(\d+(?:\.\d+)?)\}/g)]
    .map((m) => ({ r: Number(m[1]), stroke: Number(m[2]) }));
  assert.ok(arcs.length >= 4, `expected 4 arcs, parsed ${arcs.length}`);
  for (const { r, stroke } of arcs) {
    const widest = 12 + r + stroke / 2;
    assert.ok(widest <= 24, `arc r=${r} stroke=${stroke} reaches ${widest} in a 24 box`);
  }
});

test('no wave ever scales ABOVE 1', () => {
  /*
   * The Animated.Views are absoluteFill inside a size x size box. Scaling one
   * past 1 pushes its content outside the view, where it is clipped — which is
   * what cut the waves. Growing from below 1 reads as the same expansion and
   * never leaves the frame.
   */
  const scales = [...src.matchAll(/outputRange:\s*\[([\d.]+),\s*([\d.]+)\]/g)]
    .map((m) => Math.max(Number(m[1]), Number(m[2])));
  assert.ok(scales.length > 0, 'expected interpolated ranges');
  for (const s of scales) {
    assert.ok(s <= 1, `an interpolation reaches ${s}; nothing may exceed 1`);
  }
});

test('the cross is a HOLE, not a painted shape', () => {
  // A white cross drawn on the disc looks identical on a white tab bar and
  // wrong on any other. evenodd makes it a real cut-out.
  assert.ok(/fillRule="evenodd"/.test(src), 'the disc must use evenodd');
  assert.ok(!/fill="#fff"|fill="white"/i.test(src), 'no painted-on cross');
});

test('the icon carries exactly one colour', () => {
  // It inherits a single tint from the tab bar. A second colour cannot come
  // from anywhere, so depth is opacity only.
  const literals = src.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
  assert.deepStrictEqual(literals, [], `hard-coded colours found: ${literals.join(', ')}`);
});
