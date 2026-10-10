/**
 * GP-02 — Health Connect's privacy-policy link must open the privacy policy.
 *
 * The rationale intents (ACTION_SHOW_PERMISSIONS_RATIONALE, and on 14+
 * VIEW_PERMISSION_USAGE via the alias) target MainActivity with no URI, and
 * nothing read the action, so the app just booted normally.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const MAIN = 'android/app/src/main/java/ai/circlesupporthealth/csh/MainActivity.kt'
const plugin = require('../../plugins/withHealthConnectRationaleRoute.js')

test('MainActivity rewrites BOTH rationale actions into the privacy-policy deep link', () => {
  const kt = read(MAIN)
  assert.match(kt, /"androidx\.health\.ACTION_SHOW_PERMISSIONS_RATIONALE"/)
  assert.match(kt, /"android\.intent\.action\.VIEW_PERMISSION_USAGE"/)
  assert.match(kt, /Uri\.parse\("cos:\/\/privacy-policy"\)/)
})

test('cold launch: the rewrite runs BEFORE super.onCreate (Linking reads the intent later)', () => {
  const kt = read(MAIN)
  const call = kt.indexOf('routeHealthConnectRationale(intent)')
  const sup = kt.indexOf('super.onCreate(null)')
  assert.ok(call > -1 && sup > -1 && call < sup)
})

test('warm app (singleTask): onNewIntent rewrites before handing to React', () => {
  const kt = read(MAIN)
  const i = kt.indexOf('override fun onNewIntent(intent: Intent)')
  assert.ok(i > -1)
  const body = kt.slice(i, kt.indexOf('}', i))
  assert.ok(body.indexOf('routeHealthConnectRationale(intent)') < body.indexOf('super.onNewIntent(intent)'))
})

test('the committed MainActivity is exactly what the plugin generates (survives prebuild)', () => {
  const kt = read(MAIN)
  assert.equal(plugin.addRationaleRouting(kt), kt, 'idempotent on the committed file')
  const marker = /  \/\/ @generated begin csh-hc-rationale[\s\S]*?  \/\/ @generated end csh-hc-rationale\n\n/
  const bare = kt
    .replace(marker, '')
    .replace('    routeHealthConnectRationale(intent) // csh-hc-rationale\n', '')
    .replace('import android.content.Intent\n', '')
    .replace('import android.net.Uri\n', '')
  assert.equal(plugin.addRationaleRouting(bare), kt, 'prebuild output == committed file')
})

test('the plugin is registered after the library plugin, and the route exists', () => {
  const plugins = JSON.parse(read('app.json')).expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p))
  const lib = plugins.indexOf('react-native-health-connect')
  const ours = plugins.indexOf('./plugins/withHealthConnectRationaleRoute')
  assert.ok(lib > -1 && ours > lib)
  assert.ok(existsSync(new URL('../../app/(auth)/privacy-policy.tsx', import.meta.url)))
})

test('the manifest is untouched by this fix (COS-936 hard gate)', () => {
  const src = read('plugins/withHealthConnectRationaleRoute.js').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(src, /withAndroidManifest/)
})

test('the policy screen has a way out when it is the first screen (no history)', () => {
  const src = read('app/(auth)/privacy-policy.tsx')
  assert.match(src, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/'/)
})

test('cold launch: the policy screen lifts the native splash itself (SplashGate never mounts)', () => {
  // The rewritten intent makes the initial URL cos://privacy-policy, so expo-router
  // mounts ONLY this route; app/index.tsx (the other hideAsync caller) never runs.
  const src = read('app/(auth)/privacy-policy.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.match(src, /import \* as SplashScreen from 'expo-splash-screen'/)
  assert.match(src, /useEffect\(\(\) => \{\s*SplashScreen\.hideAsync\(\)\.catch\(\(\) => \{\}\);\s*\}, \[\]\)/)
  // and the router really does resolve the rewritten URL to this route alone
  const { extractExpoPathFromURL } = require('expo-router/build/fork/extractPathFromURL.js')
  assert.equal(extractExpoPathFromURL([], 'cos://privacy-policy'), 'privacy-policy')
})
