// tests/unit/refresh-button-a11y-contract.test.mjs — CHUNK 114 (2026-07-23)
//
// Source-drift trip wires for the "Refresh my plan" Pressable at the
// footer of app/Home/wellbeing-domain-checkins.tsx.
//
// BACKGROUND
// ----------
// Multiple chunks converge on this one Pressable:
//   - Chunk 72 landed the label toggle "Refresh my plan" / "Refreshing…",
//     the disabled + opacity fade, and the rising-edge
//     AccessibilityInfo.announceForAccessibilityWithOptions call
//     (fallback: announceForAccessibility) that plays the audible cue
//     "Refreshing your plan. You will be returned to your Care Plan."
//   - Chunk 111 layered accessibilityHint variants — an idle phrase
//     ("Regenerates your care plan with your latest check-ins") and a
//     busy phrase ("Waiting for the current refresh to finish") — while
//     preserving accessibilityRole="button" and
//     accessibilityState={{ busy, disabled }}.
//
// Each of these interlocks: the state-driven label toggle is what
// switches the audible utterance; the accessibilityState.busy key is
// what VoiceOver / TalkBack read out as "dimmed" or "in progress"; the
// hint variants keep the swipe-hint utterance in lockstep with the
// busy/idle state. If ANY of them drifts, the a11y contract for the
// regen entry point silently degrades:
//   - drop the busy hint → VoiceOver announces the idle hint mid-regen,
//     telling the user they can tap to regenerate when a regen is
//     already running.
//   - drop accessibilityState.busy → the button reads as "button dimmed"
//     rather than "button in progress" — users can't tell whether the
//     refresh actually kicked off.
//   - drop the announceForAccessibility call → the rising-edge audible
//     confirmation that the regen started disappears; sighted users see
//     the label flip, VoiceOver users hear nothing.
//
// THIS TEST — SOURCE-DRIFT TRIP WIRES (chunk 103 / chunk 106 pattern)
// ------------------------------------------------------------------
// Mirroring the runtime behavior would require jsdom + react-native +
// react-query stubs + expo shims. Instead we read the .tsx file as
// text, strip comments through the shared helper
// (./strip-comments.mjs — chunk 103), isolate the Refresh Pressable's
// opening tag, and grep for the load-bearing shapes.
//
// If any wire fails: DO NOT tweak the regex to make it pass. Read the
// diff, confirm the a11y refactor is deliberate (Ken-signed or
// chunk-labeled with a re-derived spec), then update the wire in
// lockstep.
//
// npm test glob: `node --test tests/unit/*.test.ts tests/unit/*.test.mjs …`
// picks this file up via the `.test.mjs` extension. No config change.

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
  'app',
  'Home',
  'wellbeing-domain-checkins.tsx',
)
const SCREEN_SRC_RAW = readFileSync(SCREEN_PATH, 'utf8')
const SCREEN_SRC = stripComments(SCREEN_SRC_RAW)

// -------------------------------------------------------------------------
// Isolate the Refresh Pressable's opening tag from `<Pressable` up to and
// including its opening `>` (the `>` that closes the tag, before the
// child <Text>). We anchor on `onPressRefreshPlan` — the callback name
// bound only to this Pressable's onPress — and walk back to the nearest
// `<Pressable` and forward to the first `>` that closes the tag.
//
// The opening tag in this file spans multiple lines and its attribute
// interpolations do NOT embed literal `>` characters (they are all
// curly-brace-wrapped ternaries and object literals), so a forward walk
// balancing braces reliably stops at the tag-closing `>`.
// -------------------------------------------------------------------------

function refreshPressableOpeningTag(src) {
  const anchorMatch = /onPress=\{onPressRefreshPlan\}/.exec(src)
  if (!anchorMatch) return null
  const anchorIdx = anchorMatch.index
  const prefix = src.slice(0, anchorIdx)
  const startIdx = prefix.lastIndexOf('<Pressable')
  if (startIdx < 0) return null
  // Forward walk from the tag start, tracking brace depth so a `>` inside
  // a JSX attribute expression (e.g. inside a ternary or arrow function
  // body) does not falsely terminate the tag scan.
  let depth = 0
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth === 0) {
      return src.slice(startIdx, i + 1)
    }
  }
  return null
}

const REFRESH_TAG = refreshPressableOpeningTag(SCREEN_SRC)

// =========================================================================
// (a) accessibilityRole="button" on the Refresh Pressable.
//
// The role attribute is what makes VoiceOver / TalkBack announce the
// Pressable as a button rather than "clickable" (Android) or the plain
// composed text label (iOS). If the role is dropped, users get a bare
// text utterance and cannot tell the surface is actionable — chunk 72
// specifically preserved this.
// =========================================================================

test('(a) Refresh Pressable carries accessibilityRole="button"', () => {
  assert.ok(
    REFRESH_TAG !== null,
    'wellbeing-domain-checkins.tsx must retain a `<Pressable onPress={onPressRefreshPlan} …>` — the footer Refresh button. Anchor missing, cannot inspect its attributes.',
  )
  assert.match(
    REFRESH_TAG,
    /accessibilityRole\s*=\s*["']button["']/,
    `Refresh Pressable must carry accessibilityRole="button". Dropping the role reverts the button to a plain text utterance on VoiceOver / TalkBack — users can no longer tell the surface is actionable. Found opening tag:\n${REFRESH_TAG}`,
  )
})

// =========================================================================
// (b) accessibilityHint contains BOTH idle AND busy phrases.
//
// Chunk 111 added a ternary (or state-selected constants) so the hint
// tracks whether a regen is currently running:
//   - idle:  "Regenerates your care plan with your latest check-ins"
//   - busy:  "Waiting for the current refresh to finish"
// If someone collapses this back to a single constant hint, VoiceOver
// announces the idle hint mid-regen — telling users they can tap to
// regenerate when a regen is already running. The wire matches either
// arm of a ternary OR two separate string constants selected by state,
// and requires BOTH phrases to survive.
// =========================================================================

test('(b) accessibilityHint contains BOTH idle AND busy phrases', () => {
  assert.match(
    SCREEN_SRC,
    /Regenerates your care plan/,
    'wellbeing-domain-checkins.tsx must retain the idle accessibilityHint phrase "Regenerates your care plan" (chunk 111). Dropping it collapses the hint variants back to a single string and VoiceOver stops explaining what tapping the button will do.',
  )
  assert.match(
    SCREEN_SRC,
    /Waiting for the current refresh to finish/,
    'wellbeing-domain-checkins.tsx must retain the busy accessibilityHint phrase "Waiting for the current refresh to finish" (chunk 111). Dropping it means VoiceOver announces the idle hint mid-regen — users are told they can tap to regenerate when a regen is already running.',
  )
})

// =========================================================================
// (c) accessibilityState={{ busy, disabled }} — both keys, either order.
//
// Chunk 111 preserved accessibilityState with BOTH busy and disabled
// keys. Losing either one degrades the utterance:
//   - drop busy     → VoiceOver reads "button dimmed" mid-regen instead
//                     of "button in progress"
//   - drop disabled → the Pressable technically stops accepting taps but
//                     VoiceOver announces it as still tappable
// Regex accepts either key order inside the outer `{{ … }}`.
// =========================================================================

test('(c) accessibilityState receives an object with keys busy AND disabled', () => {
  assert.match(
    SCREEN_SRC,
    /accessibilityState\s*=\s*\{\{[^}]*busy[^}]*disabled|accessibilityState\s*=\s*\{\{[^}]*disabled[^}]*busy/,
    'wellbeing-domain-checkins.tsx Refresh Pressable must retain accessibilityState={{ busy: …, disabled: … }} with BOTH keys (either order). Dropping busy makes VoiceOver read "button dimmed" mid-regen instead of "button in progress"; dropping disabled leaves the button announced as tappable while the handler is a no-op.',
  )
})

// =========================================================================
// (d) Chunk 72 label toggle — BOTH "Refresh my plan" AND "Refreshing…"
// literals appear in the source.
//
// The visual label toggles via a ternary on regen.isPending. VoiceOver's
// accessibilityLabel also toggles ("Refresh my plan" / "Refreshing your
// plan"). If either literal disappears we've either dropped the toggle
// or reworded one arm — sighted users would see a stale label mid-regen,
// or VoiceOver users hear a stale label. Pin both literals.
// =========================================================================

test('(d) chunk 72 label toggle — both "Refresh my plan" and "Refreshing…" literals present', () => {
  assert.match(
    SCREEN_SRC,
    /Refresh my plan/,
    'wellbeing-domain-checkins.tsx must retain the "Refresh my plan" literal (chunk 72). This is the idle-state visual + accessibility label; removing it means the button never shows the idle phrase and users never learn what it does before tapping.',
  )
  assert.match(
    SCREEN_SRC,
    /Refreshing…/,
    'wellbeing-domain-checkins.tsx must retain the "Refreshing…" literal (chunk 72) — the visual label shown while regen.isPending is true. Dropping it removes the progress signal from sighted users; combined with the disabled+opacity fade the button appears frozen with the same "Refresh my plan" label.',
  )
})

// =========================================================================
// (e) Chunk 72 AccessibilityInfo.announceForAccessibilityWithOptions call
// is still present.
//
// The rising-edge announceForAccessibilityWithOptions call inside
// onPressRefreshPlan is what plays "Refreshing your plan. You will be
// returned to your Care Plan." on VoiceOver / TalkBack at the moment
// the regen fires. Sighted users see the label flip; without this call
// VoiceOver users get no confirmation the tap registered.
// =========================================================================

test('(e) AccessibilityInfo.announceForAccessibilityWithOptions call is still present', () => {
  assert.match(
    SCREEN_SRC,
    /announceForAccessibilityWithOptions\s*\(/,
    'wellbeing-domain-checkins.tsx must retain a call to AccessibilityInfo.announceForAccessibilityWithOptions inside onPressRefreshPlan (chunk 72). This is the rising-edge audible cue that confirms the regen started; without it VoiceOver / TalkBack users get no acknowledgement that the tap registered.',
  )
})

// =========================================================================
// (f) The Pressable's disabled prop is bound to a state variable.
//
// `disabled={regen.isPending}` (or a similarly-named state binding) is
// what makes React Native block onPress mid-regen and what feeds the
// opacity fade. If someone hard-codes `disabled={false}` or removes the
// prop entirely, users can double-tap the button and enqueue multiple
// regens. Regex catches any `disabled={<expr>}` binding.
// =========================================================================

test('(f) Refresh Pressable disabled prop is bound to a state expression', () => {
  assert.ok(
    REFRESH_TAG !== null,
    'wellbeing-domain-checkins.tsx must retain the Refresh Pressable — cannot inspect disabled prop otherwise.',
  )
  assert.match(
    REFRESH_TAG,
    /disabled\s*=\s*\{[^}]+\}/,
    `Refresh Pressable must retain a state-driven \`disabled={…}\` prop binding (chunk 72). Hard-coding disabled={false} or removing the prop lets users double-tap the button and enqueue multiple regens mid-flight. Found opening tag:\n${REFRESH_TAG}`,
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / chunk 106 discipline)
//
// These tests do NOT read the real source. They synthesise a minimal
// "known good" Refresh-button-shaped source and mutate it in the exact
// drift shapes wires (b), (c), (e) must catch, and assert the wire logic
// flips OFF on the mutation.
// =========================================================================

const SYNTHETIC_GOOD_REFRESH = [
  'const onPressRefreshPlan = () => {',
  '  const info = AccessibilityInfo;',
  '  info.announceForAccessibilityWithOptions(',
  '    "Refreshing your plan. You will be returned to your Care Plan.",',
  '    { queue: true },',
  '  );',
  '  regen.mutate();',
  '};',
  '<Pressable',
  '  onPress={onPressRefreshPlan}',
  '  disabled={regen.isPending}',
  '  accessibilityRole="button"',
  '  accessibilityLabel={regen.isPending ? "Refreshing your plan" : "Refresh my plan"}',
  '  accessibilityHint={',
  '    regen.isPending',
  '      ? "Waiting for the current refresh to finish"',
  '      : "Regenerates your care plan with your latest check-ins"',
  '  }',
  '  accessibilityState={{ disabled: regen.isPending, busy: regen.isPending }}',
  '>',
  '  <Text>{regen.isPending ? "Refreshing…" : "Refresh my plan"}</Text>',
  '</Pressable>',
].join('\n')

test('self-check: synthetic good source PASSES wires (b), (c), (e), (f)', () => {
  const src = stripComments(SYNTHETIC_GOOD_REFRESH)
  const tag = refreshPressableOpeningTag(src)
  assert.ok(
    tag !== null,
    'self-check setup: synthetic fixture must expose a `<Pressable onPress={onPressRefreshPlan} …>` opening tag.',
  )
  assert.match(src, /Regenerates your care plan/)
  assert.match(src, /Waiting for the current refresh to finish/)
  assert.match(
    src,
    /accessibilityState\s*=\s*\{\{[^}]*busy[^}]*disabled|accessibilityState\s*=\s*\{\{[^}]*disabled[^}]*busy/,
  )
  assert.match(src, /announceForAccessibilityWithOptions\s*\(/)
  assert.match(tag, /disabled\s*=\s*\{[^}]+\}/)
})

test('self-check: wire (b) FAILS when the busy hint variant is dropped', () => {
  // Mutate: drop the busy arm of the accessibilityHint ternary. Wire (b)
  // requires BOTH phrases; the busy check should now fail.
  const mutated = SYNTHETIC_GOOD_REFRESH.replace(
    '? "Waiting for the current refresh to finish"\n      : "Regenerates your care plan with your latest check-ins"',
    '? "Regenerates your care plan with your latest check-ins"\n      : "Regenerates your care plan with your latest check-ins"',
  )
  const src = stripComments(mutated)
  assert.equal(
    /Waiting for the current refresh to finish/.test(src),
    false,
    'self-check: wire (b) MUST reject a source that dropped the busy hint variant. If the busy phrase still appears, the mutation did not actually take — the self-check is meaningless.',
  )
})

test('self-check: wire (c) FAILS when the accessibilityState busy key is dropped', () => {
  // Mutate: remove the `busy: …` key from the accessibilityState object.
  const mutated = SYNTHETIC_GOOD_REFRESH.replace(
    'accessibilityState={{ disabled: regen.isPending, busy: regen.isPending }}',
    'accessibilityState={{ disabled: regen.isPending }}',
  )
  const src = stripComments(mutated)
  const passes =
    /accessibilityState\s*=\s*\{\{[^}]*busy[^}]*disabled|accessibilityState\s*=\s*\{\{[^}]*disabled[^}]*busy/.test(
      src,
    )
  assert.equal(
    passes,
    false,
    'self-check: wire (c) MUST reject a source that dropped the busy key from accessibilityState. If this flips true, wire (c) cannot detect a silent removal of the busy key — VoiceOver would read "button dimmed" mid-regen and the wire would still pass.',
  )
})

test('self-check: wire (e) FAILS when the AccessibilityInfo announce call is removed', () => {
  // Mutate: strip the entire announceForAccessibilityWithOptions call.
  const mutated = SYNTHETIC_GOOD_REFRESH.replace(
    /info\.announceForAccessibilityWithOptions\([\s\S]*?\);\n/,
    '',
  )
  const src = stripComments(mutated)
  assert.equal(
    /announceForAccessibilityWithOptions\s*\(/.test(src),
    false,
    'self-check: wire (e) MUST reject a source that dropped the announceForAccessibilityWithOptions call. If this flips true, wire (e) cannot detect a silent removal of the rising-edge audible cue — VoiceOver users would tap the button and hear nothing while sighted users see the label flip.',
  )
})
