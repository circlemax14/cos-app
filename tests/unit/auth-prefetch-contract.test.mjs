// tests/unit/auth-prefetch-contract.test.mjs — CHUNK 95 (2026-07-23)
//
// Pins the CONTRACT that services/auth-prefetch.ts's post-auth parallel
// prefetch must keep warming the ['feature-flags'] react-query entry so
// hooks/use-notifications.ts's `isBpsEligibleCached()` predicate (chunk
// 64, pinned by chunk 91's use-notifications-bps-eligible.test.mjs) can
// read a populated answer on cold-start push-tap.
//
// Cold-start regression path this test guards against:
//   1. Killed-app cold start (no cached feature-flags).
//   2. User taps a MEDICATION_REFILL_REMINDER from the OS shelf.
//   3. App boots → auth gate clears → prefetchAfterAuth() fires.
//   4. Before /v1/feature-flags settles, navigateForNotification reads
//      isBpsEligibleCached() and — if the prefetch entry for
//      ['feature-flags'] was silently deleted — always sees an empty
//      cache → strict === true guard fails → routes to legacy
//      /Home/health-plan instead of /Home/biopsychosocial-plan.
//   5. Silent regression: BPS-eligible users get the legacy surface on
//      every cold-start push tap. Chunk 64's whole purpose defeated.
//
// WHY SOURCE-DRIFT TRIP WIRES ONLY (no behavioral mirror):
//   services/auth-prefetch.ts is a NETWORK-SIDE-EFFECT COORDINATOR, not
//   a pure formula. Its behavior is Promise.allSettled([...prefetchQuery
//   calls, ...raw network calls]) that pull from queryClient, apiClient,
//   fetchPatientInfo, listServerCalendarEvents, buildAndUploadSnapshot,
//   resolveCategoryGate, reconcilePlanTaskNotifications, expo modules,
//   etc. Mirroring the behavior in pure JS would require re-implementing
//   or mocking a dozen imports — the mirror would then only prove the
//   mirror mirrors itself, not that the real module still prefetches
//   feature-flags.
//
//   The chunk 84 v2 pattern (mirror + trip wires) applies to pure
//   formulas (assessment-bands, wellbeing-derivation, isBpsEligibleCached
//   predicate). This module is fundamentally coordinated I/O — the
//   correct discipline is source-drift trip wires alone, exactly as this
//   chunk's task calls out: SKIP the behavioral mirror, keep the text
//   invariants.
//
//   If any trip wire fails, DO NOT edit the regex to make it pass. Read
//   the diff on services/auth-prefetch.ts, confirm the source change is
//   intentional (feature-flags really moved to a different warmer, the
//   exported function really got renamed, etc.), and only then update
//   the trip wire.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob already
// present in package.json (chunk 84 v2 normalized that pattern).
// No config changes required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const AUTH_PREFETCH_TS_PATH = join(REPO_ROOT, 'services', 'auth-prefetch.ts')
const AUTH_PREFETCH_TS_SRC = readFileSync(AUTH_PREFETCH_TS_PATH, 'utf8')

// =========================================================================
// (a) Source is readable and non-empty.
//
// Cheap sanity gate — if the file was deleted or moved, every downstream
// assertion below would emit a confusing regex-miss error. Fail loud and
// early instead.
// =========================================================================

test('(a) services/auth-prefetch.ts source is readable and non-trivial', () => {
  assert.ok(
    AUTH_PREFETCH_TS_SRC.length > 200,
    'services/auth-prefetch.ts must exist and contain the post-auth prefetch coordinator — a deletion silently regresses cold-start push routing to the legacy path',
  )
})

// =========================================================================
// (b) The ['feature-flags'] query key literal appears in a prefetchQuery
//     call.
//
// THIS is the load-bearing invariant. If someone removes the
// prefetchQuery({ queryKey: ['feature-flags'], ... }) block, the
// cold-start push-tap path silently regresses: isBpsEligibleCached()
// reads an empty cache, strict === true guard fails, every BPS-eligible
// user routes to the legacy /Home/health-plan on cold-start med-refill
// taps. The regression is invisible to unit tests below this file
// (chunk 91's mirror still passes; the predicate is fine — the CACHE
// is what's cold). This trip wire is the only signal.
//
// The regex tolerates whitespace / newlines between prefetchQuery and
// queryKey so a formatter reflow doesn't false-trip; it does NOT accept
// the key literal appearing anywhere else in the file (e.g. in a
// comment) without being wired into a prefetchQuery call.
// =========================================================================

test('(b) prefetchQuery for [\'feature-flags\'] is present — cold-start push routing depends on it', () => {
  // Match: `prefetchQuery({ ... queryKey: ['feature-flags'] ... })`
  // with any whitespace/newlines and any surrounding options.
  // [\s\S] because JS regex `.` doesn't cross newlines and this call
  // spans multiple lines in the source.
  assert.match(
    AUTH_PREFETCH_TS_SRC,
    /prefetchQuery\s*\(\s*\{[\s\S]*?queryKey\s*:\s*\[\s*['"]feature-flags['"]\s*,?\s*\][\s\S]*?\}\s*\)/,
    "services/auth-prefetch.ts must contain a prefetchQuery({ queryKey: ['feature-flags'], ... }) call — removing it regresses cold-start push routing (isBpsEligibleCached sees an empty cache, every BPS-eligible user falls through to legacy /Home/health-plan on med-refill cold-start taps)",
  )
})

test("(b) the literal 'feature-flags' string appears (belt-and-braces with (b) above)", () => {
  // Redundant with the structural regex above by design: if a future
  // refactor swaps queryKey for a variable (`const KEY = ['feature-flags']`),
  // the structural regex might miss it but this literal grep still
  // catches the load-bearing string. Either signal firing means: check
  // the source diff before dismissing.
  assert.ok(
    AUTH_PREFETCH_TS_SRC.includes("'feature-flags'") ||
      AUTH_PREFETCH_TS_SRC.includes('"feature-flags"'),
    "the literal 'feature-flags' string must appear somewhere in services/auth-prefetch.ts — it's the query key isBpsEligibleCached() reads",
  )
})

// =========================================================================
// (c) The module still exports the prefetch function under its current
//     name (`prefetchAfterAuth`).
//
// Renaming the export without updating call sites (app/(auth)/pin.tsx,
// splash-gate, sign-in success handler, etc.) would produce a compile
// error at the call site — but if the rename is done via search-and-
// replace across the whole repo, the compile passes and the runtime
// behavior is unchanged EXCEPT that any external documentation, this
// test, and any lingering reference (e.g. a hot-reload cached bundler
// import) become stale. Pin the name so a rename shows up as a
// deliberate contract update, not an incidental refactor.
// =========================================================================

test('(c) services/auth-prefetch.ts exports `prefetchAfterAuth` under that exact name', () => {
  // Match: `export function prefetchAfterAuth(` — the current export
  // shape. Tolerate `async` and any return-type annotation. Requires
  // the `function` keyword form because that's how the module declares
  // it today; if a future refactor moves to `export const prefetchAfterAuth = ...`
  // we want the failing test to force a conscious decision.
  assert.match(
    AUTH_PREFETCH_TS_SRC,
    /export\s+(?:async\s+)?function\s+prefetchAfterAuth\s*\(/,
    'services/auth-prefetch.ts must export a function named `prefetchAfterAuth` — call sites (post-sign-in, PIN unlock, splash-gate) import this exact name; a rename decouples the warmer from its callers',
  )
})

test('(c) `resetPrefetchCooldown` is still exported (test-affordance contract)', () => {
  // The resetPrefetchCooldown helper is used by tests (and by explicit
  // re-prime paths) to bypass the 30-second cooldown. If it disappears,
  // any test that needs to re-run prefetchAfterAuth within 30s of an
  // earlier call will silently no-op. Not load-bearing for prod, but
  // load-bearing for the test surface — pin it alongside the primary
  // export so both moves are visible.
  assert.match(
    AUTH_PREFETCH_TS_SRC,
    /export\s+(?:async\s+)?function\s+resetPrefetchCooldown\s*\(/,
    'services/auth-prefetch.ts must still export resetPrefetchCooldown — removing it breaks test isolation across back-to-back prefetch runs',
  )
})

// =========================================================================
// (d) Loose lower bound on prefetch entries.
//
// The Promise.allSettled([...]) array today contains 6 prefetchQuery
// calls (patient-info, feature-flags, medications-summary, plan-tasks,
// self-reported-metrics-progress, appointments) plus a handful of raw
// network-call warmers. A LOWER BOUND of 5 means:
//   - adding new prefetch entries never trips this (upper-open).
//   - removing feature-flags alone drops the count to 5 which still
//     passes here — but (b) above catches that specifically.
//   - removing multiple prefetch entries (e.g. someone rips out the
//     whole warmer) drops below 5 and this trip wire fires as a
//     secondary signal.
//
// The point isn't to enumerate every entry — that's what (b) does for
// feature-flags. The point is to notice if the whole prefetch coordinator
// gets accidentally stubbed out (e.g. someone leaves `void
// Promise.allSettled([])` after a botched rebase) while individual grep
// checks still coincidentally pass.
// =========================================================================

test('(d) at least 5 prefetchQuery entries remain in services/auth-prefetch.ts', () => {
  const matches = AUTH_PREFETCH_TS_SRC.match(/prefetchQuery\s*\(/g) ?? []
  assert.ok(
    matches.length >= 5,
    `expected at least 5 prefetchQuery(...) call sites in services/auth-prefetch.ts, found ${matches.length}. This is a loose lower bound designed to notice if the whole warmer got accidentally stubbed out (e.g. Promise.allSettled([]) after a botched rebase). Removing individual entries is fine as long as feature-flags stays (see (b)) and at least 5 total remain.`,
  )
})

// =========================================================================
// (e) The queryClient.prefetchQuery calls actually sit inside a
//     Promise.allSettled — the fire-and-forget parallelism is what makes
//     the warmer effective. If someone unwraps them into sequential
//     awaits, the cold-start warm race changes character (feature-flags
//     might not settle before the first tap) and the whole reason chunk
//     64 lives in this module is undone.
// =========================================================================

test('(e) prefetch fan-out uses Promise.allSettled (parallel fire-and-forget)', () => {
  assert.match(
    AUTH_PREFETCH_TS_SRC,
    /Promise\.allSettled\s*\(\s*\[/,
    'services/auth-prefetch.ts must fan out its warmers via Promise.allSettled([...]) — sequential awaits would change the cold-start race window and reintroduce the exact regression chunk 64 fixed',
  )
})
