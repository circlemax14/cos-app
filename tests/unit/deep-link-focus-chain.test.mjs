// tests/unit/deep-link-focus-chain.test.mjs — CHUNK 97 (2026-07-23)
//
// Source-drift trip wires for the ?focus= deep-link chain:
//
//   (i)   hooks/use-notifications.ts  →  lib/notification-routing.ts
//         Push tap for MEDICATION_REFILL_REMINDER + BIOPSYCHOSOCIAL_PLAN_READY
//         builds a URL with ?focus=<value>.
//   (ii)  app/Home/biopsychosocial-plan.tsx
//         Reads useLocalSearchParams<{focus?: string}> and forwards the value
//         as `deepLinkFocus` to <BiopsychosocialPlanScreen ... />.
//   (iii) components/health-plan/BiopsychosocialPlanScreen.tsx (chunk 55/71)
//         Accepts `deepLinkFocus?: string | null` and runs a polling
//         setTimeout + findNodeHandle + scrollTo handler on 'medications'.
//   (iv)  app/Home/assessments-catalog.tsx (chunk 69)
//         Reads useLocalSearchParams<{focus?: string}> and scrolls to the
//         matching bio/psy/soc section.
//
// Any hop can silently break — a rename of `focus` to `target`, dropping the
// `deepLinkFocus={...}` prop forwarding, deleting the polling-scroll
// pattern, or removing the bio/psy/soc handler on the catalog — with zero
// unit-test signal today. Chunk 81's notification-routing tests only pin
// hop (i) (the query string builder). This file pins hops (ii)-(iv) and
// asserts the literal `focus` key is consistent across all 4 files.
//
// PATTERN — CHUNK 84 v2 SOURCE-DRIFT TRIP WIRES ONLY (no behavioral mirror).
//   Mirroring the runtime chain would require jsdom + react-native-testing-
//   library + an Expo Router shim + native ref stubs — 30+MB of devDeps to
//   cover navigation side effects that are extremely hard to replay
//   deterministically (setTimeout polling loops, findNodeHandle on unmounted
//   refs, scrollTo on native ScrollView). Instead we read the actual .tsx
//   source as text and grep for the load-bearing shapes at each hop, same
//   discipline as use-wellbeing-derivation.test.mjs (chunk 84 v2) and
//   assessment-bands.test.mjs (chunks 68/85).
//
//   If any of these fail: DO NOT edit the regex to make it pass. Read the
//   diff on the source file, confirm the change is intentional (Ken-signed
//   OR chunk-labeled), and only then update the trip wire to match the new
//   spec. A green mirror + a broken tap chain is exactly the shape this
//   file is here to prevent.
//
// npm test glob: `node --test tests/unit/*.test.ts tests/unit/*.test.mjs …`
// picks this file up via the .mjs extension.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const BIO_ROUTE_PATH = join(REPO_ROOT, 'app', 'Home', 'biopsychosocial-plan.tsx')
const BIO_SCREEN_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BiopsychosocialPlanScreen.tsx',
)
const CATALOG_PATH = join(REPO_ROOT, 'app', 'Home', 'assessments-catalog.tsx')
const USE_NOTIFICATIONS_PATH = join(REPO_ROOT, 'hooks', 'use-notifications.ts')

const BIO_ROUTE_SRC = readFileSync(BIO_ROUTE_PATH, 'utf8')
const BIO_SCREEN_SRC = readFileSync(BIO_SCREEN_PATH, 'utf8')
const CATALOG_SRC = readFileSync(CATALOG_PATH, 'utf8')
const USE_NOTIFICATIONS_SRC = readFileSync(USE_NOTIFICATIONS_PATH, 'utf8')

// =========================================================================
// (a) app/Home/biopsychosocial-plan.tsx reads ?focus= via useLocalSearchParams
//     AND forwards the value as a `deepLinkFocus` prop to BiopsychosocialPlanScreen.
// =========================================================================

test('(a-i) biopsychosocial-plan.tsx destructures `focus` from useLocalSearchParams', () => {
  // Regex tolerates additional siblings (e.g. `classic`) inside the
  // destructure and any generic-type annotation — the load-bearing shape
  // is: `focus` appears as a destructured key on a useLocalSearchParams()
  // call. A rename of the query param (focus → target) or dropping the
  // read entirely silently breaks hop (ii).
  assert.match(
    BIO_ROUTE_SRC,
    /const\s*\{[^}]*\bfocus\b[^}]*\}\s*=\s*useLocalSearchParams\b/,
    'biopsychosocial-plan.tsx must destructure `focus` from useLocalSearchParams — the child screen needs deepLinkFocus and this route is where the URL param crosses into React state',
  )
})

test('(a-ii) biopsychosocial-plan.tsx forwards `deepLinkFocus` as a prop to <BiopsychosocialPlanScreen>', () => {
  // The prop wire from route parent → screen is the entire point of
  // hop (ii). If this line is deleted, the child's `deepLinkFocus`
  // stays undefined and the polling-scroll effect early-returns
  // forever. Regex allows `deepLinkFocus={deepLinkFocus}` or
  // `deepLinkFocus={focus}` — either shape preserves the wire.
  assert.match(
    BIO_ROUTE_SRC,
    /deepLinkFocus\s*=\s*\{/,
    'biopsychosocial-plan.tsx must pass a `deepLinkFocus={...}` prop to BiopsychosocialPlanScreen — dropping this JSX attribute silently breaks meds-focus and any future bio deep-link value',
  )
  // Belt-and-suspenders: assert the JSX site is inside a
  // <BiopsychosocialPlanScreen …> opening tag. This catches the case
  // where deepLinkFocus= is retained but the component wrapper is
  // renamed or refactored out.
  const screenTagIdx = BIO_ROUTE_SRC.indexOf('<BiopsychosocialPlanScreen')
  assert.notEqual(
    screenTagIdx,
    -1,
    'biopsychosocial-plan.tsx must render <BiopsychosocialPlanScreen> — the deepLinkFocus prop has no consumer otherwise',
  )
  const tagClose = BIO_ROUTE_SRC.indexOf('/>', screenTagIdx)
  const openClose = BIO_ROUTE_SRC.indexOf('>', screenTagIdx)
  const endOfOpenTag =
    tagClose !== -1 && (openClose === -1 || tagClose < openClose)
      ? tagClose
      : openClose
  assert.notEqual(
    endOfOpenTag,
    -1,
    'BiopsychosocialPlanScreen JSX must have a closing bracket',
  )
  const openTagBody = BIO_ROUTE_SRC.slice(screenTagIdx, endOfOpenTag)
  assert.match(
    openTagBody,
    /deepLinkFocus\s*=\s*\{/,
    '`deepLinkFocus={...}` must appear inside the <BiopsychosocialPlanScreen …> opening tag, not on a sibling component',
  )
})

// =========================================================================
// (b) components/health-plan/BiopsychosocialPlanScreen.tsx accepts a
//     `deepLinkFocus` prop AND has a useEffect / handler referencing it.
// =========================================================================

test('(b-i) BiopsychosocialPlanScreen declares a `deepLinkFocus` prop (typed string | null | undefined)', () => {
  // The prop must exist in the component's props signature — either
  // as a destructured parameter (`{ deepLinkFocus, ... }`) OR as a
  // type-level `deepLinkFocus?: string | null` field. Either shape is
  // load-bearing; drop both and the route-parent's prop is silently
  // discarded.
  assert.match(
    BIO_SCREEN_SRC,
    /\bdeepLinkFocus\b/,
    'BiopsychosocialPlanScreen.tsx must reference `deepLinkFocus` somewhere — the prop wire from biopsychosocial-plan.tsx has no receiver otherwise',
  )
  // Stronger: assert the type-level declaration OR the destructured
  // parameter form exists. This catches a stray comment mention while
  // the real prop is deleted.
  const hasTypeDecl = /deepLinkFocus\s*\?\s*:\s*string/.test(BIO_SCREEN_SRC)
  const hasDestructure =
    /\{\s*[^}]*\bdeepLinkFocus\b[^}]*\}\s*(?::|=)/.test(BIO_SCREEN_SRC)
  assert.ok(
    hasTypeDecl || hasDestructure,
    'BiopsychosocialPlanScreen.tsx must declare `deepLinkFocus` as a typed prop or destructured parameter — a bare identifier reference in a comment is not enough',
  )
})

test('(b-ii) BiopsychosocialPlanScreen has a useEffect / handler that references deepLinkFocus', () => {
  // The prop is only meaningful if something acts on it. Look for a
  // useEffect (or React.useEffect) whose body OR dep array mentions
  // `deepLinkFocus`. Regex uses a bounded [\s\S] slice to keep the
  // search local (avoids matching an unrelated effect elsewhere in
  // the file).
  const effectPattern =
    /(?:React\.)?useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,3000}?\bdeepLinkFocus\b[\s\S]{0,3000}?\}\s*,\s*\[[^\]]*\bdeepLinkFocus\b[^\]]*\]/
  assert.match(
    BIO_SCREEN_SRC,
    effectPattern,
    'BiopsychosocialPlanScreen.tsx must have a useEffect whose body AND dependency array reference `deepLinkFocus` — a prop with no effect handler is a silent no-op on push tap',
  )
})

// =========================================================================
// (c) BiopsychosocialPlanScreen contains the chunk-55/71 polling-scroll
//     pattern (setTimeout OR setInterval + findNodeHandle OR scrollTo).
// =========================================================================

test('(c-i) BiopsychosocialPlanScreen has a setTimeout OR setInterval poller (chunk 55/71 pattern)', () => {
  // The medications-focus handler polls for the section ref to attach
  // (Modal + list virtualization means the ref isn't populated on the
  // same tick as mount). setTimeout is the shipped shape; setInterval
  // is an acceptable variant if a future chunk refactors.
  const hasSetTimeout = /\bsetTimeout\s*\(/.test(BIO_SCREEN_SRC)
  const hasSetInterval = /\bsetInterval\s*\(/.test(BIO_SCREEN_SRC)
  assert.ok(
    hasSetTimeout || hasSetInterval,
    'BiopsychosocialPlanScreen.tsx must contain a setTimeout or setInterval poller — the chunk 55/71 deepLinkFocus effect polls for the meds section ref before scrolling; dropping the timer means the scroll never fires when the ref attaches late',
  )
})

test('(c-ii) BiopsychosocialPlanScreen calls findNodeHandle OR scrollTo (the scroll target of the poller)', () => {
  // The poller only matters if it actually scrolls the ScrollView.
  // findNodeHandle is used to resolve the ref → node id for
  // AccessibilityInfo focus; scrollTo is the ScrollView imperative
  // call. Either presence keeps the pattern intact.
  const hasFindNodeHandle = /\bfindNodeHandle\s*\(/.test(BIO_SCREEN_SRC)
  const hasScrollTo = /\.scrollTo\s*\(/.test(BIO_SCREEN_SRC)
  assert.ok(
    hasFindNodeHandle || hasScrollTo,
    'BiopsychosocialPlanScreen.tsx must contain findNodeHandle(...) or .scrollTo(...) — the chunk 55/71 poller needs one of these to actually move the viewport; a bare timer with no scroll target is dead code',
  )
})

test('(c-iii) polling-scroll shapes co-exist in the same file (defense-in-depth against half-refactors)', () => {
  // Even if either half is present alone, we specifically want both
  // in the SAME file (not one in a helper module and one here). This
  // is what makes it the chunk-55/71 pattern rather than an incidental
  // scrollTo somewhere else.
  const hasTimer =
    /\bsetTimeout\s*\(/.test(BIO_SCREEN_SRC) ||
    /\bsetInterval\s*\(/.test(BIO_SCREEN_SRC)
  const hasScrollTarget =
    /\bfindNodeHandle\s*\(/.test(BIO_SCREEN_SRC) ||
    /\.scrollTo\s*\(/.test(BIO_SCREEN_SRC)
  assert.ok(
    hasTimer && hasScrollTarget,
    'BiopsychosocialPlanScreen.tsx must have BOTH a poller (setTimeout|setInterval) AND a scroll target (findNodeHandle|scrollTo) — the pattern only works when the timer fires the scroll',
  )
})

// =========================================================================
// (d) app/Home/assessments-catalog.tsx reads ?focus= via useLocalSearchParams
//     AND handles at least one of 'bio' / 'psy' / 'soc'.
// =========================================================================

test('(d-i) assessments-catalog.tsx destructures `focus` from useLocalSearchParams', () => {
  assert.match(
    CATALOG_SRC,
    /useLocalSearchParams\b[\s\S]{0,300}?\bfocus\b/,
    'assessments-catalog.tsx must read `focus` from useLocalSearchParams — the chunk 69 wellbeing-card tap builds ?focus=bio|psy|soc and lands here',
  )
})

test("(d-ii) assessments-catalog.tsx handles at least one of 'bio' / 'psy' / 'soc' as a focus value", () => {
  // The catalog scrolls to the matching domain section. At minimum one
  // of the three tokens must appear as a string literal in the source
  // (typically all three appear as a union type or a normalize()
  // switch). If NONE appear, the focus handler was silently deleted.
  const bio = /'bio'/.test(CATALOG_SRC) || /"bio"/.test(CATALOG_SRC)
  const psy = /'psy'/.test(CATALOG_SRC) || /"psy"/.test(CATALOG_SRC)
  const soc = /'soc'/.test(CATALOG_SRC) || /"soc"/.test(CATALOG_SRC)
  assert.ok(
    bio || psy || soc,
    "assessments-catalog.tsx must contain at least one string literal 'bio' / 'psy' / 'soc' — hop (iv) of the deep-link chain has no destination otherwise",
  )
  // Belt-and-suspenders: all three are the SHIPPED shape today. Warn
  // hard if any of them is missing, since the wellbeing card can tap
  // any of the three.
  assert.ok(
    bio && psy && soc,
    "assessments-catalog.tsx must handle ALL THREE focus tokens ('bio', 'psy', 'soc') — the wellbeing card focus banner routes any of the three and a missing token silently no-ops that tap",
  )
})

// =========================================================================
// (e) The literal 'focus' query key is consistent across all 4 files.
// =========================================================================

test("(e) literal 'focus' key appears in all four files in the chain", () => {
  // A rename of the query param anywhere along the chain — even to a
  // sibling like `focusArea` or `target` — silently breaks the tap.
  // The upstream builder (lib/notification-routing.ts) is already
  // covered by chunk 81's tests; this file spans the four downstream
  // hops. Simple substring count > 0 per file is enough: any
  // occurrence (comment, string literal, destructure key) means the
  // word has NOT been surgically renamed everywhere.
  const files = [
    ['app/Home/biopsychosocial-plan.tsx', BIO_ROUTE_SRC],
    [
      'components/health-plan/BiopsychosocialPlanScreen.tsx',
      BIO_SCREEN_SRC,
    ],
    ['app/Home/assessments-catalog.tsx', CATALOG_SRC],
    ['hooks/use-notifications.ts', USE_NOTIFICATIONS_SRC],
  ]
  for (const [rel, src] of files) {
    assert.ok(
      /\bfocus\b/.test(src),
      `${rel} must contain the literal 'focus' — a query-param rename must be applied everywhere; a missing token here means the deep-link chain has drifted`,
    )
  }
})

// =========================================================================
// (f) biopsychosocial-plan.tsx preserves ?focus=medications on the legacy
//     redirect path (chunk 64 preservation).
// =========================================================================

test('(f) biopsychosocial-plan.tsx preserves ?focus=medications when redirecting to /Home/health-plan', () => {
  // The chunk 64 adversarial-verify fix: when a BPS-eligible user
  // WITHOUT a bio plan record taps a med-refill push, this route
  // silently redirects to the legacy /Home/health-plan. Without
  // ?focus=medications on the target URL, the legacy meds deep-link
  // handler never fires and the redirect is strictly worse than
  // pre-chunk-64.
  //
  // The shipped shape is a ternary picking
  // '/Home/health-plan?focus=medications' when deepLinkFocus === 'medications'.
  // Regex tolerates surrounding whitespace / string quote style.
  assert.match(
    BIO_ROUTE_SRC,
    /['"`]\/Home\/health-plan\?focus=medications['"`]/,
    "biopsychosocial-plan.tsx must include the literal '/Home/health-plan?focus=medications' as the redirect target when deepLinkFocus is 'medications' — chunk 64 preservation; dropping the query string means BPS-eligible-but-no-plan users land on the legacy Care Plan with NO pre-scroll (strictly worse than pre-chunk-64)",
  )
  // Belt-and-suspenders: assert the redirect is gated on the 'medications'
  // value. A hard-coded ?focus=medications on every redirect would be
  // wrong for future non-meds bio focus values (e.g. plan-ready pushes
  // routed here without a plan record); the check should specifically
  // key off the 'medications' token.
  assert.match(
    BIO_ROUTE_SRC,
    /deepLinkFocus\s*===\s*['"`]medications['"`]/,
    "biopsychosocial-plan.tsx must gate the ?focus=medications preservation on `deepLinkFocus === 'medications'` — a blanket redirect that appends ?focus=medications for every focus value would mis-route future bio deep-links",
  )
})
