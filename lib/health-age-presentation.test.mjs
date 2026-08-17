/**
 * How the Health Age screen phrases its finding, and how honest it is about
 * the data underneath.
 *
 * The single most damaging bug this file can have is inverting the sign on the
 * gap — congratulating a patient whose health age is CLIMBING. That is not a
 * cosmetic error and it would look completely plausible on screen, so both
 * directions are pinned explicitly.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatAge,
  gapPhrase,
  weekChange,
  coverage,
  rangePosition,
} from './health-age-presentation.ts'

test('THE DANGEROUS ONE: a NEGATIVE gap is younger, a positive gap is older', () => {
  // gap = healthAge - chronologicalAge. Inverting this congratulates someone
  // who is getting worse. It would read perfectly on screen.
  assert.equal(gapPhrase(-8.3).direction, 'younger')
  assert.match(gapPhrase(-8.3).text, /8\.3 years younger/)

  assert.equal(gapPhrase(3.2).direction, 'older')
  assert.match(gapPhrase(3.2).text, /3\.2 years older/)
})

test('a gap under a tenth of a year claims no direction', () => {
  // A tenth of a year is about five weeks. Calling that "younger" implies a
  // precision this model does not have.
  assert.equal(gapPhrase(0.04).direction, 'even')
  assert.equal(gapPhrase(-0.04).direction, 'even')
  assert.match(gapPhrase(0).text, /about the same/)
})

test('a missing gap produces no phrase rather than a wrong one', () => {
  assert.equal(gapPhrase(null).text, '')
  assert.equal(gapPhrase(undefined).text, '')
  assert.equal(gapPhrase(NaN).text, '')
})

test('the age carries one decimal, not a rounded integer', () => {
  // A figure that moves ~1 year annually earns a decimal; rounding to 36 hides
  // every change smaller than six months.
  assert.equal(formatAge(36.04), '36.0')
  assert.equal(formatAge(36.96), '37.0')
  assert.equal(formatAge(null), '—')
  assert.equal(formatAge(NaN), '—')
})

test('"from last week" means at least five days, not just the previous point', () => {
  // Buckets are irregular. Comparing two points a day apart and labelling it
  // "from last week" is a claim about a timescale the data does not support.
  const tooClose = weekChange([
    { bucketDate: '2026-08-16', healthAge: 36.7 },
    { bucketDate: '2026-08-17', healthAge: 36.0 },
  ])
  assert.equal(tooClose.text, '', 'a one-day gap must not be reported as a week')

  const proper = weekChange([
    { bucketDate: '2026-08-10', healthAge: 36.7 },
    { bucketDate: '2026-08-17', healthAge: 36.0 },
  ])
  assert.equal(proper.direction, 'down')
  assert.match(proper.text, /0\.7 from last week/)
})

test('week change reports DOWN as the improving direction', () => {
  // Falling health age is good news. Same inversion risk as the gap.
  const up = weekChange([
    { bucketDate: '2026-08-01', healthAge: 36.0 },
    { bucketDate: '2026-08-17', healthAge: 36.9 },
  ])
  assert.equal(up.direction, 'up')
})

test('coverage EXCLUDES terms that are always present', () => {
  // chronologicalAge and intercept exist by construction. Counting them
  // inflates every score, and inflates it most when real data is thinnest —
  // exactly when honesty matters.
  const c = coverage([
    { name: 'chronologicalAge', status: 'fresh' },
    { name: 'intercept', status: 'fresh' },
    { name: 'albumin', status: 'fresh' },
    { name: 'crp', status: 'missing' },
  ])
  assert.equal(c.total, 2, 'only the measured markers count')
  assert.equal(c.fresh, 1)
  assert.equal(c.percent, 50)
})

test('coverage language degrades honestly as data thins', () => {
  const mk = (fresh, total) =>
    coverage([
      ...Array.from({ length: fresh }, (_, i) => ({ name: `m${i}`, status: 'fresh' })),
      ...Array.from({ length: total - fresh }, (_, i) => ({ name: `x${i}`, status: 'missing' })),
    ])

  assert.match(mk(9, 9).label, /Complete/)
  assert.match(mk(6, 9).label, /Good/)
  assert.match(mk(3, 9).label, /Partial/)
  assert.match(mk(1, 9).label, /Limited/)

  // The thin case must SAY the estimate is unreliable, not just score low.
  assert.match(mk(1, 9).detail, /may change a lot/)
})

test('coverage is never called "confidence"', () => {
  // What is computable here is data completeness, not a statistical
  // confidence interval. Labelling it "confidence" would put a number in front
  // of a clinician that looks like it came from the model's error bounds when
  // it came from counting rows.
  const c = coverage([{ name: 'albumin', status: 'fresh' }])
  assert.doesNotMatch(c.label + c.detail, /confidence/i)
})

test('coverage returns null when there is nothing measurable', () => {
  assert.equal(coverage([]), null)
  assert.equal(coverage([{ name: 'intercept', status: 'fresh' }]), null)
})

test('the range bar is centred on chronological age, always', () => {
  // The midpoint must always mean "exactly your age". Centring on the health
  // age instead would move the meaning of the middle every week.
  const r = rangePosition(36, 44.3)
  assert.equal(r.chronoAt, 0.5)
  assert.ok(r.healthAt < 0.5, 'a younger health age sits left of centre')

  const older = rangePosition(50, 44.3)
  assert.ok(older.healthAt > 0.5, 'an older health age sits right of centre')
})

test('the range bar clamps rather than overflowing', () => {
  // A health age 30 years from chronological would otherwise render off the
  // end of the bar.
  const r = rangePosition(90, 44.3)
  assert.ok(r.healthAt <= 1)
  assert.ok(r.healthAt >= 0)
})

test('the range bar is omitted when either age is unknown', () => {
  assert.equal(rangePosition(null, 44), null)
  assert.equal(rangePosition(36, null), null)
})

// ─── From Ken's second Bevel reference (the DEGRADED state) ──────────
//
// The second screenshot is the more instructive one: 56% confidence in amber,
// and Sleep / Activity / Fitness all rendering as "No data available" rather
// than being dropped from the list.

import { markerPhrase, orderMarkers } from './health-age-presentation.ts'

test('THE CORRECTION: a marker with no data still gets a row', () => {
  // My first pass sorted by impact and took the top six, which pushes empty
  // markers to the bottom and cuts them — the exact opposite of the reference.
  // Those rows are the most actionable thing on the screen: they say what to
  // connect or go and measure, and they are the only thing that moves the
  // coverage figure.
  const p = markerPhrase(null, 'missing')
  assert.equal(p.text, 'No data available')
  assert.equal(p.tone, 'none')
})

test('a stale marker reads as missing, not as a stale number', () => {
  // A number from eight months ago presented as current is worse than an
  // honest blank.
  assert.equal(markerPhrase(null, 'stale').text, 'No data available')
})

test('marker direction matches the hero: negative is younger', () => {
  assert.equal(markerPhrase(-15.2, 'fresh').tone, 'younger')
  assert.match(markerPhrase(-15.2, 'fresh').text, /15\.2 years younger/)
  assert.equal(markerPhrase(1.4, 'fresh').tone, 'older')
})

test('a zero contribution renders as 0.0, exactly as the reference shows', () => {
  // Bevel shows "Lifestyle 0.0 years younger". A marker that genuinely nets to
  // nothing is a real reading and must not be blanked as "no data".
  const p = markerPhrase(0, 'fresh')
  assert.match(p.text, /0\.0 years younger/)
  assert.notEqual(p.tone, 'none')
})

test('ordering: markers with readings first, empties last, both kept', () => {
  const ordered = orderMarkers([
    { name: 'sleep', contributionYears: null, status: 'missing' },
    { name: 'blood', contributionYears: -15.2, status: 'fresh' },
    { name: 'lifestyle', contributionYears: 0, status: 'fresh' },
    { name: 'activity', contributionYears: null, status: 'missing' },
  ])
  assert.equal(ordered.length, 4, 'nothing is dropped')
  assert.equal(ordered[0].name, 'blood', 'biggest effect leads')
  assert.equal(ordered[1].name, 'lifestyle')
  assert.ok(['sleep', 'activity'].includes(ordered[3].name), 'empties sink to the bottom')
})

test('ordering ranks by MAGNITUDE, so a large negative outranks a small positive', () => {
  // "15.2 years younger" is a bigger finding than "0.3 years older", even
  // though it sorts lower numerically. Signed sorting would bury it.
  const ordered = orderMarkers([
    { name: 'small', contributionYears: 0.3, status: 'fresh' },
    { name: 'big', contributionYears: -15.2, status: 'fresh' },
  ])
  assert.equal(ordered[0].name, 'big')
})

test('coverage carries a tone so the card can go amber like the reference', () => {
  const mk = (fresh, total) =>
    coverage([
      ...Array.from({ length: fresh }, (_, i) => ({ name: `m${i}`, status: 'fresh' })),
      ...Array.from({ length: total - fresh }, (_, i) => ({ name: `x${i}`, status: 'missing' })),
    ])
  assert.equal(mk(9, 9).tone, 'good')
  assert.equal(mk(5, 9).tone, 'caution') // ~56%, the reference's amber case
  assert.equal(mk(1, 9).tone, 'weak')
})
