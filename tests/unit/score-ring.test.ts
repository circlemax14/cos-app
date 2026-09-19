/**
 * COS-1041 — the ring geometry, tested without a renderer.
 *
 * The arc is drawn by rotating two half-windows, so a wrong sweep renders a
 * plausible-looking ring showing the WRONG NUMBER — which on a health figure
 * is worse than rendering nothing at all. The maths is therefore pure and
 * checked here rather than by eye.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Read the source as text rather than importing it: this file is a .tsx with
 * React Native imports and `node --test` cannot load those (see cos-app
 * CLAUDE.md). The function is small and self-contained, so it is evaluated in
 * isolation — which also proves it has no hidden dependency on the component.
 */
const src = readFileSync(new URL('../../components/home/ScoreRing.tsx', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function ringSweep'));
const raw = body.slice(0, body.indexOf('\n}') + 2);
// Replace the whole TS signature LINE. A regex up to the first `{` eats the
// return type's own brace (`{ right: number; left: number }`) instead of the
// body's — `new Function` parses JavaScript, not TypeScript.
const fnSrc = ['function ringSweep(progress) {', ...raw.split('\n').slice(1)].join('\n');
const ringSweep = new Function(`${fnSrc}; return ringSweep;`)() as (
  p: number,
) => { right: number; left: number };

test('empty and full are the two ends, and they are exact', () => {
  assert.deepEqual(ringSweep(0), { right: 0, left: 0 });
  assert.deepEqual(ringSweep(1), { right: 180, left: 180 });
});

test('THE POINT: the right half sweeps first, the left only after halfway', () => {
  // A ring that started both halves at once would show a symmetric arc and
  // read as roughly double the real score.
  assert.deepEqual(ringSweep(0.25), { right: 90, left: 0 });
  assert.deepEqual(ringSweep(0.5), { right: 180, left: 0 });
  assert.deepEqual(ringSweep(0.75), { right: 180, left: 90 });
});

test('the right half HOLDS at 180 once passed — it never rolls over', () => {
  // If it kept rotating past 180 the arc would wind back on itself and a
  // score of 90 would draw as a smaller ring than a score of 60.
  for (const p of [0.5, 0.6, 0.8, 1]) {
    assert.equal(ringSweep(p).right, 180, `right must hold at 180 for ${p}`);
  }
});

test('out-of-range input is CLAMPED, never wrapped', () => {
  /*
   * A score outside 0..1 is a bug upstream, but wrapping it would render a
   * confident wrong number. Clamping renders a truthful extreme instead.
   */
  assert.deepEqual(ringSweep(1.4), { right: 180, left: 180 });
  assert.deepEqual(ringSweep(-0.3), { right: 0, left: 0 });
});

test('a non-finite score renders EMPTY, not NaN degrees', () => {
  // `rotate: "NaNdeg"` is not a runtime error in RN — it silently renders
  // unrotated, i.e. a full-looking ring on missing data.
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(ringSweep(bad as number), { right: 0, left: 0 });
  }
});

test('monotonic: more score never draws less ring', () => {
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const { right, left } = ringSweep(i / 100);
    const total = right + left;
    assert.ok(total >= prev, `sweep went backwards at ${i}%`);
    prev = total;
  }
});
