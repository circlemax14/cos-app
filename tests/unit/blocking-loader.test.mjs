/**
 * COS-1255 — signing in or out takes the whole screen.
 *
 * Vishal, 2026-10-07: the spinner sat on the button only. Mid sign-out he
 * could open the menu and go to another screen; the same during sign-in.
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

test('THE POINT: the loader covers the whole app and cannot be dismissed', () => {
  const c = strip(read('components/BlockingLoader.tsx'))
  assert.match(c, /<Portal>\s*<Modal/, 'Portal draws it at PaperProvider, above the drawer and tabs')
  assert.match(c, /dismissable=\{false\}/, 'taps on the backdrop go nowhere')
  assert.match(c, /dismissableBackButton=\{false\}/, 'neither does Android back')
})

test('sign-out and delete-account show it for as long as they run', () => {
  const c = strip(read('components/profile-content.tsx'))
  assert.match(c, /<BlockingLoader\s+visible=\{authBusy !== null\}/)
  // authBusy is never cleared: the handlers end in router.replace, which unmounts this.
  assert.doesNotMatch(c, /setAuthBusy\(null\)/)
})

test('password, Google and Apple sign-in show it until the next screen opens', () => {
  const c = strip(read('app/(auth)/sign-in.tsx'))
  assert.match(c, /const disabled = loading \|\| googleLoading \|\| routing;/)
  assert.match(c, /<BlockingLoader visible=\{disabled\} label="Signing in…" \/>/)
  const route = c.slice(c.indexOf('const handleRoute = async'), c.indexOf('const routeAfterSignIn = async'))
  assert.match(route, /setRouting\(true\);\s*try \{\s*await routeAfterSignIn\(user\);\s*\} catch \(err\) \{\s*setRouting\(false\);/,
    'cleared only on failure — on success the screen is replaced, and clearing would reopen it for a frame')
})
