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

/*
 * COS-1046 — the Health Age tile's ring uses a DIFFERENT scale to Wellbeing's,
 * and the difference is the point.
 *
 * Wellbeing is 0-100, so progress is the score itself. Health Age is an AGE IN
 * YEARS: a health age of 44 filling 44% of a ring would be meaningless. The
 * detail screen centres its dial on the patient's CHRONOLOGICAL age with a
 * +/-10 year span, so half-full means "your health age matches your real age".
 *
 * The tile reuses `positionOf` from lib/dial-geometry — the exact function the
 * detail dial calls — so the two cannot disagree. These tests pin the property
 * the tile depends on; if positionOf ever changes, a health age equal to a
 * patient's real age must still read as half a ring.
 */
const geom = readFileSync(new URL('../../lib/dial-geometry.ts', import.meta.url), 'utf8');
const posBody = geom.slice(geom.indexOf('export function positionOf'));
const posRaw = posBody.slice(0, posBody.indexOf('\n}') + 2);
const positionOf = new Function(
  ['function positionOf(value, center, span) {', ...posRaw.split('\n').slice(1)].join('\n') +
    '; return positionOf;',
)() as (v: number, c: number, s: number) => number;

test('THE POINT: a health age equal to the real age sits at half a ring', () => {
  assert.equal(positionOf(44, 44, 10), 0.5);
});

test('younger than your age fills LESS, older fills MORE', () => {
  // Backwards here would tell a patient in good health that they are ageing.
  assert.ok(positionOf(38, 44, 10) < 0.5, 'younger must read below half');
  assert.ok(positionOf(50, 44, 10) > 0.5, 'older must read above half');
});

test('beyond the +/-10 year span CLAMPS, it does not wrap', () => {
  // Wrapping would draw a 70-year-old health age as a nearly empty ring.
  assert.equal(positionOf(4, 44, 10), 0);
  assert.equal(positionOf(94, 44, 10), 1);
});

test('the ring the tile draws is inside ringSweep’s accepted range', () => {
  // positionOf feeds ScoreRing.progress directly, so its whole output range
  // must be renderable without clamping surprises.
  for (const v of [20, 34, 44, 54, 80]) {
    const p = positionOf(v, 44, 10);
    const s = ringSweep(p);
    assert.ok(s.right >= 0 && s.right <= 180 && s.left >= 0 && s.left <= 180);
  }
});

/*
 * COS-1084 - ringEndAngle, extracted exactly as ringSweep is above: this file
 * cannot import the .tsx, so the function is lifted as text and evaluated on
 * its own. That also proves it depends on nothing in the component.
 */
const endBody = src.slice(src.indexOf('export function ringEndAngle'));
const endRaw = endBody.slice(0, endBody.indexOf('\n}') + 2);
const endSrc = ['function ringEndAngle(progress) {', ...endRaw.split('\n').slice(1)].join('\n');
const ringEndAngle = new Function(`${endSrc}; return ringEndAngle;`)() as (p: number) => number;

test('ringEndAngle: 0 empty, 90 at a quarter, 360 at full', () => {
  assert.equal(ringEndAngle(0), 0);
  assert.equal(ringEndAngle(0.25), 90);
  assert.equal(ringEndAngle(0.5), 180);
  assert.equal(ringEndAngle(1), 360);
});

test('THE POINT: a full ring caps at 360, not 0', () => {
  // Same place on a circle, different meaning to anything reading the value:
  // returning 0 would make a completed score indistinguishable from an empty
  // one, and the cap is suppressed at 0.
  assert.notEqual(ringEndAngle(1), ringEndAngle(0));
});

test('ringEndAngle clamps rather than over-rotating', () => {
  assert.equal(ringEndAngle(1.4), 360);
  assert.equal(ringEndAngle(-2), 0);
  assert.equal(ringEndAngle(Number.NaN), 0);
});

test('THE POINT: the cap sits exactly at the leading edge of the swept arc', () => {
  // ringSweep says how far each half turned; ringEndAngle says where the arc
  // stopped. If they drift the dot floats off the end of the colour, which
  // looks like a rendering bug and reads as a wrong score.
  for (const p of [0.1, 0.33, 0.5, 0.75, 0.99]) {
    const sweep = ringSweep(p);
    assert.equal(Math.round(sweep.right + sweep.left), Math.round(ringEndAngle(p)));
  }
});

/**
 * COS-1094 — the Home dial must use the SAME scale as the screen behind it.
 *
 * Ken screenshotted wellbeing-score.tsx and health-age.tsx and asked for that
 * view on Home. If the tile and the detail screen disagree about the scale,
 * the same number sits at two different positions and the tile is worse than
 * no dial at all.
 */
test('COS-1094: Home dial scales match the detail screens verbatim', () => {
  const hero = readFileSync('components/home/HeroInsightsRow.tsx', 'utf8');

  // wellbeing-score.tsx passes center={50} span={50}
  assert.ok(
    /dial=\{\{ value: composite as number, center: 50, span: 50 \}\}/.test(hero),
    'wellbeing tile must use center 50 / span 50',
  );
  // health-age.tsx passes center={chrono} span={10}
  assert.ok(
    /center: chrono/.test(hero) && /span: HEALTH_AGE_SPAN_YEARS/.test(hero),
    'health age tile must centre on chronological age',
  );
});

test('COS-1094: the dial never renders without both endpoints known', () => {
  // health-age.tsx: "a scale with one endpoint missing is decoration, not a
  // measurement". The tile must not disagree.
  const hero = readFileSync('components/home/HeroInsightsRow.tsx', 'utf8');
  assert.ok(
    /typeof chrono === 'number' && Number\.isFinite\(chrono\)[\s\S]{0,400}?center: chrono/.test(hero),
    'health age dial must be null when chronological age is unknown',
  );
});

test('COS-1094: the SVG dial stays behind a kill-switch', () => {
  // Home is SVG-free after a cold-mount crash (ADR-0003). DialGauge uses
  // react-native-svg, so it must never mount unguarded — and the ScoreRing
  // fallback must still be reachable.
  const hero = readFileSync('components/home/HeroInsightsRow.tsx', 'utf8');
  assert.ok(/useHomeDialGaugeFlag\(\)/.test(hero), 'dial must read the flag');
  assert.ok(/if \(dialEnabled && dial\)/.test(hero), 'dial must be gated');
  assert.ok(/<ScoreRing/.test(hero), 'ScoreRing fallback must remain');
});
