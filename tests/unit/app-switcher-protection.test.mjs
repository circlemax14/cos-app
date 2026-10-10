/**
 * MOB-02 — the iOS app-switcher snapshot showed the last PHI screen.
 *
 * iOS snapshots the window when the app resigns active; the app lock only acts
 * on background -> active, so the snapshot is whatever was on screen (labs,
 * meds, a PHQ-9 result). expo-screen-capture ships enableAppSwitcherProtection
 * (a blur on willResignActive) and nothing called it.
 *
 * This is NOT the screenshot policy: COS-1034 deliberately allows screenshots
 * and the plan key still controls those. The switcher snapshot is covered by
 * no decision and defeats the PIN lock, so it is on for everyone.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = readFileSync(new URL('../../components/privacy/ScreenCaptureBridge.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('the bridge enables iOS app-switcher protection', () => {
  assert.match(code, /ScreenCapture\.enableAppSwitcherProtectionAsync\(/)
})

test('it is unconditional — not tied to the plan screenshot key', () => {
  const i = code.indexOf('enableAppSwitcherProtectionAsync(')
  const effect = code.lastIndexOf('useEffect(', i)
  const deps = code.indexOf('}, [', i)
  assert.equal(code.slice(deps, deps + 6), '}, [])', 'mount-once effect, no plan dependency')
  assert.ok(!code.slice(effect, i).includes('blocked'), 'not gated on the capture policy')
})

test('a binary without the native method cannot crash on it', () => {
  const i = code.indexOf('enableAppSwitcherProtectionAsync(')
  assert.match(code.slice(i, i + 120), /\.catch\(/)
})
