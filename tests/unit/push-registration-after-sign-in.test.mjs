/**
 * COS-1243 — push registration must follow the SESSION, not the app launch.
 *
 * useNotifications registered once, on mount. On a fresh install, a reinstall
 * or after signing out, nobody is signed in at that moment: the POST hit 401,
 * the error was swallowed, and signing in never tried again. Push stayed dead
 * until the next cold start — Vishal had to kill and reopen the app on build 72
 * AND build 73 before a test notification could reach him.
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('THE POINT: saving a session re-registers for push', () => {
  const hook = strip(read('hooks/use-notifications.ts'))
  assert.match(hook, /onSessionStored\(\s*\(\)\s*=>\s*\{\s*void registerPushToken\(\{ ask: false \}\)/)
  assert.match(hook, /stopListening\(\)/, 'unsubscribe on unmount')
})

test('every way a session is saved announces it', () => {
  const tokens = strip(read('lib/auth-tokens.ts'))
  const body = tokens.slice(tokens.indexOf('export async function storeTokens'))
  assert.match(body.slice(0, body.indexOf('\n}\n')), /for \(const listener of sessionStoredListeners\)/)
  // password sign-in, Google/Apple sign-in and the 401 refresh all go through it
  assert.match(strip(read('services/auth.ts')), /storeTokens\(/)
  assert.match(strip(read('services/social-auth.ts')), /storeTokens\(/)
  assert.match(strip(read('lib/api-client.ts')), /storeTokens\(newAccess, newRefresh, newId\)/)
})

test('no POST while signed out, and only the launch may prompt', () => {
  const fn = strip(read('hooks/use-notifications.ts'))
  const reg = fn.slice(fn.indexOf('async function registerPushToken'))
  const guard = reg.indexOf('hasStoredSession()')
  const post = reg.indexOf("'/v1/notifications/register-token'")
  assert.ok(guard > 0 && guard < post, 'check for a session before posting — a signed-out POST is a guaranteed 401')
  assert.match(reg, /if \(ask && status !== 'granted' && current\.canAskAgain\)/, 'a token refresh must not re-prompt')
  assert.match(reg, /retryAsync\(\(\) =>\s*apiClient\.post\('\/v1\/notifications\/register-token'/, 'retry network blips and 5xx')
})
