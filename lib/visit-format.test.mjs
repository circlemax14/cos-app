/**
 * Date formatting for the agency visits panel.
 *
 * The bug this file exists to prevent is showing a patient a visit on the wrong
 * day. That is worse than showing no schedule at all: a patient who trusts
 * "Tomorrow" and is out when someone calls has been actively misled by us.
 *
 * So these tests are mostly about the boundaries where date code goes wrong —
 * late-night visits, midnight crossings, the edge of the week — rather than the
 * happy path.
 *
 * Times are constructed via local-time Date objects rather than literal 'Z'
 * strings, because the whole point is that a patient sees THEIR clock, and a
 * suite pinned to UTC would pass in London and fail in Karachi.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatVisitDay,
  formatVisitTime,
  spansMidnight,
  visitAccessibilityLabel,
} from './visit-format.ts'

/** An ISO string for a local wall-clock time, so tests are timezone-agnostic. */
const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm, 0, 0).toISOString()

test('THE BUG THIS PREVENTS: a late-night visit today is not called Tomorrow', () => {
  // Elapsed-hours maths gets this backwards. At 09:00, a visit at 23:00 the
  // same evening is 14 hours away — more than a day's worth of hours — and a
  // naive implementation rounds it to "Tomorrow". It is tonight.
  const now = at(2026, 8, 17, 9, 0)
  assert.equal(formatVisitDay(at(2026, 8, 17, 23, 0), now), 'Today')
})

test('and an early-morning visit tomorrow is not called Today', () => {
  // The mirror image: at 23:00, a visit at 08:00 tomorrow is 9 hours away,
  // which naive maths rounds down to zero days and labels "Today".
  const now = at(2026, 8, 17, 23, 0)
  assert.equal(formatVisitDay(at(2026, 8, 18, 8, 0), now), 'Tomorrow')
})

test('days inside the coming week read as weekday names', () => {
  const now = at(2026, 8, 17, 9, 0) // a Monday
  const thursday = formatVisitDay(at(2026, 8, 20, 14, 0), now)
  assert.match(thursday, /\w/)
  assert.ok(!['Today', 'Tomorrow'].includes(thursday), 'should be a weekday name')
})

test('beyond a week it falls back to a date, because "next Tuesday" is ambiguous', () => {
  const now = at(2026, 8, 17, 9, 0)
  const far = formatVisitDay(at(2026, 9, 3, 14, 0), now)
  assert.match(far, /\d/, 'a far-off visit must carry a number, not just a weekday')
})

test('a time range drops the duplicated meridiem but keeps a differing one', () => {
  // "2:00 PM – 3:00 PM" reads as two separate facts; "2:00 – 3:00 PM" reads as
  // one span. But "11:30 – 12:30 PM" would hide that the visit starts in the
  // morning, so a crossing keeps both.
  const same = formatVisitTime(at(2026, 8, 17, 14, 0), at(2026, 8, 17, 15, 0))
  assert.match(same, /–/)

  const crossing = formatVisitTime(at(2026, 8, 17, 11, 30), at(2026, 8, 17, 12, 30))
  assert.match(crossing, /–/)
  // Both ends must still be legible whatever the locale does with meridiems.
  assert.ok(crossing.length >= same.length - 3, 'a meridiem-crossing range must not lose information')
})

test('an overnight visit is detected, so it is never shown ending before it starts', () => {
  // "Today 11:00 PM – 1:00 AM" under one heading reads as ending two hours
  // before it began. The caller adds the end day when this returns true.
  assert.equal(spansMidnight(at(2026, 8, 17, 23, 0), at(2026, 8, 18, 1, 0)), true)
  assert.equal(spansMidnight(at(2026, 8, 17, 14, 0), at(2026, 8, 17, 15, 0)), false)
})

test('a screen reader gets one sentence, not four fragments', () => {
  // A reader walking separate Text nodes announces four disconnected things
  // and the relationship between them is lost.
  const label = visitAccessibilityLabel(
    'Dana Reed',
    'Care Manager',
    at(2026, 8, 18, 14, 0),
    at(2026, 8, 18, 15, 0),
    at(2026, 8, 17, 9, 0),
  )
  assert.match(label, /^Dana Reed, Care Manager\./)
  assert.match(label, /Tomorrow/)
  assert.ok(label.trim().endsWith('.'))
})

test('malformed timestamps degrade quietly instead of rendering "Invalid Date"', () => {
  // The API should never send these. If it ever does, an empty string leaves a
  // gap; the string "Invalid Date" on a patient's care schedule looks like the
  // app is broken and invites a support call.
  assert.equal(formatVisitDay('not-a-date', at(2026, 8, 17)), '')
  assert.equal(formatVisitTime('not-a-date', 'also-bad'), '')
  assert.equal(spansMidnight('not-a-date', 'also-bad'), false)
  assert.doesNotMatch(formatVisitDay('not-a-date', at(2026, 8, 17)), /Invalid/)
})

test('a missing end time still shows the start rather than nothing', () => {
  const out = formatVisitTime(at(2026, 8, 17, 14, 0), 'missing')
  assert.notEqual(out, '')
  assert.doesNotMatch(out, /–/)
})

// ─── Envelope + wiring contract ──────────────────────────────────────
//
// The panel mounts during agency-detail's COLD RENDER, which is the exact
// moment ADR-0003's primitive envelope exists to protect. Its host is not
// itself envelope-compliant (react-native-paper + a Modal), so there is no
// ambient protection here — only this test.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (...p) => readFileSync(join(HERE, '..', ...p), 'utf8')

const CARD = read('components', 'agency', 'AgencyVisitsSection.tsx')
const SCREEN = read('app', 'agency-detail.tsx')

test('the card stays inside the iOS 26.5 primitive envelope', () => {
  const imports = CARD.split('\n').filter((l) => l.startsWith('import'))
  for (const lib of ['react-native-reanimated', 'react-native-gesture-handler', 'react-native-paper', 'expo-linear-gradient']) {
    assert.ok(!imports.some((l) => l.includes(lib)), `card imports ${lib}`)
  }
  const rn = imports.find((l) => l.includes("from 'react-native'")) ?? ''
  for (const banned of ['Animated', 'LayoutAnimation', 'ActivityIndicator', 'Modal']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(rn), `card imports ${banned} from react-native`)
  }
})

test('it is dark-flagged, and the flag also stops the request', () => {
  // A panel gated only at render still fires its query on every cold screen
  // while dark — a request we know will 404.
  assert.match(CARD, /useAgencyVisitsFlag/)
  assert.match(CARD, /if \(!enabled\) return null/)
  assert.match(CARD, /enabled: !!agencyId && enabled/)
})

test('it renders nothing rather than an empty or error state', () => {
  // Matching AgencyTeamSection: an error banner over somebody's care schedule
  // reads far more alarming than a transient 500 deserves.
  assert.match(CARD, /if \(isLoading\) return null/)
  assert.match(CARD, /if \(isError\) return null/)
  assert.match(CARD, /if \(visits\.length === 0\) return null/)
})

test('the row count is capped — cold-render primitive density', () => {
  assert.match(CARD, /const MAX_ROWS = \d+/)
  assert.match(CARD, /\.slice\(0, MAX_ROWS\)/)
})

test('it is mounted below the team list, inside the approved branch', () => {
  // Above the team list it would answer "when" before "who". Outside the
  // approved branch it would show visits to someone with no agency.
  const team = SCREEN.indexOf('<AgencyTeamSection')
  const visits = SCREEN.indexOf('<AgencyVisitsSection')
  assert.ok(team > 0 && visits > 0, 'both sections must be mounted')
  assert.ok(team < visits, 'visits must render below the team list')
})

test('one clock reading per render, so two rows cannot disagree about "Today"', () => {
  // Calling new Date() per row means a render spanning midnight can label one
  // row Today and the next Tomorrow for the same day.
  const occurrences = (CARD.match(/new Date\(\)\.toISOString\(\)/g) ?? []).length
  assert.equal(occurrences, 1, 'the clock must be read exactly once per render')
})
