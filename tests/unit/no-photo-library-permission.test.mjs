/**
 * COS-1257 — no photo-library, storage or microphone permission on Android.
 *
 * Google Play refused the closed-testing release (2026-10-07): "All developers
 * requesting access to the photo and video permissions are required to tell
 * Google Play about the core functionality of their app". Build 73 carried
 * READ_MEDIA_IMAGES — merged in by expo-screen-capture, which needs it only to
 * DETECT screenshots on Android 13; the app only BLOCKS them. Photos here are a
 * profile picture or an attachment, which Play says must use the system photo
 * picker — and launchImageLibraryAsync already is that picker, needing no
 * permission. Nothing records audio, so RECORD_AUDIO goes too.
 *
 * Contract tests over source read as text (no `@/` alias under node --test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const GONE = ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'RECORD_AUDIO']

test('THE POINT: the merged manifest strips them, whichever library adds them', () => {
  const m = read('android/app/src/main/AndroidManifest.xml')
  for (const p of GONE) {
    assert.match(m, new RegExp(`android:name="android\\.permission\\.${p}" tools:node="remove"`), `${p} must be removed`)
    assert.equal(m.match(new RegExp(`android\\.permission\\.${p}"`, 'g')).length, 1, `${p} must not also be declared`)
  }
  const blocked = JSON.parse(read('app.json')).expo.android.blockedPermissions
  for (const p of GONE) assert.ok(blocked.includes(`android.permission.${p}`), `app.json must block ${p} too (prebuild)`)
})

test('no code asks for photo-library access — the picker needs none', () => {
  const hits = []
  for (const dir of ['app', 'components', 'hooks', 'services', 'lib']) {
    for (const f of readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true })) {
      if (/\.tsx?$/.test(f) && read(`${dir}/${f}`).includes('requestMediaLibraryPermissionsAsync')) hits.push(`${dir}/${f}`)
    }
  }
  assert.deepEqual(hits, [], 'on Android this now always answers "denied" and would block the picker')
})

test('screenshots are only blocked, never detected — detection would need READ_MEDIA_IMAGES', () => {
  const bridge = read('components/privacy/ScreenCaptureBridge.tsx')
  assert.doesNotMatch(bridge, /addScreenshotListener|useScreenshotListener/)
})
