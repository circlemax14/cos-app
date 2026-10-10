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
import { createRequire } from 'node:module'

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

/*
 * The library blurs keyWindow.subviews.first (the root view). Presented view
 * controllers (pageSheet, formSheet, overFullScreen, transparentModal: the
 * Doctors / appointments / calendar-event modals and every transparent RN
 * <Modal>, e.g. MedicationsReviewModal) sit in a UITransitionView ABOVE it, so
 * their content stayed readable. patches/ moves the blur onto the window.
 * Native: takes effect only in the next iOS binary. The device check is the proof.
 */
const PATCH = readFileSync(new URL('../../patches/expo-screen-capture+55.0.15.patch', import.meta.url), 'utf8')

test('iOS: the blur covers the WINDOW (presented modals too), not just the root view', () => {
  assert.match(PATCH, /^-    rootView\.addSubview\(blurEffectView\)$/m)
  assert.match(PATCH, /^\+    keyWindow\.addSubview\(blurEffectView\)$/m)
  assert.match(PATCH, /^\+    blurEffectView\.frame = keyWindow\.bounds$/m)
  assert.match(PATCH, /^-      let rootView = keyWindow\.subviews\.first else \{$/m)
})

test('the patch targets the installed expo-screen-capture version (patch-package applies by version)', () => {
  const require = createRequire(import.meta.url)
  const { version } = require('expo-screen-capture/package.json')
  assert.equal(version, '55.0.15', 'bump the patch file name (and re-check the hunk) with the library')
  const swift = readFileSync(require.resolve('expo-screen-capture/ios/ScreenCaptureModule.swift'), 'utf8')
  assert.ok(
    swift.includes('    rootView.addSubview(blurEffectView)') || swift.includes('    keyWindow.addSubview(blurEffectView)'),
    'hunk context still present (unpatched or already patched)',
  )
})
