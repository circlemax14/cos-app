/**
 * COS-928 — the Android properties, so they cannot silently rot.
 *
 * Every assertion here corresponds to something that WAS broken and was found
 * by reading code, not by running the app — there is no Android toolchain on
 * the build machine. That is exactly why they are pinned: nothing else in CI
 * would notice any of them coming back.
 *
 * These are grep-style contract tests over source read as text, matching the
 * repo's existing idiom (no `@/` alias under `node --test`). Negative
 * assertions run against comment-stripped source, because the prose explaining
 * a removed thing satisfies a grep for that thing.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const json = (p) => JSON.parse(read(p))

// ── The crash ────────────────────────────────────────────────────────

test('THE POINT: neither Google auth hook can be handed an undefined client id', () => {
  /*
   * expo-auth-session's useAuthRequest does
   * Platform.select({ios:'iosClientId', android:'androidClientId'}) and then
   * invariantClientId(), which THROWS on undefined — synchronously, inside a
   * useMemo, during render. EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID is defined in
   * no .env file, so every Android launch hit the route error boundary and a
   * fresh install could never reach a usable screen.
   *
   * It is above the feature flag: hooks cannot be conditional, so no flag flip
   * avoided it.
   */
  for (const f of ['app/(auth)/sign-in.tsx', 'app/Home/linked-accounts.tsx']) {
    const code = strip(read(f))
    assert.match(
      code,
      /androidClientId:\s*process\.env\.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID\s*\?\?/,
      `${f} must fall back — invariantClientId throws on undefined and nothing catches it`,
    )
  }
})

test('the Google entry points are gated to iOS while the Android round trip is impossible', () => {
  // Three things are missing on Android and each alone breaks the flow: no
  // Android OAuth client, no intent-filter for the applicationId scheme, and
  // no Android audience on the backend. A button that opens a browser and
  // silently returns is worse than no button.
  assert.match(strip(read('app/(auth)/sign-in.tsx')), /canUseGoogleSignIn =[\s\S]{0,80}?Platform\.OS === 'ios'/)
  assert.match(strip(read('app/Home/linked-accounts.tsx')), /canLinkGoogle =[\s\S]{0,120}?Platform\.OS === 'ios'/)
})

// ── Native identity and the HIPAA controls ───────────────────────────

test('THE POINT: the Android project builds THIS app, not a different one', () => {
  // The committed android/ was a fork carrying com.joinabrightfuture.cos,
  // versionName 1.0.0 and OTA runtime 1.0.4, while app.json said
  // ai.circlesupporthealth.csh / 1.5.2. Gradle uses the folder verbatim, so
  // app.json's android block never reached the binary.
  const gradle = read('android/app/build.gradle')
  const pkg = json('app.json').expo.android.package
  assert.match(gradle, new RegExp(`applicationId '${pkg.replace(/\./g, '\\.')}'`))
  assert.match(gradle, new RegExp(`namespace '${pkg.replace(/\./g, '\\.')}'`))
  assert.ok(
    existsSync(new URL(`../../android/app/src/main/java/${pkg.replace(/\./g, '/')}/MainActivity.kt`, import.meta.url)),
    'the Kotlin source dir must match the applicationId',
  )
  // Versions agree with app.json rather than drifting.
  assert.match(gradle, new RegExp(`versionName "${json('app.json').expo.version}"`))
})

test('THE POINT: Android backup stays off — SCRUM-368 / MOBILE-002', () => {
  /*
   * AsyncStorage / SQLite in this app hold PHI, and Android Auto Backup copies
   * it to Google Drive, outside our BAA boundary.
   *
   * `allowBackup` lives in app.json because @expo/config-plugins' AllowBackup
   * plugin defaults it to TRUE and writes it unconditionally — so the
   * hand-edited manifest attribute was one `expo prebuild` away from being
   * flipped back on, silently.
   */
  assert.equal(json('app.json').expo.android.allowBackup, false, 'app.json must pin allowBackup')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /android:allowBackup="false"/)
  assert.match(manifest, /android:fullBackupContent="false"/)
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/)
  const rules = read('android/app/src/main/res/xml/data_extraction_rules.xml')
  for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
    assert.match(rules, new RegExp(`<exclude domain="${domain}"`), `${domain} must be excluded`)
  }
  assert.match(rules, /<cloud-backup>/)
  assert.match(rules, /<device-transfer>/)
})

test('BackHandler still has an attribute to hang off', () => {
  // predictiveBackGestureEnabled:false is what produces
  // enableOnBackInvokedCallback="false", which the classic BackHandler API
  // depends on. Losing it breaks back handling on Android 13+.
  assert.equal(json('app.json').expo.android.predictiveBackGestureEnabled, false)
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:enableOnBackInvokedCallback="false"/)
})

test('the OTA runtime and channel match app.json, or no update can ever land', () => {
  // The old folder pinned runtime 1.0.4 against app.json's 1.5.2 — an Android
  // build that no OTA could reach, which is how the iOS SCRUM-147 incident
  // went unnoticed until after distribution.
  const app = json('app.json').expo
  assert.match(read('android/app/src/main/res/values/strings.xml'),
    new RegExp(`<string name="expo_runtime_version">${app.runtimeVersion}</string>`))
})

test('calendar permissions are present, or every calendar read returns empty', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /android\.permission\.READ_CALENDAR/)
  assert.match(manifest, /android\.permission\.WRITE_CALENDAR/)
})

test('deep links point at our own domain', () => {
  // The old folder autoVerified joinabrightfuture.com — a third identity — so
  // circlesupporthealth.ai links opened a browser instead of the app.
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /android:host="circlesupporthealth\.ai"/)
  assert.doesNotMatch(manifest, /android:host="[^"]*joinabrightfuture[^"]*"/)
})

test('permissions with no consumer are not requested', () => {
  // AD_ID forces an advertising-ID declaration on Play's data-safety form for
  // a HIPAA app, and nothing in the codebase reads it.
  const perms = json('app.json').expo.android.permissions
  assert.ok(!perms.includes('com.google.android.gms.permission.AD_ID'))
  assert.ok(!perms.includes('android.permission.FOREGROUND_SERVICE'))
})

// ── Runtime behaviour ────────────────────────────────────────────────

test('THE POINT: <queries> declares tel/mailto/sms, or every Call button is dead', () => {
  /*
   * Android 11+ package visibility filtering makes canOpenURL() return FALSE
   * for any undeclared scheme, even with a handler installed. Every Call, Text
   * and Email button guards on canOpenURL first, so all of them silently did
   * nothing.
   *
   * Asserted on the PLUGIN, not the generated manifest: app.json has no schema
   * for <queries>, so a hand-edit dies at the next prebuild. The plugin is what
   * makes it survive.
   */
  const plugin = read('plugins/withAndroidIntentQueries.js')
  assert.match(plugin, /const SCHEMES = \['tel', 'mailto', 'sms'\]/)
  assert.ok(json('app.json').expo.plugins.includes('./plugins/withAndroidIntentQueries'),
    'the plugin must be registered or it never runs')
  // ...and it did run.
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  for (const s of ['tel', 'mailto', 'sms']) {
    assert.match(manifest, new RegExp(`android:scheme="${s}"`))
  }
})

test('THE POINT: GestureHandlerRootView wraps the tree', () => {
  /*
   * react-native-gesture-handler throws in render() when its context is absent
   * on a native platform, and expo-router supplies SafeAreaProvider but not
   * this. Adding READ_CALENDAR is what makes the only <Swipeable> reachable,
   * so the two had to land together.
   *
   * It is an iOS fix too: in a release build __DEV__ is false so RNGH does not
   * throw — the gestures are simply never recognised, which is why
   * swipe-to-delete has never worked on production 1.5.2 either.
   */
  const layout = strip(read('app/_layout.tsx'))
  assert.match(layout, /import \{ GestureHandlerRootView \} from 'react-native-gesture-handler'/)
  assert.match(layout, /<GestureHandlerRootView style=\{\{ flex: 1 \}\}>/)
})

test('the notification prompt is driven by canAskAgain, not a status string', () => {
  // On Android 13+ a user who has never been asked reports 'denied' with
  // canAskAgain true — never 'undetermined' — so the old branch never fired
  // for an existing account signing in: no prompt, no token, no reminders.
  const code = strip(read('hooks/use-notifications.ts'))
  assert.match(code, /current\.canAskAgain/)
  assert.doesNotMatch(code, /status === 'undetermined'/)
})

test('notification channels exist and mirror the server categories', () => {
  // Without channels every notification lands in one Android channel named
  // "Miscellaneous", so muting a 6am medication reminder also mutes
  // appointments and health alerts.
  const chans = read('lib/android-notification-channels.ts')
  assert.match(chans, /Platform\.OS !== 'android'/)
  assert.match(chans, /setNotificationChannelAsync/)
  // One taxonomy, not two: the ids ARE the server's category keys.
  assert.match(chans, /NOTIFICATION_CATEGORY_KEYS/)
  assert.match(strip(read('hooks/use-notifications.ts')), /ensureAndroidNotificationChannels\(\)/)
})

test('an unmapped icon renders a visible glyph, not a blank', () => {
  // MaterialIcons renders nothing for an unknown name, so ten missing entries
  // left whole toolbars invisible on Android with no warning.
  const icons = read('components/ui/icon-symbol.tsx')
  assert.match(icons, /MAPPING\[name\] \?\? 'help-outline'/)
  for (const n of ['chevron.left', 'magnifyingglass', 'gear', 'phone.fill', 'envelope.fill']) {
    assert.match(icons, new RegExp(`'${n.replace(/\./g, '\\.')}':`), `${n} must be mapped`)
  }
})

test('every IconSymbol name used in the app has an Android mapping', () => {
  // The check that found the ten. Guards against the next one being added
  // without a mapping.
  const icons = read('components/ui/icon-symbol.tsx')
  const mapped = new Set([...icons.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]))
  const sources = [
    'app/Home/index.tsx', 'app/Home/_layout.tsx', 'app/modal.tsx',
    'components/home/quick-action-buttons-internals.tsx',
  ].filter((p) => existsSync(new URL(`../../${p}`, import.meta.url)))
  const used = new Set()
  for (const p of sources) {
    for (const m of read(p).matchAll(/<IconSymbol[^>]*?name=["']([^"']+)["']/g)) used.add(m[1])
  }
  const missing = [...used].filter((n) => !mapped.has(n))
  assert.deepEqual(missing, [], `unmapped IconSymbol names: ${missing.join(', ')}`)
})

test('SafeAreaView comes from safe-area-context, which is not a no-op on Android', () => {
  for (const p of ['app/Home/reports.tsx', 'app/Home/health-trends.tsx',
                   'components/home/quick-action-buttons-internals.tsx',
                   'components/reports/document-viewer.tsx']) {
    const code = strip(read(p))
    assert.match(code, /import \{ SafeAreaView \} from 'react-native-safe-area-context'/, p)
    // and it is no longer pulled from react-native in the same file
    const rnImport = code.match(/import \{[^}]*\} from 'react-native'/s)
    if (rnImport) assert.doesNotMatch(rnImport[0], /\bSafeAreaView\b/, p)
  }
})

test('THE POINT: the Android time picker asks for the time', () => {
  /*
   * @react-native-community/datetimepicker does not support mode="datetime" on
   * Android — it silently renders date only. So an event could be moved to
   * another day but never to another hour, with nothing on screen to say why.
   * Android convention is two sequential dialogs.
   */
  const code = strip(read('app/calendar-event-editor.tsx'))
  assert.match(code, /androidStep/)
  assert.match(code, /Platform\.OS === 'ios' \? 'datetime' : androidStep/)
  // A dismissed dialog must not advance to the time step.
  assert.match(code, /event\.type === 'dismissed'/)
})

test('Apple brand names never render on Android', () => {
  const bio = strip(read('app/(security)/enable-biometric.tsx'))
  assert.match(bio, /Platform\.OS === 'ios'/)
  assert.match(bio, /setBiometricType\('biometrics'\)/) // no path renders an empty label
  assert.match(strip(read('app/(security)/lock-screen.tsx')), /Use biometrics or enter your 6-digit PIN/)
})

// ── The build guard ──────────────────────────────────────────────────

test('THE POINT: `npm run android` cannot build against production', () => {
  /*
   * `expo run:android` inlines .env at bundle time, and the repo's .env is
   * kept pointing at PRODUCTION so main stays archivable for the App Store.
   * Unwrapped, `npm run android` produced a debug-signed APK reading real
   * patient PHI from the prod API on an unmanaged handset.
   */
  const pkg = json('package.json')
  assert.equal(pkg.scripts.android, './scripts/run-android.sh dev')
  const sh = read('scripts/run-android.sh')
  assert.match(sh, /--i-mean-it/, 'prod must require an explicit confirmation')
  assert.match(sh, /trap restore EXIT/, 'the .env restore must survive Ctrl-C, not just the happy path')
  // A stage label is a claim; the URL is the truth.
  assert.match(sh, /api\\?\.circlesupporthealth\\?\.ai/)
})
