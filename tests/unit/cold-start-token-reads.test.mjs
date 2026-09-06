/**
 * COS-890 — the cold-start Keychain read, attempt 4.
 *
 * Attempts 1-3 (BUG #17, COS-353) all hardened the SPLASH read in
 * app/index.tsx. Ken kept reporting it, because the read that actually
 * destroys a session is in lib/api-client.ts:
 *
 *     const refreshToken = await getRefreshToken();
 *     if (!refreshToken) { await forceSignOut('session_expired'); ... }
 *
 * forceSignOut() calls clearTokens(), which DELETES the tokens. So a read
 * that had merely not settled did not fail a request — it deleted a valid
 * session, and Ken signed back in. That is the "I almost always have to go
 * out and sign in again" report, and it is why the circle was empty: the
 * session was gone, not the data.
 *
 * Source-level, because reproducing it needs a cold iOS Keychain.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const tokens = code('lib/auth-tokens.ts')
const client = code('lib/api-client.ts')
const splash = code('app/index.tsx')
// COS-C6: the splash's two error states now render
// components/ConnectionErrorScreen.tsx (the social sign-in path needed the
// same screen). The COS-890 copy split moved with the markup — it is still
// pinned, just in its new home.
const errorScreen = code('components/ConnectionErrorScreen.tsx')

// ── the destructive read ──────────────────────────────────────────────────

test('THE POINT: the refresh-token read retries on NULL, not only on throw', () => {
  // readSecureWithRetry only retries a THROW. expo-secure-store returns a
  // plain null when the Keychain is not yet available — documented in
  // auth-tokens.ts itself — so the retry never engaged on the one read whose
  // null deletes the session.
  const fn = tokens.match(/export async function getRefreshToken[\s\S]*?\n\}/)
  assert.ok(fn, 'getRefreshToken must exist')
  assert.match(fn[0], /readSecureExpectingValue\(KEYS\.refresh\)/)
  assert.doesNotMatch(fn[0], /readSecureWithRetry\(KEYS\.refresh\)/)
})

test('the null it guards is still destructive — so the guard has to hold', () => {
  // If this ever stops being true the test above is guarding nothing, and
  // whoever changed it should be told which invariant they moved.
  assert.match(client, /const refreshToken = await getRefreshToken\(\)/)
  assert.match(client, /if \(!refreshToken\)\s*\{\s*await forceSignOut/)
  assert.match(client, /async function forceSignOut[\s\S]*?await clearTokens\(\)/)
})

// ── never cache an absence ────────────────────────────────────────────────

test('THE POINT: none of the three readers cache a null', () => {
  // `cachedX = value` plus a `!== undefined` short-circuit pinned "no token"
  // in memory for the whole process. Only storeTokens() overwrote it, which
  // is why signing back in was the one thing that worked.
  for (const name of ['getAccessToken', 'getRefreshToken', 'getIdToken']) {
    const fn = tokens.match(new RegExp(`export async function ${name}[\\s\\S]*?\\n\\}`))
    assert.ok(fn, `${name} must exist`)
    assert.match(fn[0], /if \(value\) cached/, `${name} caches a null`)
    assert.doesNotMatch(fn[0], /!== undefined/, `${name} short-circuits on a cached null`)
  }
})

test('a real token is still cached — the optimisation is the point of the cache', () => {
  assert.match(tokens, /if \(cachedAccessToken\) return cachedAccessToken/)
  assert.match(tokens, /if \(cachedRefreshToken\) return cachedRefreshToken/)
})

test('readSessionPresence still repairs the cache from a good read', () => {
  assert.match(tokens, /if \(access\) cachedAccessToken = access/)
  assert.match(tokens, /if \(refresh\) cachedRefreshToken = refresh/)
})

// ── stop blaming the network for a Keychain read ──────────────────────────

test('THE POINT: an unreadable session is not reported as an outage', () => {
  assert.match(splash, /'session-unreadable'/)
  // The indeterminate-with-no-PIN branch must not claim the network failed.
  const branch = splash.match(/if \(presence === 'indeterminate'\)[\s\S]*?return;/)
  assert.ok(branch, 'the indeterminate branch must exist')
  assert.doesNotMatch(branch[0], /setState\('no-internet'\)/)
  assert.match(branch[0], /setState\('session-unreadable'\)/)
})

test('a REAL network failure still says so', () => {
  // Two other sites set no-internet from an actual failed request; those are
  // honest and must not be swept into the new state.
  assert.match(splash, /setState\('no-internet'\)/)
  // The splash hands its GateState straight to the shared screen, which owns
  // the copy. Both halves are asserted so the wire cannot pass on a splash
  // that renders nothing, or a screen nobody renders.
  assert.match(splash, /<ConnectionErrorScreen\s+variant=\{state\}/)
  assert.match(errorScreen, /No Internet Connection/)
})

test('retry is still offered — it is what made this survivable', () => {
  assert.match(splash, /setRetryKey\(\(k\) => k \+ 1\)/)
})
