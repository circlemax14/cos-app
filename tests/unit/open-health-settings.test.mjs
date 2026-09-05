/**
 * COS-901 — the Settings button lands on the HEALTH permission page.
 *
 * Vishal: "when I click on the open settings, it is taking me to the settings
 * screen where I have options like allow CSH to access Reminders, Photos,
 * Siri, Calendar... It doesn't have this Apple Health. That URL was different."
 *
 * He is right, and the app used to do it properly: `openHealthSettings` opened
 * App-Prefs:root=Privacy&path=HEALTH from the Today's Schedule Health Metrics
 * block, and was deleted in build 45 as collateral when that whole block was
 * pulled — not for any platform reason.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const lib = code('lib/open-health-settings.ts')
const screen = code('app/Home/apple-health.tsx')

test('THE POINT: it targets the Health privacy page, the URL that went missing', () => {
  assert.match(lib, /App-Prefs:root=Privacy&path=HEALTH/)
})

test('and that is tried FIRST, before anything more generic', () => {
  const fn = lib.match(/export async function openHealthSettings\(\)[\s\S]*?\n\}/)
  assert.ok(fn, 'openHealthSettings must exist')
  const privacy = fn[0].indexOf('IOS_HEALTH_PRIVACY')
  const healthApp = fn[0].indexOf('IOS_HEALTH_APP')
  const appSettings = fn[0].indexOf('openSettings')
  assert.ok(privacy > -1 && healthApp > privacy, 'the Health app is the second rung')
  assert.ok(appSettings > healthApp, 'this app\'s own page is the last rung')
})

test('THE POINT: openURL, not canOpenURL — canOpenURL would fail over an OTA', () => {
  // canOpenURL returns false for any scheme not in LSApplicationQueriesSchemes,
  // and declaring one needs a new binary. The guarded version would have
  // dropped straight to the generic page — which is the bug being fixed.
  assert.match(lib, /Linking\.openURL\(url\)/)
  assert.doesNotMatch(lib, /canOpenURL/)
})

test('every rung can fail without throwing', () => {
  assert.match(lib, /async function tryOpen[\s\S]*?catch \{\s*return false;/)
  assert.match(lib, /return 'failed';/)
})

test('Android gets its own destination, not the iOS one', () => {
  assert.match(lib, /android\.health\.connect\.action\.HEALTH_HOME_SETTINGS/)
  const fn = lib.match(/export async function openHealthSettings\(\)[\s\S]*?\n\}/)
  assert.match(fn[0], /Platform\.OS === 'ios'/)
  assert.match(fn[0], /Platform\.OS === 'android'/)
})

test('THE POINT: the follow-up line matches where the patient actually landed', () => {
  // Rung 1 needs no instructions — they are looking at the list. The lower
  // rungs do, and saying nothing is how someone decides the app is broken.
  assert.match(lib, /case 'health-privacy':\s*\n\s*return null;/)
  assert.match(lib, /under Sharing, then Apps/)
  assert.match(lib, /Health permissions are not on this page/)
})

test('the screen uses the ladder and stops calling openSettings directly', () => {
  assert.match(screen, /openHealthSettings\(\)/)
  assert.match(screen, /healthSettingsFollowUp\(target\)/)
  assert.doesNotMatch(screen, /Linking\.openSettings\(\)/)
})
