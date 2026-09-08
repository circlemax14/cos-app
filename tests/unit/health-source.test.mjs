/**
 * COS-929 — Health Connect, and the single-source rule.
 *
 * The rule these tests exist for is not a UX preference. Health Connect
 * already aggregates across every app that writes to it (Samsung Health,
 * Fitbit, Google Fit, Wear OS), and HealthKit does the same on iOS. Anything
 * we merge on top double-counts — and steps and sleep feed the readiness
 * snapshot, the wellbeing score, the health age and the care plan. A patient
 * whose step count silently doubles gets a better assessed health than they
 * have.
 *
 * Grep-style contract tests, matching the repo's idiom. Negative assertions
 * run against comment-stripped source, because the prose explaining a thing
 * satisfies a grep for it.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const json = (p) => JSON.parse(read(p))

const FACADE = read('services/health-source.ts')
const HC = read('services/health-connect.ts')

test('THE POINT: exactly one health source can be active', () => {
  /*
   * The type is a single id, never an array. If this ever becomes a list,
   * something downstream will sum it and double-count a patient wearing a
   * watch that syncs to more than one place.
   */
  const code = strip(FACADE)
  assert.match(code, /export type HealthSourceId = 'apple-health' \| 'health-connect' \| 'none'/)
  assert.match(code, /export function activeHealthSource\(\): HealthSourceId/)
  // Not a set, not a list, not a filter over enabled sources.
  assert.doesNotMatch(code, /HealthSourceId\[\]/)
  assert.doesNotMatch(code, /activeHealthSources/)
})

test('the platform decides the source, and it is not stored', () => {
  // A persisted source id could drift from the binary it runs in — an iOS
  // build reading a stored 'health-connect' would read nothing forever.
  const code = strip(FACADE)
  assert.match(code, /Platform\.OS === 'ios'[\s\S]{0,40}?return 'apple-health'/)
  assert.match(code, /Platform\.OS === 'android'[\s\S]{0,40}?return 'health-connect'/)
  assert.doesNotMatch(code, /AsyncStorage|SecureStore|getItem/)
})

test('THE POINT: Health Connect aggregates, we never sum raw records', () => {
  /*
   * Health Connect de-duplicates across the apps that wrote a record. Reading
   * raw records and summing them ourselves double-counts a walk that both the
   * phone and the watch recorded — the same trap as merging sources, one level
   * down.
   */
  const code = strip(HC)
  assert.match(code, /aggregateRecord/)
  assert.match(code, /COUNT_TOTAL/)     // steps
  assert.match(code, /BPM_AVG/)         // heart rate
  // Sleep is the one deliberate exception, and it reads records because a
  // session starting before midnight is what "last night" means.
  const sleepFn = code.slice(code.indexOf('getTodaySleepHours'))
  assert.match(sleepFn.slice(0, 1200), /readRecords\('SleepSession'/)
})

test('active calories are preferred over total, or the number jumps by BMR', () => {
  // HealthKit's ActiveEnergyBurned — what services/health.ts reads — excludes
  // basal metabolic rate. TotalCaloriesBurned includes it. Mixing them makes
  // the same patient's figure differ by roughly their BMR depending on which
  // device wrote the data.
  const code = strip(HC)
  const fn = code.slice(code.indexOf('getTodayCaloriesBurned'))
  assert.ok(
    fn.indexOf("aggregateToday('ActiveCaloriesBurned')") < fn.indexOf("aggregateToday('TotalCaloriesBurned')"),
    'ActiveCaloriesBurned must be tried before TotalCaloriesBurned',
  )
})

test('the SDK is required lazily and never throws on the wrong platform', () => {
  // Importing a native module at module scope crashes every screen that
  // transitively imports the file, on any platform where it is absent — the
  // COS-925 lesson from react-native-iap.
  const code = strip(HC)
  assert.match(code, /function loadSdk\(\)/)
  assert.match(code, /Platform\.OS !== 'android'[\s\S]{0,30}?return null/)
  assert.match(code, /require\('react-native-health-connect'\)/)
  // Every exported path returns a value rather than propagating a throw.
  assert.doesNotMatch(code, /^\s*throw /m)
})

test('the three "no" answers stay distinguishable', () => {
  // "Install it" and "update it" are actions the patient can take. Collapsing
  // them into "unavailable" is a dead end, which is what the Apple-only copy
  // used to be on Android.
  const code = strip(HC)
  for (const s of ['available', 'not-installed', 'update-required', 'not-applicable']) {
    assert.match(code, new RegExp(`'${s}'`), `status '${s}' must exist`)
  }
})

test('THE POINT: manifest permissions match what the code asks for', () => {
  /*
   * Health Connect reads the MANIFEST to decide what it will even prompt for.
   * A permission the code requests but the manifest omits is silently never
   * granted — requestPermission returns success with that type missing, and
   * the data is simply always empty.
   *
   * The reverse is also a defect: a manifest permission we never read is shown
   * to the patient as a decision to make, for nothing, and has to be declared
   * on Play's data-safety form.
   */
  const plugin = read('plugins/withHealthConnect.js')
  const declared = [...plugin.matchAll(/'android\.permission\.health\.READ_([A-Z_]+)'/g)].map((m) => m[1])
  const requested = [...HC.matchAll(/^\s*'([A-Za-z]+)',$/gm)].map((m) => m[1])
  const RECORD_TO_PERM = {
    Steps: 'STEPS',
    HeartRate: 'HEART_RATE',
    SleepSession: 'SLEEP',
    TotalCaloriesBurned: 'TOTAL_CALORIES_BURNED',
    ActiveCaloriesBurned: 'ACTIVE_CALORIES_BURNED',
    Weight: 'WEIGHT',
    BloodPressure: 'BLOOD_PRESSURE',
    OxygenSaturation: 'OXYGEN_SATURATION',
    // COS-932 — the readiness snapshot's two inputs.
    RestingHeartRate: 'RESTING_HEART_RATE',
    RespiratoryRate: 'RESPIRATORY_RATE',
    // COS-934 — the last three vitals tiles.
    BloodGlucose: 'BLOOD_GLUCOSE',
    HeartRateVariabilityRmssd: 'HEART_RATE_VARIABILITY',
    // COS-935 — the rest of what iOS reads.
    BodyTemperature: 'BODY_TEMPERATURE',
    Height: 'HEIGHT',
    Distance: 'DISTANCE',
    FloorsClimbed: 'FLOORS_CLIMBED',
    ExerciseSession: 'EXERCISE',
  }
  const expected = requested.map((r) => RECORD_TO_PERM[r]).filter(Boolean)
  assert.ok(expected.length >= 17, `expected the 17 record types, saw ${expected.length}`)
  for (const perm of expected) {
    assert.ok(declared.includes(perm), `manifest is missing READ_${perm}`)
  }
  for (const perm of declared) {
    assert.ok(expected.includes(perm), `manifest declares READ_${perm} but nothing reads it`)
  }
})

test('READ only — this app never writes to a health record', () => {
  const plugin = read('plugins/withHealthConnect.js')
  assert.doesNotMatch(strip(plugin), /permission\.health\.WRITE/)
  assert.doesNotMatch(strip(HC), /insertRecords|accessType: 'write'/)
})

test('the privacy-rationale intent is declared, or Play rejects the listing', () => {
  // Health Connect links to the app's privacy policy from its own permission
  // screen, and Play requires any app requesting health permissions to handle
  // that intent. Without it the link dead-ends on device.
  assert.match(read('plugins/withHealthConnect.js'), /androidx\.health\.ACTION_SHOW_PERMISSIONS_RATIONALE/)
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /ACTION_SHOW_PERMISSIONS_RATIONALE/)
})

test('minSdk is 26, which Health Connect requires', () => {
  // Drops Android 7.x — about 1% of devices, none of which can run Health
  // Connect anyway.
  const plugins = json('app.json').expo.plugins
  const bp = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')
  assert.ok(bp, 'expo-build-properties must be configured')
  assert.equal(bp[1].android.minSdkVersion, 26)
})

test('the HIPAA backup plugin is still last, after the Health Connect one', () => {
  // Adding a plugin is exactly how the backup attributes got claimed by
  // someone else last time.
  const plugins = json('app.json').expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p))
  assert.equal(plugins[plugins.length - 1], './plugins/withHipaaBackupRules')
  assert.ok(plugins.indexOf('./plugins/withHealthConnect') < plugins.length - 1)
})

test('THE POINT: the drawer row is no longer iOS-gated', () => {
  // The whole reason Vishal could not find Health Sync on his S26.
  const drawer = strip(read('components/profile-content.tsx'))
  assert.match(drawer, /\{canOpenHealthSync && \(/)
  assert.doesNotMatch(drawer, /Platform\.OS === 'ios' && canOpenHealthSync/)
})

test('the screen reads the facade, not HealthKit directly', () => {
  // isHealthKitAvailable() is false on Android by construction, so reading it
  // meant the screen could only ever say "not available on this device".
  const screen = strip(read('app/Home/apple-health.tsx'))
  assert.match(screen, /from '@\/services\/health-source'/)
  assert.match(screen, /isHealthSourceAvailable\(\)/)
  assert.match(screen, /requestHealthSourceAccess\(\)/)
  assert.doesNotMatch(screen, /isHealthKitAvailable\(\)/)
  assert.doesNotMatch(screen, /initializeHealthKit\(\)/)
})

test('THE POINT: no user-visible string hard-codes Apple on Android', () => {
  /*
   * The COS-930 bug, pinned. Six strings — including the switch label and its
   * accessibility label — said "Apple Health" regardless of platform, so a
   * Galaxy S26 offered "Enable Apple Health".
   *
   * Every remaining literal mention must sit behind an explicit
   * `Platform.OS === 'ios'` branch. Anything else has to interpolate the
   * resolved brand.
   */
  const raw = read('app/Home/apple-health.tsx')
  const code = strip(raw)
  const lines = code.split('\n')
  const offenders = lines
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => /Apple Health|Apple Watch|iPhone/.test(l))
    .filter(({ l }) => !/Platform\.OS === 'ios'/.test(l))
    // A ternary can put the iOS test on the previous line.
    .filter(({ n }) => !/Platform\.OS === 'ios'/.test(lines[n - 2] ?? ''))
  assert.deepEqual(
    offenders.map((o) => `${o.n}: ${o.l.trim().slice(0, 70)}`),
    [],
    'Apple branding must be behind an iOS branch or interpolated from the resolved source',
  )

  // ...and the switch itself is interpolated, not literal.
  assert.match(code, /Enable \$\{sourceLabel\}/)
  assert.match(code, /accessibilityLabel=\{`Enable \$\{sourceLabel\}`\}/)
})

test('the screen shows WHERE the data comes from on Android', () => {
  // Samsung Health syncs to Health Connect only once the patient turns that on
  // inside Samsung Health, so a branded button over an empty screen needs the
  // mechanism line to be recoverable.
  const code = strip(read('app/Home/apple-health.tsx'))
  assert.match(code, /source\.via/)
})

test('"still checking" is distinct from "not available"', () => {
  // `!available` was true while the async check was in flight, so an Android
  // patient saw "Not available on this device" first — and the wrong answer
  // shown first is the one people believe.
  const screen = strip(read('app/Home/apple-health.tsx'))
  assert.match(screen, /useState<boolean \| null>\(null\)/)
  assert.match(screen, /available === null \?/)
})

test('THE POINT: every consumer reads the SOURCE, not HealthKit', () => {
  /*
   * COS-932 — the gap Vishal found. COS-929 wired the Health Sync screen and
   * stopped there, so the toggle said "Samsung Health connected" while the
   * vitals section said "Health Connect for Android coming soon", the health
   * summary was empty, and the wellbeing score's sleep pillar read "no data
   * yet". Every one of those consumers still called HealthKit directly, which
   * is false on Android by construction.
   */
  for (const f of ['hooks/use-healthkit-trends.ts', 'hooks/use-readiness-derivation.ts']) {
    const code = strip(read(f))
    assert.match(code, /from '@\/services\/health-source'/, `${f} must read the facade`)
    /*
     * Any HealthKit-named CALL, not a specific spelling. The first version of
     * this asserted `getHealthKitVitalTrend(` and a mutation swapping in
     * `getAllHealthKitVitalTrends(` sailed straight through it — a test that
     * pins one name is a test that misses its sibling.
     *
     * initializeHealthKit is the one legitimate exception: it is the iOS
     * permission prompt and is still correct to call on iOS.
     */
    const hkCalls = [...code.matchAll(/(^|[^\w.])(?<!function )(\w*HealthKit\w*)\s*\(/g)]
      .map((m) => m[2])
      // initializeHealthKit is the iOS permission prompt, still correct there.
      // useHealthKitTrends is this hook's OWN name — a declaration, not a
      // call. The name is now a misnomer (it reads whichever source is
      // active) but renaming it would touch every consumer, and the name is
      // not what was broken.
      .filter((n) => n !== 'initializeHealthKit' && n !== 'useHealthKitTrends')
    assert.deepEqual(hkCalls, [], `${f} calls HealthKit directly: ${hkCalls.join(', ')}`)
  }
})

test('the gate asks whether a SOURCE exists, not whether it is iOS', () => {
  // shouldFetchAppleHealthTrends(isIos, ...) closed every trend on Android.
  const gate = strip(read('lib/apple-health-gate.ts'))
  assert.match(gate, /shouldFetchHealthTrends\(\s*hasHealthSource: boolean/)
  assert.match(gate, /resolveHealthTrendsState\(\s*hasHealthSource: boolean/)
})

test('no screen still advertises Health Connect as "coming soon"', () => {
  // It shipped. Saying otherwise on a device that has it connected is worse
  // than saying nothing.
  for (const f of ['components/health-summary/VitalsRedFlagSection.tsx']) {
    assert.doesNotMatch(strip(read(f)), /coming soon/i, `${f} still says coming soon`)
  }
})

test('Android trends reuse the iOS metricCodes', () => {
  /*
   * metricCode is what the vitals section, the readiness snapshot and the
   * wellbeing score key on. Minting Android-specific codes would make the same
   * measurement a different metric depending on the patient's phone, and a
   * patient switching device would lose their history.
   */
  const hc = strip(read('services/health-connect.ts'))
  assert.match(hc, /import \{ VITAL_SPECS/, 'must import the shared specs')
  assert.doesNotMatch(hc, /metricCode: '/, 'must not declare its own metric codes')
})

test('trends are one point per DAY, not one per sample', () => {
  // A watch writes a heart rate every few minutes; 20,000 raw points is
  // unreadable and makes the trend direction meaningless.
  const hc = strip(read('services/health-connect.ts'))
  assert.match(hc, /byDay/)
  assert.match(hc, /\.slice\(0, 10\)/)
})

test('THE POINT: the Health Sync preference is readable on Android', () => {
  /*
   * COS-933 — one line, and it silently emptied every Android health surface.
   *
   * useAppleHealthPreference had `enabled: Platform.OS === 'ios'`, so on
   * Android the query never ran, `data` stayed undefined, `data === true` was
   * false, and the trends gate never opened. The Health Sync screen said
   * "Samsung Health connected" while the vitals section told the same patient
   * to "turn on Samsung Health in Health Sync".
   *
   * The preference is a plain AsyncStorage boolean and governs BOTH sources by
   * design — to the patient it is one setting.
   */
  const code = strip(read('hooks/use-apple-health-preference.ts'))
  assert.doesNotMatch(code, /enabled:\s*Platform\.OS === 'ios'/,
    'the preference read must not be gated to iOS')
  assert.doesNotMatch(code, /Platform\.OS/,
    'nothing in the preference read should branch on platform at all')
})

test('THE POINT: every vitals tile has an Android source', () => {
  /*
   * COS-934 — the vitals section renders a FIXED set of seven tiles keyed by
   * metricCode. Three of them had no entry in TREND_SOURCES, so on Android
   * they read "no recent data" forever regardless of what the patient's watch
   * recorded — steps, blood glucose and HRV. Steps was the worst: READ_STEPS
   * was already granted and the metric was simply never mapped.
   *
   * This compares the tiles the UI asks for against the metrics Health Connect
   * can answer, so adding a tile without a source fails here rather than
   * shipping as a permanently empty box.
   */
  const section = read('components/health-summary/VitalsRedFlagSection.tsx')
  const specs = read('services/health.ts')
  const hc = read('services/health-connect.ts')

  const tileCodes = [...section.matchAll(/^\s*\w+: '(hk-[a-z0-9-]+)',$/gm)].map((m) => m[1])
  assert.ok(tileCodes.length >= 7, `expected the vitals tiles, saw ${tileCodes.length}`)

  // metricCode -> metric key, from the shared specs.
  /*
   * The quotes are OPTIONAL. VITAL_SPECS writes `steps: {` unquoted because it
   * is a valid JS identifier, and `'blood-glucose': {` quoted because it is
   * not. A regex demanding quotes silently skipped `steps` — so the tile with
   * NO source was the one the test could not see, and a mutation removing it
   * passed. Every key must be resolvable or the assertion below is theatre.
   */
  const specBlocks = [...specs.matchAll(/'?([a-z-]+)'?:\s*\{\s*metricCode: '(hk-[a-z0-9-]+)'/g)]
  const codeToMetric = Object.fromEntries(specBlocks.map((m) => [m[2], m[1]]))

  const hcStart = hc.indexOf('const TREND_SOURCES')
  const hcSeg = hc.slice(hcStart, hcStart + 8000)
  const supplied = new Set(
    [...hcSeg.matchAll(/^  '?([a-z-]+)'?:\s*\{$/gm)].map((m) => m[1]),
  )

  // A tile whose code resolves to no metric is itself a failure — it means
  // this test cannot see it, which is how `steps` hid.
  const unresolved = tileCodes.filter((code) => !codeToMetric[code])
  assert.deepEqual(unresolved, [], `tile codes with no VITAL_SPECS entry: ${unresolved.join(', ')}`)

  const orphans = tileCodes
    .map((code) => ({ code, metric: codeToMetric[code] }))
    .filter(({ metric }) => !supplied.has(metric))
    .map(({ code, metric }) => `${code} (${metric})`)

  assert.deepEqual(orphans, [], `vitals tiles with no Android source: ${orphans.join(', ')}`)
})
