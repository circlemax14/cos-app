/**
 * COS-1248 — a slow SecureStore read must never put an OLD token back.
 *
 * On a cold start the Keychain/Keystore read is slow. A 401-refresh saved fresh
 * tokens meanwhile, then the stale read resolved and overwrote the cache with
 * the EXPIRED access token: 14 successful refreshes and 89 rejected requests in
 * 30s on Vishal's Android (2026-10-07), and sign-out could not reach the API.
 * Source read as text (no `@/` alias under node --test).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const src = strip(read('lib/auth-tokens.ts'))
const fn = (name) => {
  const i = src.indexOf(`export async function ${name}(`)
  return src.slice(i, src.indexOf('\n}\n', i))
}

test('THE POINT: no storage read writes the cache if tokens were saved while it ran', () => {
  for (const [name, cache] of [['getAccessToken', 'cachedAccessToken'], ['getRefreshToken', 'cachedRefreshToken'], ['getIdToken', 'cachedIdToken']]) {
    const body = fn(name)
    const guard = body.indexOf('if (generation !== tokenGeneration)')
    const write = body.indexOf(`if (value) ${cache} = value`)
    assert.ok(body.includes('const generation = tokenGeneration'), `${name} must capture the generation before reading`)
    assert.ok(guard > 0 && guard < write, `${name} must check the generation before writing ${cache}`)
  }
  const presence = fn('readSessionPresence')
  assert.match(presence, /if \(generation === tokenGeneration\) \{\s*if \(refresh\) cachedRefreshToken = refresh;\s*if \(access\) cachedAccessToken = access;/)
})

test('saving or clearing tokens moves the generation on', () => {
  assert.match(fn('storeTokens'), /^[^]*?\{\s*tokenGeneration \+= 1;/)
  assert.match(fn('clearTokens'), /^[^]*?\{\s*tokenGeneration \+= 1;/)
})
