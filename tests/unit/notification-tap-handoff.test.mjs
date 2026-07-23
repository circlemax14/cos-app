// tests/unit/notification-tap-handoff.test.mjs — CHUNK 98 (2026-07-23)
//
// Source-drift trip wires for the push-notification tap-handoff wire
// inside hooks/use-notifications.ts. That module glues three moving
// parts together:
//
//   1. It imports the pure `routeForNotificationData()` helper from
//      lib/notification-routing.ts.
//   2. It hands the tapped notification's `content.data` payload — plus
//      an `opts` object carrying `bpsEnabled` — to that helper.
//   3. It takes the returned route string (or null) and shoves it into
//      an Expo Router navigation call (`router.push` / `router.replace`),
//      guarding against a null return so unknown-type taps don't crash
//      the pipeline or throw.
//   4. The whole thing is only reachable because the module registers
//      an Expo Notifications listener via
//      `addNotificationResponseReceivedListener` (warm-tap) and the
//      cold-start path drives the same navigator via
//      `useLastNotificationResponse`.
//
// If ANY of those wires break — the import goes away, the opts object
// stops carrying `bpsEnabled`, the returned route stops being fed to
// `router.push`, the null-guard is dropped, or the listener registration
// changes name — a cold-start push tap silently no-ops. The user opens
// the app, sees the last screen, and never lands on the routed target.
// Zero runtime error, zero test failure elsewhere; the whole feature
// just quietly rots.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 pattern, no behavioral mirror):
//   hooks/use-notifications.ts is a React hook wrapping Expo Notifications
//   platform bindings (`addNotificationResponseReceivedListener`,
//   `useLastNotificationResponse`, `getExpoPushTokenAsync`). Standing up
//   a behavioral mirror would require jsdom + React Native mocks +
//   expo-notifications shims + an Expo Router stub — ~30MB of devDeps to
//   exercise five load-bearing lines. Instead we read the .ts source as
//   text and grep for the literals that must appear for the wire to be
//   intact. Same discipline as:
//     - tests/unit/use-notifications-bps-eligible.test.mjs (chunk 91)
//     - tests/unit/use-wellbeing-derivation.test.mjs       (chunk 84 v2)
//     - lib/assessment-bands.test.mjs                       (chunks 68/85)
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on hooks/use-notifications.ts, confirm the source
//   change is deliberate (listener API really changed, route helper
//   really renamed, null-guard really tightened), and only then update
//   the trip wire in lockstep.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob already
// present in package.json. No config changes required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const USE_NOTIFICATIONS_TS_PATH = join(REPO_ROOT, 'hooks', 'use-notifications.ts')
const USE_NOTIFICATIONS_TS_SRC_RAW = readFileSync(USE_NOTIFICATIONS_TS_PATH, 'utf8')

// Strip comments before running the load-bearing "the code literally does X"
// matchers. Without this, a commented-out `// router.push((route ?? '/Home')…)`
// line would still contain the substring `router.push(...route...)` and
// silently satisfy every downstream matcher — exactly the drift shape this
// file is meant to catch (see the self-check tests at the bottom of this
// file which enforce it against a synthetic drift source).
//
// v2 (chunk 98): a naive regex like /\/\/[^\n]*/g both (1) fails to track
// block-comment state — a `//` sitting INSIDE `/* … */` splits the block
// early — and (2) unsafely bites into `//` sequences that live inside
// string literals such as `'https://…'`. We use a line-oriented state
// machine that:
//   - blanks any line whose first non-whitespace chars are `//`
//   - tracks whether we're currently inside a `/* … */` block and blanks
//     every line that opens, sits fully inside, or closes such a block
//     (leaving code on the opening line before the `/*` intact)
// String literals with `//` inside are untouched — the machine only blanks
// lines that BEGIN as comments; a `foo('https://x')` line survives verbatim.
function stripComments(src) {
  const out = []
  let inBlock = false
  for (const rawLine of src.split('\n')) {
    if (inBlock) {
      // We're inside a multi-line block comment. Blank the line and
      // watch for the closing `*/`. Any code AFTER the `*/` on the
      // closing line is dropped too — this is intentional: the source
      // file we scan doesn't put load-bearing code on a block-close
      // line, and keeping the state machine simple beats the extra
      // branch. If that ever becomes untrue we'd revisit here.
      if (rawLine.includes('*/')) inBlock = false
      out.push('')
      continue
    }
    const trimmed = rawLine.trimStart()
    if (trimmed.startsWith('//')) {
      // Whole-line line comment — drop it.
      out.push('')
      continue
    }
    if (trimmed.startsWith('/*')) {
      // Block comment opens the (trimmed) line. If it also closes on
      // the same line, drop just the comment span; otherwise flip
      // state and blank the line.
      if (trimmed.slice(2).includes('*/')) {
        out.push(rawLine.replace(/\/\*[\s\S]*?\*\//g, ''))
      } else {
        out.push('')
        inBlock = true
      }
      continue
    }
    // Regular code line — keep as-is. We deliberately leave any trailing
    // `// …` inline comment on a code line untouched: for the wires below
    // the code BEFORE the `//` is what matters, and killing the tail could
    // corrupt strings like `'https://…'`.
    out.push(rawLine)
  }
  return out.join('\n')
}

const USE_NOTIFICATIONS_TS_SRC = stripComments(USE_NOTIFICATIONS_TS_SRC_RAW)

// Locate the `navigateForNotification` function body once — several trip
// wires below want to grep inside just the tap-handoff function rather
// than the whole file (which also contains the foreground listener, the
// cold-start effect, and the token-registration path). Slicing to the
// function keeps each wire narrowly scoped so a match elsewhere in the
// file can't accidentally satisfy a wire that should be checking the
// handoff specifically.
const NAV_FN_START = USE_NOTIFICATIONS_TS_SRC.indexOf(
  'function navigateForNotification',
)
assert.notEqual(
  NAV_FN_START,
  -1,
  'function navigateForNotification must still be declared in hooks/use-notifications.ts — it is the single tap-handoff site',
)
// 1500 chars is enough to comfortably cover the current body (~30 lines)
// with headroom for reasonable refactors, without eating past the file
// end (~232 lines / ~7KB total).
const NAV_FN_BODY = USE_NOTIFICATIONS_TS_SRC.slice(NAV_FN_START, NAV_FN_START + 1500)

// =========================================================================
// (a) hooks/use-notifications.ts imports routeForNotificationData from
//     lib/notification-routing.
//
// If someone deletes the import, the file won't compile — but if someone
// swaps to a fake local helper with the same name (or reroutes the
// import to a stale copy of notification-routing under a different
// path), TypeScript still compiles green and the shipped app quietly
// stops calling the real routing table.
// =========================================================================

test('(a) imports routeForNotificationData from @/lib/notification-routing (or a relative equivalent)', () => {
  // Accept either the `@/lib/notification-routing` alias (current form)
  // or a relative `../lib/notification-routing` variant, plus the CJS
  // `require(...)` form for defensive coverage. Reject any other module
  // specifier — a swap to `@/lib/notification-routing-v2` or
  // `@/lib/routing-stub` would satisfy neither pattern.
  const importPattern =
    /import\s*\{[^}]*\brouteForNotificationData\b[^}]*\}\s*from\s*['"](?:@\/lib\/notification-routing|(?:\.{1,2}\/)+lib\/notification-routing)['"]/
  const requirePattern =
    /const\s*\{[^}]*\brouteForNotificationData\b[^}]*\}\s*=\s*require\(\s*['"](?:@\/lib\/notification-routing|(?:\.{1,2}\/)+lib\/notification-routing)['"]\s*\)/
  const matched =
    importPattern.test(USE_NOTIFICATIONS_TS_SRC) ||
    requirePattern.test(USE_NOTIFICATIONS_TS_SRC)
  assert.equal(
    matched,
    true,
    "hooks/use-notifications.ts must import routeForNotificationData from '@/lib/notification-routing' — a rename or path swap decouples the tap handler from the real routing table",
  )
})

// =========================================================================
// (b) The tap handler passes the notification data AND an opts object
//     carrying `bpsEnabled` to routeForNotificationData.
//
// The whole point of chunk 64's plumbing is that MEDICATION_REFILL_REMINDER
// taps route to `/Home/biopsychosocial-plan?focus=medications` for
// bio-eligible patients and `/Home/health-plan` for everyone else. That
// branching lives inside routeForNotificationData and is driven off
// `opts.bpsEnabled`. Drop the opts arg (or drop the `bpsEnabled` key
// inside it) and every user routes as ineligible regardless of their
// flags — no error, just quiet mis-routing.
// =========================================================================

test('(b) navigateForNotification calls routeForNotificationData with (data, { bpsEnabled: ... })', () => {
  // The `bpsEnabled` value expression is deliberately non-anchored —
  // today it's `isBpsEligibleCached()`, but a future refactor might
  // inline the predicate or rename the helper. What must be preserved
  // is (1) the two-argument shape, (2) `data` as first arg, and (3)
  // an object literal second arg containing the `bpsEnabled` key.
  assert.match(
    NAV_FN_BODY,
    /routeForNotificationData\(\s*data\s*,\s*\{\s*[\s\S]{0,200}?\bbpsEnabled\s*:\s*[\s\S]+?\}\s*\)/,
    'navigateForNotification must call routeForNotificationData(data, { bpsEnabled: ... }) — dropping the opts arg or the bpsEnabled key silently mis-routes MEDICATION_REFILL_REMINDER taps',
  )
})

// =========================================================================
// (c) The handler binds the return value to an identifier and then
//     references that identifier inside a router.push / router.replace
//     call.
//
// A regression where someone drops the assignment (calling the helper
// for side effects only, never using its return) or swaps the router
// call to a literal string would silently break tap routing. The wire
// asserts identifier binding + downstream reference inside an Expo
// Router navigation call.
// =========================================================================

test('(c) return value binds to a const/let identifier that is then passed to router.push or router.replace', () => {
  // Step 1: find the `const <ident> = routeForNotificationData(...)`
  // (or `let ...`) binding. Capture the identifier so we can then
  // assert it's referenced in a router call.
  const bindMatch = NAV_FN_BODY.match(
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*routeForNotificationData\(/,
  )
  assert.notEqual(
    bindMatch,
    null,
    'navigateForNotification must bind routeForNotificationData(...) to a const/let identifier before navigating — calling for side effects only would drop the route',
  )
  const routeIdent = bindMatch[1]

  // Step 2: assert the identifier appears inside a router.push(...) or
  // router.replace(...) argument list. `\b` around the identifier
  // prevents `route` from matching a longer name like `routeList`.
  const routerCallPattern = new RegExp(
    `router\\.(?:push|replace)\\(\\s*\\(?[^)]*\\b${routeIdent}\\b`,
  )
  assert.match(
    NAV_FN_BODY,
    routerCallPattern,
    `route identifier '${routeIdent}' must be consumed by router.push(...) or router.replace(...) — otherwise routeForNotificationData's return value never reaches Expo Router`,
  )
})

// =========================================================================
// (d) The handler guards against a null return — falsy result → no-op /
//     fallback, no throw.
//
// routeForNotificationData is documented to return `null` for unknown
// or new notification types (see the JSDoc in lib/notification-routing.ts).
// The tap handler must handle that without letting the null propagate
// into router.push as a bare navigation target (which would throw or
// navigate nowhere on Expo Router). Today the guard is `route ?? '/Home'`
// — a nullish coalescing default. We accept either that pattern or an
// explicit `if (!route) { ... }` early-return, or a ternary
// `route ? ... : ...` — anything that provably branches on the falsy
// result. What we reject is a bare `router.push(route)` with no guard.
// =========================================================================

test('(d) navigateForNotification guards against a null / falsy route return before pushing', () => {
  // Re-find the identifier so this wire can stand alone if (c) is later
  // refactored to a different assertion shape.
  const bindMatch = NAV_FN_BODY.match(
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*routeForNotificationData\(/,
  )
  assert.notEqual(
    bindMatch,
    null,
    'expected a const/let binding for routeForNotificationData return — see wire (c)',
  )
  const routeIdent = bindMatch[1]

  // Accept any of these guard shapes, all of which prove the null case
  // is handled without crashing:
  //   1. `route ?? '/Home'`            (nullish coalescing default)
  //   2. `route || '/Home'`            (looser OR default; also OK)
  //   3. `route ? push(route) : push('/Home')` (ternary)
  //   4. `if (!route) return ...` / `if (route == null) ...`
  //       (explicit falsy early-return / branch)
  const nullishCoalesce = new RegExp(`\\b${routeIdent}\\s*\\?\\?\\s*['"]`)
  const orDefault = new RegExp(`\\b${routeIdent}\\s*\\|\\|\\s*['"]`)
  const ternary = new RegExp(`\\b${routeIdent}\\s*\\?\\s*[\\s\\S]{0,200}?:\\s*`)
  const explicitFalsy = new RegExp(
    `if\\s*\\(\\s*!\\s*${routeIdent}\\b|if\\s*\\(\\s*${routeIdent}\\s*==\\s*null`,
  )

  const guarded =
    nullishCoalesce.test(NAV_FN_BODY) ||
    orDefault.test(NAV_FN_BODY) ||
    ternary.test(NAV_FN_BODY) ||
    explicitFalsy.test(NAV_FN_BODY)

  assert.equal(
    guarded,
    true,
    `navigateForNotification must guard against a null return from routeForNotificationData (e.g. '${routeIdent} ?? \\'/Home\\'', or 'if (!${routeIdent}) ...') — piping null into router.push crashes or no-ops the tap`,
  )
})

test("(d) navigateForNotification wraps the router.push call in try/catch so a router-not-ready failure doesn't crash the tap pipeline", () => {
  // Belt-and-suspenders: even with the null-guard above, Expo Router
  // itself can throw if it isn't mounted yet (cold-start race). The
  // shipped code wraps the whole navigate block in try/catch with a
  // fallback push to '/Home'. Dropping the try/catch would let a router
  // exception propagate up through the tap listener and silently kill
  // the tap.
  assert.match(
    NAV_FN_BODY,
    /try\s*\{[\s\S]+catch[\s\S]+\}/,
    'navigateForNotification must retain its try/catch around the router.push call — otherwise a router-not-ready throw silently kills the tap',
  )
})

// =========================================================================
// (e) The tap handler is registered via
//     `addNotificationResponseReceivedListener` (Expo Notifications API).
//
// If someone swaps to the older `addListener('response', ...)` shape, or
// forgets to register the listener entirely (relying only on the
// cold-start `useLastNotificationResponse` path), warm-app taps stop
// routing. Both listeners feed the same `navigateForNotification`
// function, so losing one halves the tap-handoff coverage without any
// compile-time signal.
// =========================================================================

test('(e) warm-tap handler is registered via Notifications.addNotificationResponseReceivedListener', () => {
  assert.match(
    USE_NOTIFICATIONS_TS_SRC,
    /Notifications\.addNotificationResponseReceivedListener\s*\(/,
    'hooks/use-notifications.ts must register a warm-tap listener via Notifications.addNotificationResponseReceivedListener(...) — dropping it silently breaks in-app tap routing',
  )
})

test('(e) cold-start path is wired through Notifications.useLastNotificationResponse', () => {
  // The cold-start counterpart to the warm-tap listener. Dropping it
  // means the tap that LAUNCHED the app from a killed state routes
  // nowhere — the user opens the app to the last screen, exactly the
  // silent no-op this chunk is guarding against.
  assert.match(
    USE_NOTIFICATIONS_TS_SRC,
    /Notifications\.useLastNotificationResponse\s*\(/,
    'hooks/use-notifications.ts must call Notifications.useLastNotificationResponse() — dropping it silently kills cold-start tap routing (the exact regression this file exists to catch)',
  )
})

// The single-navigator invariant. If someone forks two divergent
// navigation implementations — one inline in the listener, one inline
// in the cold-start effect — they'll drift out of sync (e.g. only one
// gets the `bpsEnabled` opts, only one gets the null-guard). We prove
// this by asserting navigateForNotification is invoked inside BOTH the
// cold-start region AND the warm-tap region, sliced as distinct
// sub-ranges of the source.
//
// v2 (chunk 98): the previous form was `SRC.match(/navigateForNotification\s*\(/g)`
// and required `>= 2` matches. That regex also matched the function
// DECLARATION line (`function navigateForNotification(response:`),
// inflating the count by 1 — so deleting either the cold-start OR the
// warm-tap invocation still left declaration + one remaining = 2 and
// the check passed. Region-based slicing sidesteps the declaration
// entirely and detects the exact drop-one-invocation regression.
function sliceColdStartRegion(src) {
  // The cold-start invocation lives inside a `useEffect(...)` that reads
  // `Notifications.useLastNotificationResponse()`. Start the region at
  // that call and end it at the next `useEffect(` (which is the warm-tap
  // effect), or at the `function navigateForNotification` declaration if
  // for some reason the warm-tap effect were removed.
  const startIdx = src.indexOf('useLastNotificationResponse')
  if (startIdx === -1) return ''
  const rest = src.slice(startIdx)
  // Find the next useEffect after the one that owns lastResponse; that
  // one is the warm-tap effect. Skip past the FIRST useEffect (cold-start).
  const firstEffect = rest.indexOf('useEffect(')
  if (firstEffect === -1) return rest.slice(0, 1500)
  const afterFirst = rest.slice(firstEffect + 'useEffect('.length)
  const secondEffect = afterFirst.indexOf('useEffect(')
  const declFallback = rest.indexOf('function navigateForNotification')
  const endOffset =
    secondEffect !== -1
      ? firstEffect + 'useEffect('.length + secondEffect
      : declFallback !== -1
        ? declFallback
        : rest.length
  return rest.slice(0, endOffset)
}

function sliceWarmTapRegion(src) {
  // The warm-tap invocation lives inside the callback registered with
  // `Notifications.addNotificationResponseReceivedListener(...)`. Start
  // at that call and end at the `function navigateForNotification`
  // declaration — nothing else between them can legitimately house a
  // stray `navigateForNotification(` invocation.
  const startIdx = src.indexOf('addNotificationResponseReceivedListener')
  if (startIdx === -1) return ''
  const rest = src.slice(startIdx)
  const declIdx = rest.indexOf('function navigateForNotification')
  return declIdx === -1 ? rest.slice(0, 1500) : rest.slice(0, declIdx)
}

test('(e) cold-start useEffect invokes navigateForNotification(...)', () => {
  const region = sliceColdStartRegion(USE_NOTIFICATIONS_TS_SRC)
  assert.notEqual(
    region,
    '',
    'expected a cold-start useEffect anchored on Notifications.useLastNotificationResponse — could not locate it in hooks/use-notifications.ts',
  )
  assert.match(
    region,
    /navigateForNotification\s*\(/,
    'cold-start path (Notifications.useLastNotificationResponse useEffect) must invoke navigateForNotification(...) — dropping this call means a tap that LAUNCHES the app from a killed state silently routes nowhere',
  )
})

test('(e) warm-tap listener invokes navigateForNotification(...)', () => {
  const region = sliceWarmTapRegion(USE_NOTIFICATIONS_TS_SRC)
  assert.notEqual(
    region,
    '',
    'expected a warm-tap listener registered via Notifications.addNotificationResponseReceivedListener — could not locate it in hooks/use-notifications.ts',
  )
  assert.match(
    region,
    /navigateForNotification\s*\(/,
    'warm-tap listener (Notifications.addNotificationResponseReceivedListener callback) must invoke navigateForNotification(...) — dropping this call silently halves tap-handoff coverage: warm foreground/background taps stop routing',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2)
//
// These tests do NOT read hooks/use-notifications.ts. They exercise the
// tightened regexes and helpers ABOVE against synthetic sources whose
// SOLE PURPOSE is to reproduce the exact drift shapes chunk 98 v1 missed:
//
//   1. A commented-out `// router.push((route ?? '/Home') as never);`
//      line — v1's regex-only strip left the substring live and every
//      downstream matcher happily satisfied itself against the comment.
//   2. A commented-out null-guard (`// route ?? '/Home'`) — same failure
//      mode as (1) but for wire (d).
//   3. Deletion of ONE of the two navigateForNotification invocations —
//      v1's `>= 2` count on `/navigateForNotification\s*\(/g` matched the
//      function declaration too, so declaration + one remaining call =
//      2 and the check passed. Region-based slicing must fail cleanly.
//
// If any of THESE self-checks flip green when the drift is present, the
// trip wires above are once again toothless and must be re-tightened.
// This is the chunk 84 v2 discipline: prove the trap actually snaps shut.
// =========================================================================

test('self-check: stripComments blanks a line-commented router.push, so wire (c) would fail on drift', () => {
  const broken = [
    'function navigateForNotification(response) {',
    "  const route = routeForNotificationData(data, { bpsEnabled: true });",
    "  // router.push((route ?? '/Home') as never);",
    '}',
  ].join('\n')
  const stripped = stripComments(broken)
  // Re-run the exact router-call pattern wire (c) uses (with the captured
  // identifier already substituted). If stripping is intact, no match.
  const routerCallPattern = /router\.(?:push|replace)\(\s*\(?[^)]*\broute\b/
  assert.equal(
    routerCallPattern.test(stripped),
    false,
    'stripComments must blank a line whose first non-whitespace chars are `//`, so a commented-out router.push does not silently satisfy wire (c). If this fails, wire (c) is toothless against comment-out drift.',
  )
})

test('self-check: stripComments blanks a line-commented null-guard, so wire (d) would fail on drift', () => {
  const broken = [
    'function navigateForNotification(response) {',
    "  const route = routeForNotificationData(data, { bpsEnabled: true });",
    "  // router.push((route ?? '/Home') as never);",
    '  router.push(route as never);',
    '}',
  ].join('\n')
  const stripped = stripComments(broken)
  // Re-run wire (d)'s nullish-coalesce probe. The bare `router.push(route)`
  // line has no `??`, so if the comment is truly gone, no guard matches.
  const nullishCoalesce = /\broute\s*\?\?\s*['"]/
  const orDefault = /\broute\s*\|\|\s*['"]/
  const ternary = /\broute\s*\?\s*[\s\S]{0,200}?:\s*/
  const explicitFalsy = /if\s*\(\s*!\s*route\b|if\s*\(\s*route\s*==\s*null/
  const guarded =
    nullishCoalesce.test(stripped) ||
    orDefault.test(stripped) ||
    ternary.test(stripped) ||
    explicitFalsy.test(stripped)
  assert.equal(
    guarded,
    false,
    'stripComments must blank a commented-out null-guard so wire (d) does not falsely see a guard on the comment. If this fails, wire (d) cannot detect the exact drift chunk 98 v2 is hardened against.',
  )
})

test('self-check: stripComments handles a multi-line /* ... */ block containing "//"', () => {
  const src = [
    '/*',
    " * // router.push((route ?? '/Home') as never);",
    ' */',
    'const route = routeForNotificationData(data, { bpsEnabled: true });',
    'someOtherCall(route);',
  ].join('\n')
  const stripped = stripComments(src)
  // Block-commented router.push must not survive.
  assert.equal(
    /router\.push/.test(stripped),
    false,
    'stripComments must blank lines inside a /* ... */ block even when they contain `//` — the naive line-strip-then-block-strip order swap in v1 could split the block early.',
  )
  // Real code below the block must survive.
  assert.match(
    stripped,
    /routeForNotificationData/,
    'stripComments must NOT clobber real code lines below a closed block comment',
  )
})

test("self-check: stripComments leaves a trailing `//` inside a string literal alone", () => {
  const src = [
    "const url = 'https://example.com/path';",
    'someCall(url);',
  ].join('\n')
  const stripped = stripComments(src)
  // The naive `/\/\/[^\n]*/g` strip would eat `//example.com/path';` here.
  // Our line-based strip only blanks lines whose first non-whitespace is
  // `//`; a URL inside a string literal is code and must survive verbatim.
  assert.match(
    stripped,
    /https:\/\/example\.com\/path/,
    'stripComments must leave `//` inside a string literal untouched — a URL is not a comment.',
  )
})

test('self-check: region-based (e) test fails when the cold-start invocation is removed', () => {
  // Synthesize the two-effect shape without the cold-start
  // navigateForNotification(...) call. Region slicer + regex must NOT
  // find a match in the cold-start region.
  const brokenSrc = [
    'export function useNotifications() {',
    '  const lastResponse = Notifications.useLastNotificationResponse();',
    '  useEffect(() => {',
    '    if (!lastResponse) return;',
    '    // cold-start invocation intentionally removed to prove the trap',
    '  }, [lastResponse]);',
    '  useEffect(() => {',
    '    Notifications.addNotificationResponseReceivedListener((response) => {',
    '      navigateForNotification(response);',
    '    });',
    '  }, []);',
    '}',
    'function navigateForNotification(response) {}',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const csRegion = sliceColdStartRegion(stripped)
  assert.notEqual(csRegion, '', 'self-check setup: cold-start region slicer must locate a region in the synthetic source')
  assert.equal(
    /navigateForNotification\s*\(/.test(csRegion),
    false,
    'region-based test (e) must NOT match when the cold-start invocation is deleted. If this fails, the region slicer has spilled into the warm-tap region and test (e) is again unable to detect the exact drop-one-invocation regression that chunk 98 v1 missed.',
  )
  // Sanity: the warm-tap region STILL sees its invocation — proves the
  // slicer isolates the two paths rather than blanking everything.
  const wtRegion = sliceWarmTapRegion(stripped)
  assert.match(
    wtRegion,
    /navigateForNotification\s*\(/,
    'self-check sanity: warm-tap region must still contain its invocation in the synthetic source',
  )
})

test('self-check: region-based (e) test fails when the warm-tap invocation is removed', () => {
  const brokenSrc = [
    'export function useNotifications() {',
    '  const lastResponse = Notifications.useLastNotificationResponse();',
    '  useEffect(() => {',
    '    if (!lastResponse) return;',
    '    navigateForNotification(lastResponse);',
    '  }, [lastResponse]);',
    '  useEffect(() => {',
    '    Notifications.addNotificationResponseReceivedListener((response) => {',
    '      // warm-tap invocation intentionally removed to prove the trap',
    '    });',
    '  }, []);',
    '}',
    'function navigateForNotification(response) {}',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const wtRegion = sliceWarmTapRegion(stripped)
  assert.notEqual(wtRegion, '', 'self-check setup: warm-tap region slicer must locate a region in the synthetic source')
  assert.equal(
    /navigateForNotification\s*\(/.test(wtRegion),
    false,
    'region-based test (e) must NOT match when the warm-tap invocation is deleted. If this fails, wire (e) can no longer catch a dropped warm-tap invocation — the exact regression chunk 98 v1 missed.',
  )
  // Sanity: cold-start region STILL sees its invocation.
  const csRegion = sliceColdStartRegion(stripped)
  assert.match(
    csRegion,
    /navigateForNotification\s*\(/,
    'self-check sanity: cold-start region must still contain its invocation in the synthetic source',
  )
})
