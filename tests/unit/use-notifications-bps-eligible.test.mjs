// tests/unit/use-notifications-bps-eligible.test.mjs — CHUNK 91 (2026-07-23)
//
// Pins the CONTRACT that hooks/use-notifications.ts's private
// `isBpsEligibleCached()` helper must uphold. That predicate decides
// whether a tapped push notification lands the user on the new
// biopsychosocial-plan surface (`/Home/biopsychosocial-plan`) or the
// legacy `/Home/health-plan` — read at tap-time straight off the
// already-populated feature-flags query cache, so the client can't
// route a user to a screen their flags won't render.
//
// Locked semantics (mirrors useBiopsychosocialPlanFlag in
// hooks/use-assessment-strategy-v2-flag.ts):
//
//   (a) BOTH assessment_strategy_v2_enabled AND
//       biopsychosocial_plan_enabled === true  ⇒ true
//   (b) EITHER flag false/missing              ⇒ false
//   (c) queryClient.getQueryData(...) returns undefined (cold-start
//       before /v1/feature-flags settles)      ⇒ false (safe default)
//   (d) truthy-non-true values (1, 'true', {}, [], 'yes') fail the
//       strict === true guard                  ⇒ false
//   (e) other cached keys (['assessment-strategy-v2'], ['flags'], etc.)
//       are ignored — ONLY ['feature-flags'] is read
//   (f) source-drift trip wire: readFileSync hooks/use-notifications.ts
//       and assert the two flag names AND the exact predicate shape
//       appear verbatim — renaming the BE flag without updating the
//       client would silently break gating.
//
// WHY A MIRROR TEST + SOURCE-DRIFT TRIP WIRES (chunk 84 v2 pattern):
//   `isBpsEligibleCached` is NOT exported from hooks/use-notifications.ts
//   (it's a private module-level helper referenced only inside
//   `navigateForNotification`). Importing it directly is impossible;
//   spinning up jsdom + a real React-Query QueryClient just to poke
//   getQueryData through the real function would drag in ~30MB of
//   devDeps to test what is fundamentally an 8-line predicate.
//
//   The mirror re-implements the exact predicate shape as pure JS
//   against a hand-rolled `queryClient.getQueryData` stand-in. That
//   catches "did the predicate stop being AND", "did we lose the
//   strict === true guard", "did we forget the safe-default fallback"
//   etc. — but the mirror is BLIND to source drift: if
//   hooks/use-notifications.ts silently renames the flag or drops the
//   AND, the mirror still passes green while the shipped app quietly
//   regresses. The trailing "source-drift trip wires" suite reads the
//   .ts source as text and asserts the load-bearing literals appear
//   verbatim, matching the discipline in
//   tests/unit/use-wellbeing-derivation.test.mjs (chunk 84 v2) and
//   lib/assessment-bands.test.mjs (chunks 68/85).
//
//   If any trip wire fails, DO NOT edit the regex to make it pass.
//   Read the diff on hooks/use-notifications.ts, confirm the source
//   change is intentional (BE flag was really renamed, predicate was
//   really relaxed, etc.), and only then update the trip wire.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob already
// present in package.json (see chunk 84 v2 which normalized that
// pattern). No config changes required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const USE_NOTIFICATIONS_TS_PATH = join(REPO_ROOT, 'hooks', 'use-notifications.ts')
const USE_NOTIFICATIONS_TS_SRC = readFileSync(USE_NOTIFICATIONS_TS_PATH, 'utf8')

// =========================================================================
// Mirror of isBpsEligibleCached() from hooks/use-notifications.ts.
//
// Reproduces the exact predicate shape:
//   const flags = queryClient.getQueryData<...>(['feature-flags'])
//   return flags?.assessment_strategy_v2_enabled === true &&
//     flags?.biopsychosocial_plan_enabled === true
//
// `makeIsBpsEligibleCached(queryClient)` returns a bound predicate over
// the provided queryClient stand-in so each test can inject its own
// cache state. The try/catch wrapper matches the source's defensive
// posture — a thrown `.getQueryData` still yields false, never crashes
// the tap pipeline.
// =========================================================================

function makeIsBpsEligibleCached(queryClient) {
  return function isBpsEligibleCached() {
    try {
      const flags = queryClient.getQueryData(['feature-flags'])
      return (
        flags?.assessment_strategy_v2_enabled === true &&
        flags?.biopsychosocial_plan_enabled === true
      )
    } catch {
      return false
    }
  }
}

// Stand-in queryClient. Keys are stringified so ['feature-flags'] and
// ['feature-flags'] compare equal even across separate array literals —
// matching @tanstack/react-query's default queryKeyHashFn.
function makeQueryClient(initialData = {}) {
  const store = new Map()
  for (const [key, value] of Object.entries(initialData)) {
    store.set(key, value)
  }
  return {
    getQueryData(key) {
      return store.get(JSON.stringify(key))
    },
    setQueryData(key, value) {
      store.set(JSON.stringify(key), value)
    },
  }
}

const FEATURE_FLAGS_KEY = ['feature-flags']

// =========================================================================
// (a) BOTH flags true → true
// =========================================================================

test('(a) both flags === true ⇒ eligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: true,
    },
  })
  const isEligible = makeIsBpsEligibleCached(qc)
  assert.equal(isEligible(), true)
})

test('(a) both flags true alongside other unrelated flags ⇒ still eligible', () => {
  // Feature-flags response typically carries dozens of keys; the
  // predicate must ignore everything except the two it cares about.
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: true,
      apple_health_gate_enabled: false,
      care_plan_v2_enabled: true,
      unified_plan_default_enabled: false,
      health_summary_v3_enabled: true,
    },
  })
  const isEligible = makeIsBpsEligibleCached(qc)
  assert.equal(isEligible(), true)
})

// =========================================================================
// (b) Either flag false or missing → false
// =========================================================================

test('(b) assessment_strategy_v2_enabled=true, biopsychosocial_plan_enabled=false ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: false,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(b) assessment_strategy_v2_enabled=false, biopsychosocial_plan_enabled=true ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: false,
      biopsychosocial_plan_enabled: true,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(b) both flags false ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: false,
      biopsychosocial_plan_enabled: false,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(b) assessment_strategy_v2_enabled missing entirely ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      biopsychosocial_plan_enabled: true,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(b) biopsychosocial_plan_enabled missing entirely ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: true,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(b) empty flags object ⇒ ineligible (neither key present)', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {},
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

// =========================================================================
// (c) Undefined cache → false (safe default)
//
// This is the cold-start path: /v1/feature-flags hasn't settled yet, so
// getQueryData(['feature-flags']) returns undefined. A push notification
// tapped during that window MUST fall through to the legacy route rather
// than gambling on a bio-eligible destination the flags don't render.
// =========================================================================

test('(c) queryClient cache empty (undefined) ⇒ ineligible (cold-start safe default)', () => {
  const qc = makeQueryClient() // no ['feature-flags'] entry seeded
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(c) queryClient explicitly returns undefined ⇒ ineligible', () => {
  // Simulate the exact `queryClient.getQueryData(...) === undefined`
  // case (as opposed to "the key was never set"). The optional-chain
  // guards in the source must swallow this without a TypeError.
  const qc = {
    getQueryData: () => undefined,
  }
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(c) queryClient.getQueryData throws ⇒ ineligible (try/catch swallows, tap pipeline never crashes)', () => {
  // The source wraps the predicate in try/catch specifically so a
  // pathological cache state can't crash the notification navigation
  // pipeline. Dropping the try/catch would let the tap handler throw
  // and the user's tap would silently do nothing.
  const qc = {
    getQueryData: () => {
      throw new Error('cache exploded')
    },
  }
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(c) queryClient.getQueryData returns null (not undefined) ⇒ ineligible', () => {
  // Some middlewares seed `null` instead of leaving the cache truly
  // empty. Optional chaining short-circuits on both null and undefined.
  const qc = {
    getQueryData: () => null,
  }
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

// =========================================================================
// (d) Truthy-non-true values fail the strict === true guard
//
// This is the load-bearing invariant: the BE returns booleans, but if a
// serializer/deserializer somewhere flips them to 'true' strings or 1s
// (JSON-over-DDB stringification, MessagePack, etc.), the predicate MUST
// still say ineligible — because downstream screens key their render
// path on the same strict === true guard. Loose truthiness here would
// route users to a surface their downstream rendering guard refuses to
// draw.
// =========================================================================

test('(d) string \'true\' fails strict === true ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: 'true',
      biopsychosocial_plan_enabled: 'true',
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(d) numeric 1 fails strict === true ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: 1,
      biopsychosocial_plan_enabled: 1,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(d) empty object {} fails strict === true ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: {},
      biopsychosocial_plan_enabled: {},
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(d) empty array [] fails strict === true ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: [],
      biopsychosocial_plan_enabled: [],
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(d) truthy string \'yes\' fails strict === true ⇒ ineligible', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: 'yes',
      biopsychosocial_plan_enabled: 'yes',
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test('(d) mixed: one strictly true, one string \'true\' ⇒ ineligible (AND with strict guard)', () => {
  const qc = makeQueryClient({
    [JSON.stringify(FEATURE_FLAGS_KEY)]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: 'true',
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

// =========================================================================
// (e) Other cached keys ignored — ONLY ['feature-flags'] is read
//
// Guards against a source drift where someone points the predicate at
// an adjacent cache key (e.g. ['feature-flag'], ['flags'],
// ['assessment-strategy-v2']) and starts reading the wrong data.
// =========================================================================

test("(e) ['flags'] populated but ['feature-flags'] empty ⇒ ineligible (wrong key ignored)", () => {
  const qc = makeQueryClient({
    [JSON.stringify(['flags'])]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: true,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test("(e) ['feature-flag'] (singular) populated ⇒ ineligible (typo key ignored)", () => {
  const qc = makeQueryClient({
    [JSON.stringify(['feature-flag'])]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: true,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test("(e) ['assessment-strategy-v2'] populated ⇒ ineligible (adjacent key ignored)", () => {
  const qc = makeQueryClient({
    [JSON.stringify(['assessment-strategy-v2'])]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: true,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test("(e) ['feature-flags', userId] scoped key populated but bare ['feature-flags'] empty ⇒ ineligible", () => {
  // The real /v1/feature-flags query key is the bare tuple; a scoped
  // variant does not satisfy the predicate.
  const qc = makeQueryClient({
    [JSON.stringify(['feature-flags', 'user-123'])]: {
      assessment_strategy_v2_enabled: true,
      biopsychosocial_plan_enabled: true,
    },
  })
  assert.equal(makeIsBpsEligibleCached(qc)(), false)
})

test("(e) predicate only calls getQueryData with ['feature-flags'] — never any other key", () => {
  const calls = []
  const qc = {
    getQueryData: (key) => {
      calls.push(key)
      return {
        assessment_strategy_v2_enabled: true,
        biopsychosocial_plan_enabled: true,
      }
    },
  }
  assert.equal(makeIsBpsEligibleCached(qc)(), true)
  assert.equal(calls.length, 1, 'must read the cache exactly once per tap')
  assert.deepEqual(calls[0], ['feature-flags'])
})

// =========================================================================
// SOURCE-DRIFT TRIP WIRES (CHUNK 91, 2026-07-23)
//
// The mirror suite above reproduces the predicate's semantics but is
// BLIND to the shipped source. If someone renames the BE flag (or the
// client key), silently drops the AND, relaxes === true to a truthy
// check, or reroutes the read to a different cache key, the mirror
// still passes green while shipped taps route to the wrong screen.
//
// The tests below read hooks/use-notifications.ts as text and grep for
// the load-bearing literals we cannot enforce behaviorally without
// spinning up React + jsdom + a real QueryClient. Same pattern as
// tests/unit/use-wellbeing-derivation.test.mjs (chunk 84 v2).
//
// If a trip wire fails, DO NOT edit the regex to make it pass. Read
// the diff on hooks/use-notifications.ts, confirm the source change is
// intentional (BE flag really renamed, cache key really changed), and
// only then update the trip wire.
// =========================================================================

test('(trip wire i) hooks/use-notifications.ts references assessment_strategy_v2_enabled verbatim', () => {
  // Renaming the BE flag without updating the client would silently
  // break gating — the predicate would read a nonexistent field
  // (undefined ≠ true) and every user would fall through to the
  // legacy route regardless of their eligibility.
  assert.match(
    USE_NOTIFICATIONS_TS_SRC,
    /assessment_strategy_v2_enabled/,
    "flag name 'assessment_strategy_v2_enabled' must appear verbatim — a rename here without a matching BE change breaks tap-time gating",
  )
})

test('(trip wire ii) hooks/use-notifications.ts references biopsychosocial_plan_enabled verbatim', () => {
  assert.match(
    USE_NOTIFICATIONS_TS_SRC,
    /biopsychosocial_plan_enabled/,
    "flag name 'biopsychosocial_plan_enabled' must appear verbatim — a rename here without a matching BE change breaks tap-time gating",
  )
})

test("(trip wire iii) hooks/use-notifications.ts reads the ['feature-flags'] cache key verbatim", () => {
  // The predicate is coupled to the exact key used by the /v1/feature-
  // flags useQuery elsewhere in the app. If the reader drifts to
  // 'feature-flag' or 'flags' or gains an extra tuple entry, the cache
  // hit rate drops to 0% and every user routes as ineligible.
  // Note: the TS generic on getQueryData contains a nested `>` (e.g.
  // `<Record<string, boolean> | undefined>`), so we can't use [^>] to
  // hop the type arg. Match `getQueryData` + any-nongreedy-chars up to
  // the opening `(`, then the tuple. `[\s\S]*?` handles multi-line
  // type args without eating past the paren.
  assert.match(
    USE_NOTIFICATIONS_TS_SRC,
    /getQueryData(?:<[\s\S]*?>)?\(\s*\[\s*['"]feature-flags['"]\s*,?\s*\]/,
    "isBpsEligibleCached must read queryClient.getQueryData(['feature-flags']) — any drift in the key breaks the cache hit rate",
  )
})

test('(trip wire iv) isBpsEligibleCached preserves the AND predicate on strict === true', () => {
  // The two guards are load-bearing:
  //   1. `&&` (AND, not OR) — the two flags MUST be conjunctive because
  //      biopsychosocial-plan rendering downstream requires both.
  //   2. `=== true` (strict equality, not truthy) — protects against
  //      serializer-mangled values (see mirror case (d)).
  // Any relaxation here would silently route users to a surface their
  // downstream render guard refuses to draw.
  assert.match(
    USE_NOTIFICATIONS_TS_SRC,
    /assessment_strategy_v2_enabled\s*===\s*true\s*&&[\s\S]{0,120}biopsychosocial_plan_enabled\s*===\s*true/,
    'predicate must remain `assessment_strategy_v2_enabled === true && biopsychosocial_plan_enabled === true` — dropping the AND or the strict === true guard misroutes taps',
  )
})

test('(trip wire v) isBpsEligibleCached retains try/catch cold-start / cache-explosion fallback', () => {
  // The try/catch wrapper is what keeps a pathological cache state from
  // crashing the notification tap pipeline. Removing it would let a
  // thrown getQueryData propagate up through navigateForNotification
  // and silently swallow the tap with no navigation.
  const fnStart = USE_NOTIFICATIONS_TS_SRC.indexOf('function isBpsEligibleCached')
  assert.notEqual(fnStart, -1, "function isBpsEligibleCached must still be declared in hooks/use-notifications.ts")
  const fnBody = USE_NOTIFICATIONS_TS_SRC.slice(fnStart, fnStart + 600)
  assert.match(
    fnBody,
    /try\s*\{[\s\S]+catch\s*\{[\s\S]*return\s+false/,
    'isBpsEligibleCached must retain try/catch → return false — dropping it lets a thrown getQueryData crash the tap pipeline',
  )
})

test('(trip wire vi) isBpsEligibleCached is called with bpsEnabled label into routeForNotificationData', () => {
  // The whole point of this helper is to feed `bpsEnabled` into
  // routeForNotificationData so MEDICATION_REFILL_REMINDER taps land
  // on the biopsychosocial-plan surface for eligible patients. If the
  // call site is renamed away from `bpsEnabled`, the routing table's
  // opts parameter no longer sees the signal even though the predicate
  // still works.
  assert.match(
    USE_NOTIFICATIONS_TS_SRC,
    /routeForNotificationData\(\s*data\s*,\s*\{\s*bpsEnabled:\s*isBpsEligibleCached\(\)\s*\}\s*\)/,
    'navigateForNotification must call routeForNotificationData(data, { bpsEnabled: isBpsEligibleCached() }) — a rename here decouples the predicate from the router',
  )
})
