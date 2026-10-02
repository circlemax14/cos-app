/**
 * COS-1241 — the Android launch fixes, pinned so the next change cannot quietly
 * undo one. Each was found on an API 35 emulator or in the merged manifest on
 * 2026-10-02; none of them shows up on iOS, which is exactly why they need a
 * test rather than a reviewer's memory.
 *
 * Grep-style contract tests over source read as text — the repo idiom (no `@/`
 * alias under `node --test`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('Android back cannot pop the lock screen', () => {
  const src = strip(read('app/(security)/lock-screen.tsx'));
  assert.match(
    src,
    /if \(Platform\.OS !== 'android'\) return;\s*const sub = BackHandler\.addEventListener\('hardwareBackPress', \(\) => true\);\s*return \(\) => sub\.remove\(\);/,
  );
});

test('permissions the app never uses stay out of the Play listing, through a prebuild too', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const app = JSON.parse(read('app.json'));
  const blocked = [
    'android.permission.READ_CONTACTS',
    'android.permission.WRITE_CONTACTS',
    // Play blocks a release whose manifest has AD_ID while the console's
    // Advertising ID declaration says "no".
    'com.google.android.gms.permission.AD_ID',
    'android.permission.READ_PHONE_STATE',
  ];
  for (const p of blocked) {
    // the committed tree is what Gradle builds…
    assert.match(manifest, new RegExp(`<uses-permission android:name="${p}" tools:node="remove"/>`), p);
    // …and app.json is what a future `expo prebuild` regenerates it from.
    assert.ok(app.expo.android.blockedPermissions.includes(p), p);
  }
});

test('versionCode agrees between Gradle and app.json', () => {
  const gradle = read('android/app/build.gradle').match(/^\s+versionCode (\d+)$/m)?.[1];
  const app = JSON.parse(read('app.json'));
  assert.equal(Number(gradle), app.expo.android.versionCode);
});

test('status bar follows the app theme on Android, iOS keeps auto', () => {
  const src = strip(read('app/_layout.tsx'));
  assert.match(src, /if \(Platform\.OS !== 'android'\) return <StatusBar style="auto" \/>;/);
  assert.match(src, /<StatusBar style=\{settings\.isDarkTheme \? 'light' : 'dark'\} \/>/);
  assert.match(src, /<AppStatusBar \/>/);
  assert.doesNotMatch(src, /<StatusBar style="auto" \/>\s*<\/View>/);
});

test('no KeyboardAvoidingView is inert on Android', () => {
  // edgeToEdgeEnabled stops adjustResize working, so `undefined` leaves inputs
  // under the keyboard (COS-1031b; app/Home/conversation.tsx was the last one).
  const files = ['app', 'components'].flatMap((d) =>
    readdirSync(new URL(`../../${d}`, import.meta.url), { recursive: true })
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => `${d}/${f}`),
  );
  const inert = files.filter((f) => /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/.test(strip(read(f))));
  assert.deepEqual(inert, []);
});

test('the Android release script puts .env and the iOS stamps back on EXIT', () => {
  // cos-app/CLAUDE.md: a script that swaps .env must trap the restore on EXIT.
  // Without it the documented launch build left iOS at build 70 and the next
  // publish-ota.sh refused the dirty tree.
  const src = read('scripts/build-android-release.sh');
  const trap = src.indexOf('trap _restore_stamps EXIT');
  assert.ok(trap > 0 && trap < src.indexOf('./scripts/prepare-build.sh'), 'trap is set before prepare-build.sh runs');
  for (const f of ['app.json', 'ios/CSH/Info.plist', 'ios/CSH.xcodeproj/project.pbxproj', '.env']) {
    assert.match(src.match(/STAMPED="([^"]+)"/)[1], new RegExp(`(^|\\s)${f.replace(/[.]/g, '\\.')}(\\s|$)`), f);
  }
});
