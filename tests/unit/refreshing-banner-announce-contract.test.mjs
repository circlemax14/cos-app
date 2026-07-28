// tests/unit/refreshing-banner-announce-contract.test.mjs — CHUNK 122 (2026-07-23)
//
// Source-drift trip wires for the async-regen VoiceOver / TalkBack
// announcement contract in
// components/health-plan/BiopsychosocialPlanScreen.tsx.
//
// BACKGROUND
// ----------
// Chunk 86 v1 landed a "Refreshing your plan..." wrapper View with
// accessibilityRole="alert" + accessibilityLiveRegion="polite" +
// accessible={isRegenPending}. 3-lens verify caught silent-failure modes
// those props alone cannot cover:
//   1) accessibilityLiveRegion is Android-only in RN 0.83 — no-op on iOS.
//   2) accessibilityRole="alert" only announces on MOUNT; the wrapper is
//      kept mounted (idle = collapsed style) so iOS never re-announces
//      on the rising edge.
//   3) Android live-region announces added descendants but NOT removals,
//      so the regen-END transition is silent on BOTH platforms.
//
// Chunk 86 v2 fixed this by adding a useRef+useEffect edge detector that
// fires explicit AccessibilityInfo.announceForAccessibility calls on both
// edges — the ONE cross-platform primitive that announces unconditionally
// on iOS VoiceOver and Android TalkBack:
//   - false → true:  "Refreshing your plan"
//   - true  → false: "Plan refreshed"
// The v1 wrapper props are retained as complementary annotations
// (additive on Android, harmless on iOS).
//
// If any of the following drift:
//   - useEffect edge detector is dropped or replaced with a toast
//   - AccessibilityInfo.announceForAccessibility call is removed
//   - the phrase strings are reworded
//   - the wrapper's accessibilityRole="alert" or
//     accessibilityLiveRegion="polite" annotations are dropped
// then VoiceOver / TalkBack users lose the async-regen feedback that
// chunk 86 v2 shipped to fix.
//
// THIS TEST — SOURCE-DRIFT TRIP WIRES (chunk 103 / chunk 106 / chunk 114
// pattern) — reads BiopsychosocialPlanScreen.tsx as text, strips comments
// through the shared helper (./strip-comments.mjs — chunk 103) so a
// commented-out reference cannot spoof a wire, and greps for the
// load-bearing shapes.
//
// If any wire fails: DO NOT tweak the regex to make it pass. Read the
// diff, confirm the a11y refactor is deliberate (Ken-signed or
// chunk-labeled with a re-derived spec), then update the wire in
// lockstep.
//
// npm test glob: `node --test tests/unit/*.test.ts tests/unit/*.test.mjs
// lib/*.test.mjs` picks this file up via the `.test.mjs` extension. No
// config change required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const SCREEN_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BiopsychosocialPlanScreen.tsx',
)
const SCREEN_SRC_RAW = readFileSync(SCREEN_PATH, 'utf8')
const SCREEN_SRC = stripComments(SCREEN_SRC_RAW)

// =========================================================================
// (a) AccessibilityInfo import from 'react-native' is present.
//
// The edge-detector effect calls AccessibilityInfo.announceForAccessibility
// as a value from react-native. If someone tree-shakes or refactors the
// react-native import block and drops AccessibilityInfo, the effect
// crashes at runtime — but a compile passes because a `TypeError:
// undefined is not a function` only fires when the regen actually flips.
// Pin that AccessibilityInfo is listed among the react-native named
// imports.
// =========================================================================

test('(a) AccessibilityInfo is imported from react-native', () => {
  assert.match(
    SCREEN_SRC,
    /import[\s\S]*?\bAccessibilityInfo\b[\s\S]*?from\s+['"]react-native['"]/,
    'BiopsychosocialPlanScreen.tsx must import AccessibilityInfo from "react-native" — chunk 86 v2 depends on it for the rising/falling edge announcement calls. If this drops, the effect throws "undefined is not a function" the moment isRegenPending flips, and VoiceOver / TalkBack users lose the async-regen feedback entirely.',
  )
})

// =========================================================================
// (b) At least one AccessibilityInfo.announceForAccessibility call is
// present.
//
// This is the ONE cross-platform primitive chunk 86 v2 uses to announce
// on BOTH edges. If someone swaps it for a toast, a Sentry event, or an
// AccessibilityInfo.announceForAccessibilityWithOptions call (options
// variant behaves differently on Android and is used in chunk 72's tap
// handler — NOT what chunk 86 v2 shipped for the edge detector), the
// audible feedback disappears. Wire pins the exact method name.
// =========================================================================

test('(b) AccessibilityInfo.announceForAccessibility call is still present', () => {
  assert.match(
    SCREEN_SRC,
    /AccessibilityInfo\.announceForAccessibility\s*\(/,
    'BiopsychosocialPlanScreen.tsx must retain at least one AccessibilityInfo.announceForAccessibility(...) call (chunk 86 v2 rising/falling edge detector). If this disappears — replaced by a toast, Sentry event, or removed outright — VoiceOver / TalkBack users lose the async-regen audible cue that chunk 86 v2 shipped to fix the iOS live-region no-op and the Android removal-silence gap.',
  )
})

// =========================================================================
// (c) The literal "Refreshing your plan" appears — chunk 86 v2's exact
// rising-edge phrase.
//
// This phrase is the false → true edge utterance the effect fires. If it
// gets reworded ("Regenerating plan", "Refreshing…", etc.), VoiceOver /
// TalkBack users hear a stale or unfamiliar phrase inconsistent with the
// sighted-user banner ("Refreshing your plan..."). Pin the verbatim
// string chunk 86 v2 shipped.
// =========================================================================

test('(c) rising-edge phrase "Refreshing your plan" is present verbatim', () => {
  assert.match(
    SCREEN_SRC,
    /Refreshing your plan/,
    'BiopsychosocialPlanScreen.tsx must retain the literal "Refreshing your plan" (chunk 86 v2 rising-edge phrase). Rewording this arm breaks parity with the sighted-user banner text and drops the exact utterance chunk 86 v2 shipped as the async-regen a11y contract.',
  )
})

// =========================================================================
// (d) The literal "Plan refreshed" appears — chunk 86 v2's exact
// falling-edge phrase.
//
// This phrase is the true → false edge utterance the effect fires. It
// is the ONLY signal (on both platforms) that the regen completed for
// VoiceOver / TalkBack users — Android's live-region announces added
// descendants but not removals, so the banner going away is silent
// without this explicit announce. Pin the verbatim string.
// =========================================================================

test('(d) falling-edge phrase "Plan refreshed" is present verbatim', () => {
  assert.match(
    SCREEN_SRC,
    /Plan refreshed/,
    'BiopsychosocialPlanScreen.tsx must retain the literal "Plan refreshed" (chunk 86 v2 falling-edge phrase). Dropping or rewording this arm makes the regen-END transition silent on BOTH iOS and Android — Android live-region announces added descendants but not removals, so the banner going away is inaudible without this explicit announce.',
  )
})

// =========================================================================
// (e) A useRef or useState pattern for prev-isRegenPending edge detection
// is present.
//
// Chunk 86 v2 uses `React.useRef(isRegenPending)` to remember the
// previous value between renders so the effect can distinguish a rising
// edge from a falling edge (and skip render 0). If someone collapses the
// effect down to `useEffect(() => announce(...), [isRegenPending])`
// without the ref, BOTH edges fire on every render including mount —
// VoiceOver announces "Plan refreshed" at mount when nothing was ever
// refreshing. Wire looks for useRef or useState in proximity to
// isRegenPending (within ~200 chars).
// =========================================================================

test('(e) useRef or useState prev-isRegenPending edge detector is present', () => {
  const RANGE = 200
  const anchorRe = /isRegenPending/g
  const refRe = /\b(useRef|useState)\b/
  let match
  let found = false
  while ((match = anchorRe.exec(SCREEN_SRC)) !== null) {
    const start = Math.max(0, match.index - RANGE)
    const end = Math.min(SCREEN_SRC.length, match.index + RANGE)
    const window = SCREEN_SRC.slice(start, end)
    if (refRe.test(window)) {
      found = true
      break
    }
  }
  assert.ok(
    found,
    'BiopsychosocialPlanScreen.tsx must retain a useRef- or useState-backed prev-isRegenPending edge detector in close proximity to `isRegenPending` (chunk 86 v2 pattern: `const prevIsRegenPendingRef = React.useRef(isRegenPending)`). Without it the effect cannot distinguish rising from falling edges — VoiceOver announces "Plan refreshed" at mount when nothing was ever refreshing, and every render risks a spurious utterance.',
  )
})

// =========================================================================
// (f) The wrapper View retains accessibilityRole="alert" AND
// accessibilityLiveRegion="polite" — chunk 86 v1 complementary
// annotations.
//
// These are additive on Android (live-region reinforces the effect-fired
// announce when descendants change) and harmless on iOS. Chunk 86 v2's
// spec is EXPLICIT that the v1 props stay in place; dropping them
// regresses the Android complement path. Both must survive.
// =========================================================================

test('(f) wrapper View retains accessibilityRole="alert" AND accessibilityLiveRegion="polite"', () => {
  assert.match(
    SCREEN_SRC,
    /accessibilityRole\s*=\s*["']alert["']/,
    'BiopsychosocialPlanScreen.tsx must retain accessibilityRole="alert" on the "Refreshing your plan..." wrapper View (chunk 86 v1 complementary annotation retained by chunk 86 v2). Dropping it regresses the Android live-region announce-on-mount path that reinforces the effect-fired utterance.',
  )
  assert.match(
    SCREEN_SRC,
    /accessibilityLiveRegion\s*=\s*["']polite["']/,
    'BiopsychosocialPlanScreen.tsx must retain accessibilityLiveRegion="polite" on the wrapper View (chunk 86 v1 complementary annotation retained by chunk 86 v2). Dropping it removes the Android-only live-region signal that reinforces the effect-fired announce when the banner\'s text descendants change.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / chunk 106 / chunk 114 discipline)
//
// These tests do NOT read the real source. They synthesise a minimal
// "known good" chunk-86-v2-shaped source and mutate it in three drift
// shapes wires (c), (a), (f) must catch, and assert the wire logic flips
// OFF on the mutation.
// =========================================================================

const SYNTHETIC_GOOD = [
  "import React from 'react';",
  "import { AccessibilityInfo, View, Text } from 'react-native';",
  '',
  'export function BpsScreen({ isRegenPending }) {',
  '  const prevIsRegenPendingRef = React.useRef(isRegenPending);',
  '  React.useEffect(() => {',
  '    const prev = prevIsRegenPendingRef.current;',
  '    if (!prev && isRegenPending) {',
  "      AccessibilityInfo.announceForAccessibility('Refreshing your plan');",
  '    } else if (prev && !isRegenPending) {',
  "      AccessibilityInfo.announceForAccessibility('Plan refreshed');",
  '    }',
  '    prevIsRegenPendingRef.current = isRegenPending;',
  '  }, [isRegenPending]);',
  '  return (',
  '    <View',
  '      accessible={isRegenPending}',
  '      accessibilityRole="alert"',
  '      accessibilityLiveRegion="polite"',
  '    >',
  '      {isRegenPending && <Text>Refreshing your plan...</Text>}',
  '    </View>',
  '  );',
  '}',
].join('\n')

test('self-check: synthetic good source PASSES wires (a)-(f)', () => {
  const src = stripComments(SYNTHETIC_GOOD)
  assert.match(
    src,
    /import[\s\S]*?\bAccessibilityInfo\b[\s\S]*?from\s+['"]react-native['"]/,
  )
  assert.match(src, /AccessibilityInfo\.announceForAccessibility\s*\(/)
  assert.match(src, /Refreshing your plan/)
  assert.match(src, /Plan refreshed/)
  assert.match(src, /accessibilityRole\s*=\s*["']alert["']/)
  assert.match(src, /accessibilityLiveRegion\s*=\s*["']polite["']/)
  // Edge-detector proximity check mirrors wire (e).
  const RANGE = 200
  const anchorRe = /isRegenPending/g
  const refRe = /\b(useRef|useState)\b/
  let match
  let found = false
  while ((match = anchorRe.exec(src)) !== null) {
    const start = Math.max(0, match.index - RANGE)
    const end = Math.min(src.length, match.index + RANGE)
    if (refRe.test(src.slice(start, end))) {
      found = true
      break
    }
  }
  assert.ok(found, 'self-check setup: synthetic good must expose the edge detector')
})

test('self-check: wire (c) FAILS when "Refreshing your plan" is renamed to "Refreshing plan"', () => {
  // Mutate: rename the rising-edge phrase. Wire (c) requires the exact
  // "Refreshing your plan" literal.
  const mutated = SYNTHETIC_GOOD.replace(
    "'Refreshing your plan'",
    "'Refreshing plan'",
  ).replace('Refreshing your plan...', 'Refreshing plan...')
  const src = stripComments(mutated)
  assert.equal(
    /Refreshing your plan/.test(src),
    false,
    'self-check: wire (c) MUST reject a source that renamed "Refreshing your plan" to "Refreshing plan". If this flips true, wire (c) cannot detect a phrase-drift refactor and VoiceOver users would hear a stale utterance while the wire keeps passing.',
  )
})

test('self-check: wire (a) FAILS when the AccessibilityInfo import is dropped', () => {
  // Mutate: strip AccessibilityInfo from the react-native import list.
  const mutated = SYNTHETIC_GOOD.replace(
    "import { AccessibilityInfo, View, Text } from 'react-native';",
    "import { View, Text } from 'react-native';",
  )
  const src = stripComments(mutated)
  assert.equal(
    /import[\s\S]*?\bAccessibilityInfo\b[\s\S]*?from\s+['"]react-native['"]/.test(
      src,
    ),
    false,
    'self-check: wire (a) MUST reject a source that dropped AccessibilityInfo from the react-native import. If this flips true, wire (a) cannot detect the drift and the effect would throw at runtime the moment isRegenPending flips.',
  )
})

test('self-check: wire (f) FAILS when accessibilityLiveRegion="polite" is dropped', () => {
  // Mutate: remove accessibilityLiveRegion="polite" from the wrapper.
  const mutated = SYNTHETIC_GOOD.replace(
    '      accessibilityLiveRegion="polite"\n',
    '',
  )
  const src = stripComments(mutated)
  assert.equal(
    /accessibilityLiveRegion\s*=\s*["']polite["']/.test(src),
    false,
    'self-check: wire (f) MUST reject a source that dropped accessibilityLiveRegion="polite". If this flips true, wire (f) cannot detect the drift and the Android live-region reinforcement path silently regresses.',
  )
})
