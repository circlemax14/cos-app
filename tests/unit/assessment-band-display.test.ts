/**
 * COS-1196 — "it is saying elevated risk 5. What is the meaning of that?"
 *
 * The falls-12 bands carry min/max/severity/careAction. The screen rendered the
 * raw kebab-case label and a bare number, so nothing said 5 of what, nothing
 * said what elevated means, and the history rows had no number at all.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  bandForScore,
  bandRangeLabel,
  careActionText,
  humaniseBandLabel,
  scoreCeiling,
  scoreDelta,
  severityColor,
  type DisplayBand,
} from '../../lib/assessment-band-display.ts'

/** falls-12's real bands, verbatim from the seed. */
const FALLS: DisplayBand[] = [
  { min: 0, max: 3, label: 'low-risk', severity: 'low' },
  { min: 4, max: 7, label: 'elevated-risk', severity: 'moderate', careAction: 'home-safety-review' },
  { min: 8, max: 12, label: 'high-risk', severity: 'high', careAction: 'care-team-check-in' },
]

describe('humaniseBandLabel', () => {
  it('THE POINT: the raw key is never shown', () => {
    assert.equal(humaniseBandLabel('elevated-risk'), 'Elevated risk')
    assert.equal(humaniseBandLabel('high-risk'), 'High risk')
    assert.equal(humaniseBandLabel('positive_screen'), 'Positive screen')
  })

  it('is generic, so a new instrument reads correctly the day it is seeded', () => {
    assert.equal(humaniseBandLabel('some-brand-new-band'), 'Some brand new band')
  })

  it('absent stays absent', () => {
    assert.equal(humaniseBandLabel(undefined), '')
    assert.equal(humaniseBandLabel('   '), '')
  })
})

describe('scoreCeiling', () => {
  it('THE POINT: 5 "out of 12" comes from the top band', () => {
    // An earlier audit concluded no max exists anywhere. True of the instrument
    // root, false of its bands — which is where the scale actually lives.
    assert.equal(scoreCeiling(FALLS), 12)
  })

  it('an unbounded top band has NO honest ceiling', () => {
    assert.equal(scoreCeiling([{ min: 0, max: 3, label: 'low' }, { min: 4, label: 'high' }]), 3)
    assert.equal(scoreCeiling([{ min: 0, label: 'any' }]), null)
    assert.equal(scoreCeiling([]), null)
    assert.equal(scoreCeiling(undefined), null)
  })
})

describe('bandForScore', () => {
  it('5 is the elevated band', () => {
    assert.equal(bandForScore(FALLS, 5)?.label, 'elevated-risk')
  })

  it('the boundaries belong to the band that names them', () => {
    assert.equal(bandForScore(FALLS, 3)?.label, 'low-risk')
    assert.equal(bandForScore(FALLS, 4)?.label, 'elevated-risk')
    assert.equal(bandForScore(FALLS, 7)?.label, 'elevated-risk')
    assert.equal(bandForScore(FALLS, 8)?.label, 'high-risk')
  })

  it('0 is a real score, not a missing one', () => {
    assert.equal(bandForScore(FALLS, 0)?.label, 'low-risk')
  })

  it('no score means no band — never a guess', () => {
    assert.equal(bandForScore(FALLS, null), null)
    assert.equal(bandForScore(undefined, 5), null)
  })
})

describe('bandRangeLabel', () => {
  it('gives "elevated" a number', () => {
    assert.equal(bandRangeLabel(FALLS[1]), '4–7')
  })

  it('handles an open-ended band without inventing a bound', () => {
    assert.equal(bandRangeLabel({ min: 8, label: 'high' }), '8+')
    assert.equal(bandRangeLabel({ max: 3, label: 'low' }), 'up to 3')
    assert.equal(bandRangeLabel({ label: 'any' }), null)
    assert.equal(bandRangeLabel(null), null)
  })
})

describe('careActionText', () => {
  it('surfaces a field that was stored and read by nothing', () => {
    assert.match(String(careActionText('home-safety-review')), /trip hazards/i)
    assert.match(String(careActionText('care-team-check-in')), /care team/i)
  })

  it('an UNKNOWN key is silence, never a raw token', () => {
    // A kebab-case token is worse than nothing on a screen about health.
    assert.equal(careActionText('some-future-action'), null)
    assert.equal(careActionText(undefined), null)
  })
})

describe('scoreDelta', () => {
  it('reports movement in words', () => {
    assert.deepEqual(scoreDelta(5, 3), { icon: 'trending-up', text: 'Up 2 from last time' })
    assert.deepEqual(scoreDelta(3, 5), { icon: 'trending-down', text: 'Down 2 from last time' })
    assert.deepEqual(scoreDelta(4, 4), { icon: 'trending-flat', text: 'Same as last time' })
  })

  it('needs two takes', () => {
    assert.equal(scoreDelta(5, null), null)
    assert.equal(scoreDelta(null, 5), null)
  })

  it('THE JUDGEMENT IS NOT HERE: direction carries no good/bad', () => {
    /*
     * Higher is more risk on falls-12 and BETTER on wellbeing-5. Colouring
     * direction would be wrong on half the catalogue, so movement is reported
     * plainly and the band's severity carries the meaning.
     */
    const up = scoreDelta(9, 2)
    assert.ok(up && !/worse|bad|concern/i.test(up.text))
    const down = scoreDelta(2, 9)
    assert.ok(down && !/better|good|improv/i.test(down.text))
  })
})

describe('severityColor', () => {
  it('maps the three severities', () => {
    assert.notEqual(severityColor('low'), severityColor('moderate'))
    assert.notEqual(severityColor('moderate'), severityColor('high'))
  })

  it('UNKNOWN severity is neutral, never green', () => {
    // Absence of a rating must not read as reassurance.
    const unknown = severityColor(undefined)
    assert.notEqual(unknown, severityColor('low'))
  })
})
