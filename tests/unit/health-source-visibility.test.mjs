/**
 * COS-892 — every health source is listed on every device, with its reason.
 *
 * availability() used to FILTER: Apple Health was not returned at all on
 * Android, Samsung Health not on a Pixel. Vishal: "I don't want to remove that
 * card only which is available according to device. We just need to show these
 * options."
 *
 * The platform rule did not go away — it now decides the STATUS instead of
 * membership, and only 'connectable' is ever given a working control. These
 * tests exist to stop the rule being lost along with the filter.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// react-native is not importable under node --test, so this reads the source.
const code = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const src = code('services/health-sources.ts')
const screen = code('app/Home/apple-health.tsx')

test('THE POINT: availability() no longer drops a source from the list', () => {
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  assert.ok(fn, 'availability() must exist')
  assert.match(fn[0], /HEALTH_SOURCES\.map\(/, 'it must map over every source')
  assert.doesNotMatch(fn[0], /HEALTH_SOURCES\.filter\(/, 'filtering is what hid the rows')
  assert.doesNotMatch(fn[0], /return false/, 'a source is never excluded now')
})

test('the platform rule survives as a STATUS, not as an omission', () => {
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  assert.match(fn[0], /source\.platform !== 'both' && source\.platform !== os/)
  assert.match(fn[0], /'wrong-platform'/)
})

test('the Samsung handset rule survives too', () => {
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  assert.match(fn[0], /requiresManufacturer && !brand\.includes\(source\.requiresManufacturer\)/)
  assert.match(fn[0], /'wrong-device'/)
})

test('every status carries a user-facing reason', () => {
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  const notes = fn[0].match(/note:/g) ?? []
  const statuses = fn[0].match(/status: '/g) ?? []
  assert.equal(notes.length, statuses.length, 'every branch returns a note')
  assert.ok(statuses.length >= 4, 'connectable, needs-native-build, wrong-platform, wrong-device')
})

test('THE POINT: only a connectable source can actually be connected', () => {
  // The screen already refuses; this asserts the SERVICE refuses too, because
  // the screen is not the guard — a deep link or a later caller would skip it.
  const fn = src.match(/export async function connectHealthSource\([\s\S]*?\n  try \{/)
  assert.ok(fn, 'connectHealthSource must exist')
  assert.match(fn[0], /offer\.status !== 'connectable'/)
  assert.match(fn[0], /return \{ ok: false/)
})

test('the screen still gates its control on connectable', () => {
  assert.match(screen, /offer\.status !== 'connectable'/)
  assert.match(screen, /isConnectable = offer\.status === 'connectable'/)
})

test('one source at a time is still the model', () => {
  assert.match(src, /export interface ConnectedHealthSource/)
  assert.match(src, /const replaced = previous && previous\.id !== source\.id/)
})
