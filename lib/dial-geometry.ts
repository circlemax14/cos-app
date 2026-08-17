/**
 * Geometry for the circular dial gauge on Health Age and Wellbeing.
 *
 * Pure maths, no React and no imports, so `node --test` can run it directly
 * (see feedback_node_test_no_alias_imports — anything importing `@/...` is
 * unrunnable under the plain node test runner).
 *
 * ─── THE SHAPE, AND WHY THE PREVIOUS ONE WAS WRONG ───────────────────
 *
 * The first attempt drew a semicircular DOME (∩) with the number sitting
 * underneath it. The reference is the opposite in both respects: a nearly
 * complete RING with the number inside it, and the measurable scale occupying
 * the BOTTOM arc, so the track curves like a bowl (∪).
 *
 * That is not a cosmetic difference. A dome with text below it is a chart with
 * a caption. A ring with the number inside it is a dial — the number reads as
 * the thing being measured, and the arc reads as its position on a scale.
 *
 * ─── COORDINATES ─────────────────────────────────────────────────────
 *
 * SVG screen convention: y grows DOWNWARD. So with angles in degrees measured
 * from the positive x-axis:
 *
 *      0° = right,  90° = BOTTOM,  180° = left,  270° = top
 *
 * The scale runs across the bottom, from lower-left to lower-right, passing
 * through 90°. Angles therefore DECREASE as t goes 0 → 1.
 */

/** Half-width of the scale arc either side of bottom-centre, in degrees. */
export const SCALE_HALF_SWEEP = 55

/** t = 0 sits here (lower-left), t = 1 at its mirror (lower-right). */
export const SCALE_START_DEG = 90 + SCALE_HALF_SWEEP // 145
export const SCALE_END_DEG = 90 - SCALE_HALF_SWEEP // 35

export interface Point {
  x: number
  y: number
}

const RAD = Math.PI / 180

/** Where `t` (0 = left end of the scale, 1 = right end) falls, in degrees. */
export function angleAt(t: number): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
  return SCALE_START_DEG - (SCALE_START_DEG - SCALE_END_DEG) * clamped
}

/** Cartesian point at a given angle and radius about (cx, cy). */
export function polar(deg: number, cx: number, cy: number, r: number): Point {
  return { x: cx + r * Math.cos(deg * RAD), y: cy + r * Math.sin(deg * RAD) }
}

/** Point on the scale track at `t`. */
export function pointAt(t: number, cx: number, cy: number, r: number): Point {
  return polar(angleAt(t), cx, cy, r)
}

/**
 * SVG path for the arc between two positions on the scale.
 *
 * `sweep` is 0 because angles decrease as t increases, which traces the arc
 * counter-clockwise in SVG's y-down space — the direction that stays along the
 * bottom of the circle rather than looping over the top.
 */
export function arcPath(from: number, to: number, cx: number, cy: number, r: number): string {
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const a = pointAt(lo, cx, cy, r)
  const b = pointAt(hi, cx, cy, r)
  const sweptDeg = Math.abs(angleAt(hi) - angleAt(lo))
  const large = sweptDeg > 180 ? 1 : 0
  return `M ${round(a.x)} ${round(a.y)} A ${round(r)} ${round(r)} 0 ${large} 0 ${round(b.x)} ${round(b.y)}`
}

/**
 * Position `value` on a scale centred on `center` and `span` wide either side,
 * as a 0-1 fraction. Values outside the scale clamp to its ends rather than
 * running off the arc.
 */
export function positionOf(value: number, center: number, span: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(center) || !Number.isFinite(span) || span <= 0) {
    return 0.5
  }
  return Math.max(0, Math.min(1, (value - (center - span)) / (2 * span)))
}

/**
 * Rotation, in degrees, that puts a label's baseline along the circle's
 * tangent at `t` — how the end labels sit in the reference.
 *
 * The tangent has two directions and one of them renders the text upside
 * down, so the result is normalised into (-90, 90]. Left of centre this comes
 * out positive (text tilts down to the right), right of centre negative,
 * which is the mirrored pair the reference shows.
 */
export function tangentRotation(t: number): number {
  let deg = angleAt(t) + 90
  while (deg > 90) deg -= 180
  while (deg <= -90) deg += 180
  return deg
}

/**
 * Dash pattern that turns a single stroked arc into evenly spaced tick marks.
 *
 * ONE NODE INSTEAD OF SIXTY. Drawing each tick as its own element would put
 * dozens of native views on the screen and is exactly the render-primitive
 * density ADR-0003 blames for the iOS 26.5 cold-mount crashes. A dash array on
 * one path is visually identical and costs a single node.
 *
 * The gap is derived from the arc length so spacing stays even at any radius,
 * and `count` is clamped because a very small dial with many ticks turns into
 * a solid line.
 */
export function tickDash(
  radius: number,
  sweepDeg: number,
  count: number,
  tickWidth = 1.5,
): { dash: string; length: number } {
  const arcLen = Math.abs(sweepDeg) * RAD * Math.max(0, radius)
  const safeCount = Math.max(1, Math.min(Math.floor(count) || 1, Math.floor(arcLen / (tickWidth * 2)) || 1))
  const gap = Math.max(0, arcLen / safeCount - tickWidth)
  return { dash: `${round(tickWidth)} ${round(gap)}`, length: round(arcLen) }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
