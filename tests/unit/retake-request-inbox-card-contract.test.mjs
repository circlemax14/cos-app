// tests/unit/retake-request-inbox-card-contract.test.mjs — COS-482 Phase 1 (2026-07-24)
//
// Source-drift trip wires for
//   components/health-plan/retake-request/RetakeRequestInboxCard.tsx
// The card is the patient-facing surface a CM / super-admin reaches to
// nudge a retake. Regressions on the shape below silently break the
// nudge OR (worse) leak the CM's freeform note into the wrong surface,
// so the wires below hard-fail on a source diff that walks off the
// approved shape.
//
// APPROACH — chunk 106 / chunk 103 pattern (source-drift trip wire):
// mirroring the runtime behavior would require jsdom + react-native +
// expo shims + react-query. Instead we read the .tsx as text, strip
// comments through the shared helper (./strip-comments.mjs), and grep
// for the load-bearing shapes that guarantee the Phase 1 contract
// cannot silently regress.
//
// If any assertion fires: DO NOT edit the regex. Read the diff on
// RetakeRequestInboxCard.tsx, confirm the change is deliberate
// (Ken-signed OR chunk-labeled with a re-derived contract), and only
// then update the wire in lockstep.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const CARD_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'retake-request',
  'RetakeRequestInboxCard.tsx',
)

const raw = readFileSync(CARD_PATH, 'utf8')
const src = stripComments(raw)

// ── iOS 26.5 primitive envelope ─────────────────────────────────────────
// Only View / Text / Pressable / StyleSheet / MaterialIcons may render
// on this card. Modal / Animated / Reanimated / bottom-sheet libs are
// the documented SIGABRT class on iOS 26.5 — see
// components/unified-plan/v2/net.ts + memory/project_ios26_biopsychosocial_parked.

test('inbox card does NOT import Modal or Animated from react-native', () => {
  // Match a react-native import block and pull the imported symbols.
  const m = src.match(/from ['"]react-native['"]/g)
  assert.ok(m && m.length >= 1, 'expected a react-native import')
  // Look for either symbol as a named import token.
  assert.ok(!/\bModal\b/.test(src), 'Modal must NEVER be imported on this card (iOS 26.5 SIGABRT class)')
  assert.ok(!/\bAnimated\b/.test(src), 'Animated must NEVER be imported on this card (iOS 26.5 SIGABRT class)')
})

test('inbox card does NOT import react-native-reanimated, gesture-handler, or bottom-sheet libs', () => {
  assert.ok(!/react-native-reanimated/.test(src), 'reanimated is banned on iOS 26.5 surfaces')
  assert.ok(!/react-native-gesture-handler/.test(src), 'gesture-handler is banned on iOS 26.5 surfaces')
  assert.ok(!/bottom-sheet/i.test(src), 'bottom-sheet libraries are banned — use a full sheet screen instead')
  // react-native-paper renders Portal/Modal internally — banned on this
  // card. (The rest of the app uses paper where safe; this SPECIFIC
  // card cannot.)
  assert.ok(!/from ['"]react-native-paper['"]/.test(src), 'react-native-paper is banned on this iOS 26.5 card')
})

// ── Silent-drop pattern (never render empty chrome) ─────────────────────
test('inbox card silent-drops when no pending row exists (returns null)', () => {
  // The `if (!first) return null` guard MUST exist so we never render
  // a card with no content. Regex forgives whitespace variance.
  assert.match(src, /if\s*\(\s*!\s*first\s*\)\s*return\s+null/)
})

// ── Deep links ─────────────────────────────────────────────────────────
test('Start now deep-links to /Home/assessment-stepper for non-intake keys', () => {
  // The route path is composed with a template literal (backtick), so we
  // just grep for the path literal — any surrounding quote style is fine.
  assert.match(
    src,
    /\/Home\/assessment-stepper\?instrumentId=/,
    'Start-now must route to the shared assessment stepper with instrumentId param',
  )
})

test('Start now deep-links to /Home/patient-intake for the full-intake key', () => {
  assert.match(
    src,
    /\/Home\/patient-intake/,
    'full-intake key must route to the patient intake wizard',
  )
})

test('Not now deep-links to /Home/retake-snooze-sheet with the id query param', () => {
  assert.match(
    src,
    /\/Home\/retake-snooze-sheet\?id=/,
    'Not-now must route to the pushed sheet screen with the request id',
  )
})

// ── A11y contract ──────────────────────────────────────────────────────
test('inbox card composes a single accessibilityLabel on the outer view', () => {
  // The composed label is what a screen reader announces — must exist,
  // and the composer function is the pinned utterance shape.
  assert.match(src, /accessibilityLabel=\{a11yLabel\}/)
  assert.match(src, /composeRetakeCardAccessibilityLabel/)
})

test('Start now button carries accessibilityRole="button" + a composed accessibilityLabel', () => {
  // Look for the specific pressable's a11y pair.
  assert.match(src, /accessibilityLabel=\{`Start \$\{first\.instrumentDisplayName\} now`\}/)
})

test('Not now button carries accessibilityRole="button" + a composed accessibilityLabel', () => {
  assert.match(src, /accessibilityLabel="Not now — choose to snooze or dismiss"/)
})

test('inner detail Text nodes are hidden from a11y so the composed label reads once', () => {
  // Every inner grouping must carry importantForAccessibility="no-hide-descendants"
  // so VoiceOver / TalkBack does not walk each Text node individually.
  const hits = (src.match(/importantForAccessibility="no-hide-descendants"/g) ?? []).length
  assert.ok(hits >= 3, `expected >=3 no-hide-descendants inner groupings, found ${hits}`)
})

// ── PII discipline ─────────────────────────────────────────────────────
test('inbox card does NOT read email or last name from the row shape', () => {
  // The row type intentionally omits email + last name for the patient
  // view. A grep for those tokens defends against a future accidental
  // field addition that would leak PII into the card.
  assert.ok(!/\.email\b/.test(src), 'row.email must never be rendered on this card')
  assert.ok(!/lastName\b/.test(src), 'lastName must never be rendered on this card')
})
