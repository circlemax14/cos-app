/**
 * COS-1250 — signing out must leave nothing on the phone to come back to.
 *
 * Vishal, Android, 2026-10-07: Sign Out, close the app, reopen — PIN screen,
 * enter it, signed in. The wipe ran after two network calls (closing the app
 * during that spinner killed sign-out before it deleted anything), and the PIN
 * was never deleted at all — the splash reads "PIN, no login" as a Keychain
 * that has not woken up and opens the PIN screen.
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const auth = strip(read('services/auth.ts'))
const signOut = auth.slice(auth.indexOf('export async function signOut'), auth.indexOf('export async function signUp'))
const at = (needle) => {
  const i = signOut.indexOf(needle)
  assert.ok(i > 0, `signOut must contain ${needle}`)
  return i
}

test('THE POINT: sign-out deletes the PIN', () => {
  at('await clearPinData()')
})

test('everything local is wiped before any network call', () => {
  const lastWipe = Math.max(at('await clearPinData()'), at('await clearTokens()'), at("deleteItemAsync('cos_username')"), at('await purgeLocalPhi()'))
  assert.ok(lastWipe < at("apiClient.get<"), 'GET /auth/me after the wipe')
  assert.ok(lastWipe < at('await unregisterPushToken('), 'push unregister after the wipe')
})

test('the PIN goes before the tokens — never a PIN with no login behind it', () => {
  assert.ok(at('await clearPinData()') < at('await clearTokens()'))
})
