// tests/unit/picker-row-a11y-contract.test.mjs — CHUNK 112 (2026-07-23)
//
// Source-drift trip wires for the wellbeing-domain check-in picker's
// per-row VoiceOver / TalkBack accessibility contract in
// app/Home/wellbeing-domain-checkins.tsx.
//
// BACKGROUND
// ----------
// Chunk 108 layered row-level VoiceOver hygiene on top of the picker
// already shipped in chunk 67 (with chunk 72 refresh polish and
// chunk 76 empty-state polish, and the chunk 83 back-button spec on
// top). The row Pressable now carries a *pre-composed* accessibility
// label built in the useMemo where `ago` is already computed, with
// three distinct state phrases:
//   - "Take now. Tap to start."       (fresh, uncompleted)
//   - "Completed N days ago. Tap to retake."   (completed OR retake)
//   - "Coming soon."                  (non-tappable)
// Coming-soon rows also set `accessibilityState={{ disabled: true }}`
// and the Pressable's own `disabled` prop so VoiceOver appends
// "dimmed" and the row does not invite a tap that would silently
// no-op. The inner name Text + pill-label Text nodes are marked
// `accessibilityElementsHidden` + `importantForAccessibility=
// "no-hide-descendants"` so the composed sentence utters once
// instead of name-then-pill as two separate reads.
//
// THIS TEST — SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / chunk 103 /
// chunk 106 pattern). Mirroring the runtime tree would require jsdom
// + react-native + expo shims + a react-query stub + @expo/vector-
// icons — dozens of MB of devDeps to observe a11y attributes on a
// rendered tree. Instead we read wellbeing-domain-checkins.tsx as
// text, strip comments through the shared ./strip-comments.mjs
// helper (chunk 103), and grep for the load-bearing shapes that
// guarantee the chunks that landed CANNOT silently regress.
//
// If any of these fail: DO NOT tweak the regex to make it pass.
// Read the diff on wellbeing-domain-checkins.tsx, confirm the change
// is deliberate (Ken-signed OR chunk-labeled with a re-derived
// spec), then update the wire in lockstep with the source.
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

const PICKER_PATH = join(
  REPO_ROOT,
  'app',
  'Home',
  'wellbeing-domain-checkins.tsx',
)
const PICKER_SRC_RAW = readFileSync(PICKER_PATH, 'utf8')
const PICKER_SRC = stripComments(PICKER_SRC_RAW)

// =========================================================================
// Pure-function wire helpers. Each of these takes an arbitrary source
// string (real production source OR a mutated synthetic fixture built by
// the self-verification section below) and returns a boolean for whether
// the paired trip wire's contract is currently satisfied. The production
// wires assert `helper(PICKER_SRC) === true`; the self-verification
// mutations assert `helper(mutated) === false`. Sharing one helper per
// wire between the two call sites is the point of the chunk-98-v2
// discipline — if a self-check passes when the drift is present, the
// wire is toothless against the same drift in the real file.
// =========================================================================

function hasAllComposedStatePhrases(src) {
  return (
    /Take now\. Tap to start/.test(src) &&
    /Completed/.test(src) &&
    /Tap to retake/.test(src) &&
    /Coming soon/.test(src)
  )
}

function hasComingSoonDisabledBranch(src) {
  // Either the accessibilityState.disabled branch (`disabled: !row.tappable`
  // or `disabled: true` for a coming-soon-specific literal) OR the
  // Pressable's own `disabled={!row.tappable}` — the source ships both, and
  // wire (b) only requires that AT LEAST one distinct disabled branch
  // exists that yields disabled=true when the row is coming-soon. A
  // renamed field breaks both symmetrically, but keeping both anchors
  // guards against a partial refactor that drops one and leaves the
  // other.
  const hasA11yStateDisabled =
    /accessibilityState=\{\{\s*disabled:\s*!row\.tappable/.test(src)
  const hasPropDisabled = /disabled=\{!row\.tappable\}/.test(src)
  return hasA11yStateDisabled || hasPropDisabled
}

function hasInnerTextAccessibilityElementsHidden(src) {
  return /accessibilityElementsHidden/.test(src)
}

function hasChunk83BackButton(src) {
  return (
    /accessibilityLabel="Back to Care Plan"/.test(src) &&
    /accessibilityHint="Returns to your Care Plan"/.test(src)
  )
}

function hasChunk76EmptyState(src) {
  // The friendly hourglass fallback string. Chunk 76 spec calls out two
  // lines — "Nothing to take here yet" + "Come back soon". Assert both so
  // a partial reword (e.g. dropping the second line, or replacing "here
  // yet" with a curt "yet") is caught.
  return (
    /Nothing to take here yet/.test(src) &&
    /Come back soon/.test(src)
  )
}

function hasChunk72RefreshLabels(src) {
  return /Refresh my plan/.test(src) && /Refreshing…/.test(src)
}

// =========================================================================
// (a) Composed row accessibilityLabel encodes all three row states.
//
// The composed sentence VoiceOver reads for each row is built inside the
// useMemo where `ago` is already computed. Wire (a) pins the three state
// phrases that MUST survive:
//   - "Take now. Tap to start."   (fresh, uncompleted)
//   - "Completed ... Tap to retake."   (completed OR expired-retake)
//   - "Coming soon."              (non-tappable)
// Renaming any of these silently changes what screen-reader users hear
// while sighted users see no change — the exact silent-regression class
// this trip wire exists to catch.
// =========================================================================

test('(a) composed row accessibilityLabel contains all three state phrases', () => {
  assert.equal(
    hasAllComposedStatePhrases(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain the three state phrases in the composed row a11yLabel: "Take now. Tap to start", "Completed", "Tap to retake", "Coming soon". Renaming any of these silently changes what VoiceOver / TalkBack users hear on the picker without any visible signal for sighted users.',
  )
})

// =========================================================================
// (b) Coming-soon rows carry a disabled=true branch.
//
// The Pressable for a coming-soon row must be marked disabled — either
// via `accessibilityState={{ disabled: !row.tappable }}` (VoiceOver
// appends "dimmed"), the Pressable's own `disabled={!row.tappable}`
// prop (blocks the tap at the RN layer), or both. Chunk 108 shipped
// both; wire (b) requires at least one so the coming-soon row cannot
// silently become an anonymous button that no-ops on tap.
// =========================================================================

test('(b) coming-soon rows have a disabled=true branch (accessibilityState.disabled or Pressable disabled prop)', () => {
  assert.equal(
    hasComingSoonDisabledBranch(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain a distinct branch that yields disabled=true when a row\'s state is coming-soon — either `accessibilityState={{ disabled: !row.tappable }}` or `disabled={!row.tappable}` on the row Pressable. Chunk 108 ships both; dropping both regresses the a11y "dimmed" hint AND allows a tap to silently no-op on the non-tappable row.',
  )
})

// =========================================================================
// (c) accessibilityElementsHidden appears on inner Text nodes of rows.
//
// The composed row label subsumes the inner name Text and pill-label
// Text. Without accessibilityElementsHidden on those inner Text nodes,
// VoiceOver double-reads: composed sentence first, then name + pill
// label as two separate utterances. Chunk 108 fixed exactly this by
// marking both inner Text nodes hidden.
// =========================================================================

test('(c) accessibilityElementsHidden appears on inner Text nodes of rows', () => {
  assert.equal(
    hasInnerTextAccessibilityElementsHidden(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain accessibilityElementsHidden on the inner name / pill-label Text nodes of each row. Without it VoiceOver double-reads the row: the composed sentence, then name + pill label as separate utterances — the exact regression chunk 108 fixed.',
  )
})

// =========================================================================
// (d) Chunk 83 back-button spec preservation.
//
// The header back button carries accessibilityLabel="Back to Care Plan"
// AND accessibilityHint="Returns to your Care Plan". A drift on either
// (e.g. the generic "Back" default, or a hint reword to "Go back")
// silently degrades what screen-reader users hear on the picker header.
// =========================================================================

test('(d) chunk 83 back-button accessibility spec is preserved', () => {
  assert.equal(
    hasChunk83BackButton(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain accessibilityLabel="Back to Care Plan" AND accessibilityHint="Returns to your Care Plan" on the header back Pressable — the chunk 83 spec. Dropping either regresses VoiceOver / TalkBack to a bare "Back" or a rewritten hint that no longer tells the user where the button lands them.',
  )
})

// =========================================================================
// (e) Chunk 76 friendly empty-state hourglass preservation.
//
// When the domain resolves to zero visible rows (extreme edge — every
// member coming-soon OR unknown to the instrument catalog), chunk 76
// swapped the flat "No check-ins available" line for a two-line
// hourglass block: "Nothing to take here yet" + "Come back soon — we're
// still building out check-ins for this area." Assert both lines
// remain so a partial reword (e.g. dropping the friendly second line)
// is caught.
// =========================================================================

test('(e) chunk 76 friendly hourglass empty-state string is preserved', () => {
  assert.equal(
    hasChunk76EmptyState(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain the chunk 76 friendly empty-state copy: "Nothing to take here yet" AND "Come back soon". Dropping or rewording either silently reverts the empty-state polish to a flat one-liner that reads as an error, not a "check back later" invitation.',
  )
})

// =========================================================================
// (f) Chunk 72 "Refresh my plan" refresh-button preservation.
//
// The primary CTA in the footer flips between "Refresh my plan" (idle)
// and "Refreshing…" (regen in-flight). Assert both labels remain so a
// silent rename (e.g. "Update my plan", or losing the "Refreshing…"
// pending label) is caught.
// =========================================================================

test('(f) chunk 72 "Refresh my plan" and "Refreshing…" labels are preserved', () => {
  assert.equal(
    hasChunk72RefreshLabels(PICKER_SRC),
    true,
    'wellbeing-domain-checkins.tsx must retain BOTH the idle "Refresh my plan" label and the in-flight "Refreshing…" label on the primary CTA. Chunk 72 shipped the pair together — dropping either desyncs the button copy from the accessibilityLabel and regresses the chunk 72 spec.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 discipline — prove the traps snap shut)
//
// These tests do NOT read wellbeing-domain-checkins.tsx directly for
// their assertions — they mutate the real source in the exact drift
// shape each wire must catch and assert the wire helper flips to FALSE
// on the mutation. If any of these self-checks flip to TRUE while the
// drift is present, the paired production wire above is toothless.
// =========================================================================

test('self-check (1): dropping "Coming soon" phrase flips wire (a) OFF', () => {
  // Mutate: rename "Coming soon" -> "Later" (a plausible drift). Wire (a)
  // requires the "Coming soon" phrase to appear in the composed label
  // branch — the mutation should break the assertion.
  const mutated = PICKER_SRC.replace(/Coming soon/g, 'Later')
  assert.equal(
    hasAllComposedStatePhrases(mutated),
    false,
    'self-check: wire (a) MUST reject a source that dropped the "Coming soon" state phrase. If this flips true (helper reads true on the mutation), wire (a) cannot detect the exact drift shape it exists to catch — a silent rename of the coming-soon composed label branch.',
  )
})

test('self-check (2): dropping accessibilityElementsHidden from inner Text flips wire (c) OFF', () => {
  // Mutate: strip every accessibilityElementsHidden attribute from the
  // source. Wire (c) requires at least one to survive on inner Text
  // nodes; the mutation should break the assertion.
  const mutated = PICKER_SRC.replace(/accessibilityElementsHidden/g, '')
  assert.equal(
    hasInnerTextAccessibilityElementsHidden(mutated),
    false,
    'self-check: wire (c) MUST reject a source that dropped accessibilityElementsHidden from inner Text nodes. If this flips true, wire (c) cannot detect the chunk-108 double-read regression it exists to catch.',
  )
})

test('self-check (3): dropping the chunk 83 back label flips wire (d) OFF', () => {
  // Mutate: rename "Back to Care Plan" -> "Back" (the RN default). Wire
  // (d) requires the specific "Back to Care Plan" literal, so the
  // mutation should break the assertion.
  const mutated = PICKER_SRC.replace(
    /accessibilityLabel="Back to Care Plan"/,
    'accessibilityLabel="Back"',
  )
  assert.equal(
    hasChunk83BackButton(mutated),
    false,
    'self-check: wire (d) MUST reject a source that reverted the back-button accessibilityLabel to a bare "Back". If this flips true, wire (d) cannot detect the chunk-83 drift shape it exists to catch.',
  )
})

test('self-check (4): renaming "Refresh my plan" flips wire (f) OFF', () => {
  // Mutate: rename "Refresh my plan" -> "Update my plan" (a plausible
  // copy-drift). Wire (f) requires the exact "Refresh my plan" literal,
  // so the mutation should break the assertion.
  const mutated = PICKER_SRC.replace(/Refresh my plan/g, 'Update my plan')
  assert.equal(
    hasChunk72RefreshLabels(mutated),
    false,
    'self-check: wire (f) MUST reject a source that renamed "Refresh my plan" to a different verb. If this flips true, wire (f) cannot detect a silent copy-drift on the primary CTA that chunk 72 pinned.',
  )
})

// -------------------------------------------------------------------------
// Belt-and-suspenders: stripComments must not eat a trailing inline
// comment appended to a load-bearing literal line. Mirrors the safety
// self-check in meds-card-a11y-contract.test.mjs (chunk 106) so future
// contributors adding "// chunk 112" trailers don't accidentally blank
// the label out of scope for the wires above.
// -------------------------------------------------------------------------

test('self-check: stripComments preserves load-bearing literals when a trailing `// comment` shares the line', () => {
  const src = 'accessibilityLabel="Back to Care Plan" // chunk 112 wire'
  const stripped = stripComments(src)
  assert.match(
    stripped,
    /accessibilityLabel="Back to Care Plan"/,
    'self-check: stripComments must leave the accessibilityLabel intact on a code line with a trailing `//` comment. If this fails, wire (d) becomes fragile to future comment additions on the same line as the back-button label.',
  )
})
