/**
 * The Health Age screen's Bevel-referenced structure.
 *
 * These exist because this task was previously reported as done when it was
 * not. #403 and #404 changed a chart element and the todo was closed; the
 * screen-level work — the part actually asked for — had not happened. A
 * source-read contract is the cheapest thing that would have caught that, so
 * it is what goes in now.
 *
 * What is asserted is STRUCTURE, not pixels: which blocks exist, what order
 * they render in, and that the previously-hidden information is no longer
 * behind a tap. Those are the claims that were wrong before.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(join(HERE, '..', 'app', 'Home', 'health-age.tsx'), 'utf8')

test('THE GAP: what drives the number is VISIBLE, not behind an accordion', () => {
  // Bevel's pattern is a primary number followed by supporting metrics as
  // compact cards. Ours had the same information collapsed, so the answer to
  // the screen's obvious question — "why is my health age this?" — was
  // invisible unless you went looking.
  assert.match(SRC, /function ContributorCards/)
  assert.match(SRC, /<ContributorCards/)
})

test('markers are GROUPED, not listed as raw lab names', () => {
  // The reference lists five readable rows; ours listed nine analytes. A
  // patient reading "Red-cell distribution width — 0.4 years older" has
  // nothing to do with it. Grouping was the biggest gap from the reference,
  // and the only large one fixable without a native dependency.
  const fn = SRC.slice(SRC.indexOf('function ContributorCards'), SRC.indexOf('function ContributorsAccordion'))
  assert.match(fn, /groupMarkers\(/)
  // The analytes must still be reachable — grouped is not the same as hidden.
  assert.match(fn, /g\.members\.map/)
})

test('THE CORRECTION: markers with no data are NOT dropped', () => {
  // My first pass capped this list at six and sorted by impact, which deletes
  // exactly the rows a patient most needs. Vishal's second Bevel reference
  // renders Sleep / Activity / Fitness as "No data available" rather than
  // hiding them — those rows are the actionable ones, and the only thing that
  // moves the coverage figure above.
  //
  // The cap is gone deliberately: the model has ~9 measured markers, a bounded
  // list, so the density argument that justified capping an unbounded grid
  // does not apply.
  const fn = SRC.slice(SRC.indexOf('function ContributorCards'), SRC.indexOf('function ContributorsAccordion'))
  assert.doesNotMatch(fn, /\.slice\(0, \d+\)/, 'the marker list must not be truncated')
  assert.match(fn, /markerPhrase\(/, 'empty markers must be phrased, not filtered out')
})

test('the full list is still reachable — capped is not the same as hidden', () => {
  assert.match(SRC, /function ContributorsAccordion/)
  assert.match(SRC, /<ContributorsAccordion/)
})

test('reading order: number → trend → what drives it → what to do', () => {
  // Order is the design decision. Driving factors must come before advice:
  // "here is what to change" is meaningless before "here is what is wrong".
  const hero = SRC.indexOf('<HeroTile')
  const trend = SRC.indexOf('<TrendCard')
  const cards = SRC.indexOf('<ContributorCards')
  const improve = SRC.indexOf('<ImprovementSection')
  assert.ok(hero > 0 && trend > 0 && cards > 0 && improve > 0, 'all four blocks must render')
  assert.ok(hero < trend, 'the number comes before its trend')
  assert.ok(trend < cards, 'the trend comes before its drivers')
  assert.ok(cards < improve, 'drivers come before advice')
})

test('the hero is centred and dated, which it was not before', () => {
  // The reference centres the primary number with the date beneath. Ours was
  // left-aligned and carried no date at all — on a figure that moves slowly,
  // "as of when" is not decoration.
  //
  // Case-insensitive deliberately: the copy is now "As of Aug 15", sentence
  // case, sitting under the title inside the dial rather than as a trailing
  // footnote. Pinning the exact casing tested the wrong thing.
  assert.match(SRC, /heroCentered/)
  assert.match(SRC, /as of \$\{/i)
})

test('THE SHAPE: the dial WRAPS the hero content, it is not a sibling above it', () => {
  // This is the correction that made the screen finally match its reference.
  // The first gauge was a semicircular dome rendered ABOVE the number — a
  // chart with a caption. A dial is a ring with the number INSIDE it, and the
  // difference is the whole visual identity of the screen.
  //
  // Asserted structurally: the gauge must take children, and the content must
  // be passed INTO it rather than rendered next to it.
  const hero = SRC.slice(SRC.indexOf('function HeroTile'), SRC.indexOf('interface TrendCardProps'))
  assert.match(hero, /<DialGauge/)
  assert.match(hero, /\{dialContents\}\s*<\/DialGauge>/, 'the content must be a CHILD of the gauge')
  assert.doesNotMatch(hero, /<ScoreArc/, 'the old dome must be gone, not merely unused')
})

test('the dial is omitted when there is no real age to centre it on', () => {
  // A scale needs both endpoints. Drawing the ring with one missing would
  // render a gauge whose midpoint means nothing.
  const hero = SRC.slice(SRC.indexOf('function HeroTile'), SRC.indexOf('interface TrendCardProps'))
  assert.match(hero, /typeof chrono === 'number' \? \(/)
})

test('the redundant "vs chronological age" line is gone, not just moved', () => {
  // It restated, in a second format, what "8.3 years younger" already says,
  // and the real age is printed under the arc. Two ways of saying one thing
  // is how a hero gets cluttered.
  const hero = SRC.slice(SRC.indexOf('function HeroTile'), SRC.indexOf('interface TrendCardProps'))
  assert.doesNotMatch(hero, /vs chronological age \{/)
})

test('the week-change pill sits INSIDE the dial, not in its own section', () => {
  // It qualifies the number, so it belongs with the number. Rendered a
  // section below, it read as an unrelated statistic.
  const hero = SRC.slice(SRC.indexOf('function HeroTile'), SRC.indexOf('interface TrendCardProps'))
  assert.match(hero, /weekChange\(buckets/)
  assert.match(hero, /styles\.weekPill/)
})

test('a missing date is omitted rather than guessed', () => {
  // A wrong date on a health figure is worse than no date.
  const hero = SRC.slice(SRC.indexOf('function HeroTile'))
  assert.match(hero, /if \(!newest\) return null/)
  assert.match(hero, /Number\.isNaN\(d\.getTime\(\)\)/)
})

test('data coverage is surfaced, and never called "confidence"', () => {
  // The reference puts a confidence card under the hero — 92% green on one
  // screen, 56% amber on the other. Ours reports the same shape of information
  // under an honest name: what is computable is coverage, not a statistical
  // confidence interval, and mislabelling it would put a figure in front of a
  // clinician that looks like it came from the model's error bounds.
  assert.match(SRC, /function CoverageCard/)
  assert.match(SRC, /<CoverageCard/)
  const fn = SRC.slice(SRC.indexOf('function CoverageCard'), SRC.indexOf('function ContributorCards'))
  assert.doesNotMatch(fn, /\bconfidence\b/i)
  assert.match(fn, /% of markers current/)
})

test('the hero leads with the gap, in plain language', () => {
  // "vs chronological age 44" makes the reader do the subtraction. "8.3 years
  // younger" is the whole finding in three words, which is what the reference
  // puts directly under the number.
  assert.match(SRC, /gapPhrase\(/)
  assert.match(SRC, /formatAge\(overall\)/)
})

test('week-over-week movement is shown', () => {
  assert.match(SRC, /weekChange\(/)
})

test('it stays inside the iOS 26.5 primitive envelope', () => {
  // This screen documents the envelope in its own header. The cards must not
  // be the thing that breaks it.
  const imports = SRC.split('\n').filter((l) => l.startsWith('import'))
  const rn = imports.find((l) => l.includes("from 'react-native'")) ?? ''
  for (const banned of ['Animated', 'LayoutAnimation', 'ActivityIndicator', 'Modal']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(rn), `imports ${banned}`)
  }
  for (const lib of ['react-native-reanimated', 'react-native-svg', 'expo-linear-gradient']) {
    assert.ok(!imports.some((l) => l.includes(lib)), `imports ${lib}`)
  }
})
