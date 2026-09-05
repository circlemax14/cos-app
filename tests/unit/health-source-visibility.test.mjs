/**
 * COS-897 — a source is shown when this DEVICE could use it, not always.
 *
 * COS-892 briefly listed all three on every device. Vishal, seeing it: "why am
 * I able to see Apple Health, Samsung, and Health Connect on my iPhone?" —
 * Samsung Health on an iPhone is not a choice, on any build, ever. It is noise
 * in a list of two real options.
 *
 * The narrower rule he actually asked for survives and is what these tests
 * defend: HIDE what this device could never use; SHOW, with its reason, what
 * it could use but cannot yet (a native module not in this binary).
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

test('THE POINT: a source this device can never use is not listed at all', () => {
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  assert.ok(fn, 'availability() must exist')
  assert.match(fn[0], /HEALTH_SOURCES\.filter\(/, 'the platform gate is a filter again')
  assert.match(fn[0], /source\.platform !== 'both' && source\.platform !== os/)
  assert.match(fn[0], /return false/, 'and it genuinely excludes')
})

test('the Samsung handset rule excludes too — not an iPhone row with an excuse', () => {
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  assert.match(fn[0], /requiresManufacturer && !brand\.includes\(source\.requiresManufacturer\)/)
})

test('THE POINT: a source that BELONGS here but is not in this build still shows', () => {
  // This is the half of the instruction that survived: a Galaxy owner sees
  // Samsung Health and reads why it is off, rather than it silently vanishing.
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  assert.match(fn[0], /'needs-native-build'/)
  assert.match(fn[0], /isn't in this version of the app/)
})

test('the dead statuses are gone, so nothing can render an unusable row', () => {
  assert.match(src, /export type HealthSourceStatus = 'connectable' \| 'needs-native-build';/)
})

test('every branch carries a user-facing reason', () => {
  const fn = src.match(/export function availability\([\s\S]*?\n\}/)
  const notes = fn[0].match(/note:/g) ?? []
  const statuses = fn[0].match(/status: '/g) ?? []
  assert.equal(notes.length, statuses.length, 'every branch returns a note')
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

// ── COS-897: the drawer row and the route guard obey the same entitlement ──

test('THE POINT: the Health Sync row is gated on the key the enforcer uses', () => {
  // patient-capabilities maps /Home/apple-health to `apple-health.view`, and
  // useEnforceScreenAccess redirects to Home when the plan lacks it. With the
  // feature off, the row still rendered and dumped the patient on Home with no
  // explanation. Vishal: "when I click on the Apple Health, it is not taking me
  // to any screen. It is taking me to the home screen."
  const drawer = code('components/profile-content.tsx')
  assert.match(drawer, /useCanRender\('apple-health\.view'\)/)
  assert.match(drawer, /Platform\.OS === 'ios' && canOpenHealthSync &&/)
})

test('the row is labelled for the screen it opens', () => {
  const drawer = code('components/profile-content.tsx')
  assert.match(drawer, /label="Health Sync"/)
  assert.doesNotMatch(drawer, /label="Apple Health"/)
})

test('the ROUTE keeps its filename — renaming it would break every deep link', () => {
  const drawer = code('components/profile-content.tsx')
  assert.match(drawer, /go\('\/Home\/apple-health'\)/)
})
