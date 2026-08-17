/**
 * The arc's geometry, and the two things about it that are easy to get wrong.
 *
 * The arc is the first thing in this app that needs react-native-svg, and it
 * is the reason a new binary exists. Its maths is worth pinning before that
 * binary goes to review, because a wrong sweep is not a crash — it is a
 * plausible-looking gauge pointing at the wrong number.
 *
 * Source-read rather than rendered: there is no SVG renderer under
 * `node --test`, and what matters here is the geometry contract and the
 * envelope, both of which the source proves.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARC = readFileSync(join(HERE, '..', 'components', 'health', 'ScoreArc.tsx'), 'utf8')
const RING = readFileSync(join(HERE, '..', 'components', 'health', 'MarkerRing.tsx'), 'utf8')
const HA = readFileSync(join(HERE, '..', 'app', 'Home', 'health-age.tsx'), 'utf8')
const WB = readFileSync(join(HERE, '..', 'app', 'Home', 'wellbeing-score.tsx'), 'utf8')

test('the arc clamps, so an extreme value cannot render off the end', () => {
  // A health age 30 years from chronological would otherwise draw outside the
  // gauge and read as a full sweep.
  assert.match(ARC, /Math\.max\(0, Math\.min\(1,/)
})

test('the sweep runs BETWEEN the two ages, not from one end', () => {
  // Its length is then the size of the gap, which is the only reading that
  // means anything. A sweep from the left end just encodes the raw value.
  assert.match(ARC, /const from = Math\.min\(valueT, centerT\)/)
  assert.match(ARC, /const to = Math\.max\(valueT, centerT\)/)
})

test('Health Age centres the arc on the patient’s real age', () => {
  // "Left of the middle" must reliably mean younger. Centring on the health
  // age would move the meaning of the midpoint every week.
  assert.match(HA, /<ScoreArc[\s\S]{0,220}center=\{chrono\}/)
})

test('Wellbeing centres on 50 — the OPPOSITE convention, deliberately', () => {
  // Wellbeing runs 0-100 and higher is better; there is no personal reference
  // point to centre on, so the midpoint is the scale's middle. Passing the
  // patient's own score as the centre would make the midpoint meaningless.
  assert.match(WB, /<ScoreArc[\s\S]{0,260}center=\{50\}/)
  assert.match(WB, /span=\{50\}/)
})

test('the arc only renders when BOTH ends are known', () => {
  // An arc with one endpoint missing is a decoration, not a scale.
  assert.match(HA, /typeof chrono === 'number' && typeof overall === 'number' \? \(\s*<ScoreArc/)
})

test('a zero-fraction ring paints NO sweep', () => {
  // A zero-length dash still renders its round cap, which looks like a small
  // filled pip and implies data that is not there.
  assert.match(RING, /safe <= 0 \? 0 :/)
  assert.match(RING, /dash > 0 \?/)
})

test('the ring starts at twelve o’clock', () => {
  // SVG circles start at 3 o'clock. A progress ring that begins on the right
  // reads as already part-complete.
  assert.match(RING, /rotate\(-90/)
})

test('no animation on either — the envelope is relaxed for SVG, not for motion', () => {
  // ADR-0003 traced the crashes to primitive density and native cost on cold
  // mount. Adding a static arc to a navigated-to detail screen is a different
  // situation from animating one; the second is not licensed by the first.
  for (const [name, src] of [['ScoreArc', ARC], ['MarkerRing', RING]]) {
    const imports = src.split('\n').filter((l) => l.startsWith('import'))
    const rn = imports.find((l) => l.includes("from 'react-native'")) ?? ''
    assert.ok(!/\bAnimated\b/.test(rn), `${name} imports Animated`)
    assert.ok(!imports.some((l) => l.includes('reanimated')), `${name} imports reanimated`)
  }
})

test('the node count is fixed, independent of how much data exists', () => {
  // The density argument only holds if the arc cannot grow. Two Paths and two
  // Circles, always.
  const paths = (ARC.match(/<Path\b/g) ?? []).length
  const circles = (ARC.match(/<Circle\b/g) ?? []).length
  assert.equal(paths, 2)
  assert.equal(circles, 2)
})
