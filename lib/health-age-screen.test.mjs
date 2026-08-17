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

test('the cards are ranked by impact, not alphabetically', () => {
  // The top-left card must be the thing most worth acting on. Alphabetical
  // ordering makes a glance useless, which defeats the point of surfacing it.
  const fn = SRC.slice(SRC.indexOf('function ContributorCards'))
  assert.match(fn, /\.sort\(\(a, b\) =>/)
  assert.match(fn, /contributionYears/)
})

test('the card count is capped — cold-render primitive density', () => {
  // ADR-0003 traced the iOS 26.5 crashes to primitive density rather than any
  // single component. An unbounded grid on a patient with a full lab panel
  // would recreate the original condition.
  const fn = SRC.slice(SRC.indexOf('function ContributorCards'))
  assert.match(fn, /\.slice\(0, \d+\)/)
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
  // Bevel centres the primary number with the date beneath. Ours was
  // left-aligned and carried no date at all — on a figure that moves slowly,
  // "as of when" is not decoration.
  assert.match(SRC, /heroCentered/)
  assert.match(SRC, /as of \$\{/)
})

test('a missing date is omitted rather than guessed', () => {
  // A wrong date on a health figure is worse than no date.
  const hero = SRC.slice(SRC.indexOf('function HeroTile'))
  assert.match(hero, /if \(!newest\) return null/)
  assert.match(hero, /Number\.isNaN\(d\.getTime\(\)\)/)
})

test('a FRESH badge is not printed on every card', () => {
  // A badge on all of them is noise, and noise is exactly what stops the one
  // STALE badge from being noticed.
  const fn = SRC.slice(SRC.indexOf('function ContributorCards'))
  assert.match(fn, /c\.status !== 'fresh'/)
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
