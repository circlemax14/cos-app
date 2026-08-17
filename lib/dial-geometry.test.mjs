/**
 * The dial's geometry.
 *
 * THE TEST THAT SHOULD HAVE EXISTED FIRST is the orientation one. The previous
 * gauge drew a DOME (∩) where the reference is a BOWL (∪) — visually the whole
 * difference between the screen matching and not matching — and nothing caught
 * it, because the old tests only checked that the arc's endpoints moved in the
 * right direction, which is equally true upside down.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SCALE_HALF_SWEEP,
  angleAt,
  arcPath,
  pointAt,
  polar,
  positionOf,
  tangentRotation,
  tickDash,
} from './dial-geometry.ts'

const CX = 100
const CY = 100
const R = 80

test('THE ORIENTATION ONE: the scale is a BOWL, not a dome', () => {
  // SVG y grows DOWNWARD. So on a bowl the midpoint sits BELOW both ends —
  // a larger y. Getting this backwards is exactly the bug that made the
  // screen not match its reference, and it is invisible to any test that
  // only checks left-to-right ordering.
  const left = pointAt(0, CX, CY, R)
  const mid = pointAt(0.5, CX, CY, R)
  const right = pointAt(1, CX, CY, R)

  assert.ok(mid.y > left.y, `midpoint should hang BELOW the left end (${mid.y} vs ${left.y})`)
  assert.ok(mid.y > right.y, `midpoint should hang BELOW the right end (${mid.y} vs ${right.y})`)

  // And the midpoint is the very bottom of the circle.
  assert.ok(Math.abs(mid.y - (CY + R)) < 0.001)
  assert.ok(Math.abs(mid.x - CX) < 0.001)
})

test('t runs left to right, and the ends are level with each other', () => {
  const left = pointAt(0, CX, CY, R)
  const right = pointAt(1, CX, CY, R)

  assert.ok(left.x < CX, 't=0 is left of centre')
  assert.ok(right.x > CX, 't=1 is right of centre')
  // Symmetric about the vertical axis.
  assert.ok(Math.abs((CX - left.x) - (right.x - CX)) < 0.001)
  assert.ok(Math.abs(left.y - right.y) < 0.001)
})

test('the scale occupies the bottom of the circle, not the top', () => {
  // Every point on the arc is below the horizontal diameter.
  for (let t = 0; t <= 1; t += 0.1) {
    assert.ok(pointAt(t, CX, CY, R).y > CY, `t=${t.toFixed(1)} should be below centre`)
  }
  assert.equal(angleAt(0.5), 90) // 90 degrees is the bottom in y-down space
  assert.equal(angleAt(0), 90 + SCALE_HALF_SWEEP)
  assert.equal(angleAt(1), 90 - SCALE_HALF_SWEEP)
})

test('positionOf places a value on a centred scale, and clamps beyond it', () => {
  assert.equal(positionOf(44.3, 44.3, 10), 0.5) // the midpoint is the centre
  assert.equal(positionOf(34.3, 44.3, 10), 0) // exactly the left end
  assert.equal(positionOf(54.3, 44.3, 10), 1) // exactly the right end

  // Younger than the scale allows still renders AT the end, not off the arc.
  assert.equal(positionOf(10, 44.3, 10), 0)
  assert.equal(positionOf(99, 44.3, 10), 1)

  // Wellbeing's 0-100 scale, centred on 50.
  assert.equal(positionOf(50, 50, 50), 0.5)
  assert.equal(positionOf(75, 50, 50), 0.75)
})

test('positionOf degrades to the midpoint rather than NaN', () => {
  // A NaN here would produce an arc path full of NaN and render nothing at
  // all — a blank hero rather than a visible error.
  assert.equal(positionOf(Number.NaN, 44, 10), 0.5)
  assert.equal(positionOf(44, Number.NaN, 10), 0.5)
  assert.equal(positionOf(44, 44, 0), 0.5)
  assert.equal(positionOf(44, 44, -5), 0.5)
})

test('the arc path is well formed and never contains NaN', () => {
  const d = arcPath(0, 1, CX, CY, R)
  assert.match(d, /^M [\d.-]+ [\d.-]+ A [\d.-]+ [\d.-]+ 0 [01] [01] [\d.-]+ [\d.-]+$/)
  assert.ok(!d.includes('NaN'))

  // Sweep flag 0 keeps the arc along the bottom. Flipping it would route the
  // fill the long way round, over the top of the circle.
  assert.ok(d.includes(' 0 0 '), 'large-arc and sweep flags should both be 0')
})

test('arcPath is order independent — from/to may arrive either way round', () => {
  // The fill runs between the value and the centre, and the value can be on
  // either side of it. Both orderings must draw the same segment.
  assert.equal(arcPath(0.3, 0.7, CX, CY, R), arcPath(0.7, 0.3, CX, CY, R))
})

test('a zero-length arc is still a valid path', () => {
  // Health age exactly equal to real age: the fill collapses to a point.
  const d = arcPath(0.5, 0.5, CX, CY, R)
  assert.ok(!d.includes('NaN'))
  assert.match(d, /^M /)
})

test('end labels tilt onto the tangent, mirrored either side', () => {
  const left = tangentRotation(0)
  const right = tangentRotation(1)

  assert.ok(left > 0, 'left label tilts one way')
  assert.ok(right < 0, 'right label tilts the other')
  assert.ok(Math.abs(left + right) < 0.001, 'and the two are mirror images')

  // Never upside down — a label rotated past ±90° reads backwards.
  assert.ok(Math.abs(left) <= 90)
  assert.ok(Math.abs(right) <= 90)
  // Flat at the bottom, where the tangent is horizontal.
  assert.ok(Math.abs(tangentRotation(0.5)) < 0.001)
})

test('ticks are ONE dashed path, not sixty elements', () => {
  // This is the ADR-0003 constraint expressed as a test: the tick marks must
  // cost a constant node count no matter how many of them there are, because
  // render-primitive density is what crashed iOS 26.5 at cold mount.
  const { dash } = tickDash(R, 360, 72)
  assert.match(dash, /^[\d.]+ [\d.]+$/, 'a dash array is two numbers, one node')

  // Denser ticks change the pattern, never the node count.
  const dense = tickDash(R, 360, 144)
  assert.notEqual(dense.dash, dash)
  assert.match(dense.dash, /^[\d.]+ [\d.]+$/)
})

test('tick spacing follows arc length, so it stays even at any radius', () => {
  const small = tickDash(40, 360, 36)
  const large = tickDash(160, 360, 36)
  const gapOf = (d) => Number(d.split(' ')[1])
  // Four times the radius, four times the arc, so four times the gap.
  assert.ok(gapOf(large.dash) > gapOf(small.dash) * 3.5)
})

test('tick counts are clamped so a tiny dial cannot become a solid line', () => {
  const { dash } = tickDash(6, 360, 500)
  const [, gap] = dash.split(' ').map(Number)
  assert.ok(gap >= 0, 'gap never goes negative')
  assert.ok(Number.isFinite(gap))

  // Degenerate radius must not produce NaN.
  const zero = tickDash(0, 360, 40)
  assert.ok(!zero.dash.includes('NaN'))
})

test('polar agrees with the compass this file documents', () => {
  const right = polar(0, CX, CY, R)
  const bottom = polar(90, CX, CY, R)
  const left = polar(180, CX, CY, R)
  const top = polar(270, CX, CY, R)

  assert.ok(right.x > CX && Math.abs(right.y - CY) < 0.001)
  assert.ok(bottom.y > CY && Math.abs(bottom.x - CX) < 0.001)
  assert.ok(left.x < CX && Math.abs(left.y - CY) < 0.001)
  assert.ok(top.y < CY && Math.abs(top.x - CX) < 0.001)
})
