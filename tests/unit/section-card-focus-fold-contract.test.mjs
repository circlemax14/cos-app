// tests/unit/section-card-focus-fold-contract.test.mjs — CHUNK 109 (2026-07-23)
//
// Source-drift trip wires for the CHUNK 90 focus-fold in
// components/health-plan/SectionCard.tsx. Chunk 90 folded the meaning of
// the visual "FOCUS" pill into the SectionCard header's
// accessibilityLabel — so when a SectionCard is the current wellbeing
// focus, VoiceOver reads a single natural utterance
// ("Biological Wellness, Focus area, prioritized this week, heading")
// instead of a title + a bare "FOCUS" glyph. The pill itself is
// hidden from the accessibility tree so it isn't announced twice.
//
// Two orthogonal props hold that contract together:
//   1. Header Text carries accessibilityRole="header" AND an
//      accessibilityLabel that composes in "Focus area, prioritized
//      this week" iff isFocus.
//   2. The pill <View> carries BOTH accessibilityElementsHidden={true}
//      (iOS / VoiceOver) AND importantForAccessibility="no-hide-descendants"
//      (Android / TalkBack) so neither platform re-announces the glyph.
//
// Silent regressions this suite defends against:
//   - Someone removes the header's accessibilityRole → VoiceOver drops
//     the "heading" navigation semantic (users can't rotor-jump).
//   - Someone reverts the header accessibilityLabel to just `title` →
//     the "Focus area, prioritized this week" phrase vanishes with no
//     visible symptom (pill still renders, but a11y meaning is lost).
//   - Someone removes accessibilityElementsHidden from the pill → the
//     "FOCUS" glyph is re-announced as a second read on iOS.
//   - Someone removes importantForAccessibility → same regression on
//     Android/TalkBack.
//   - Someone drops the conditional render → pill leaks onto sections
//     that are NOT the focus target.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunks 84 v2 / 103 / 107 pattern):
//   The contract is a set of static prop bindings inside a React Native
//   JSX subtree. A behavioral mirror would drag in jsdom + RN mocks +
//   @expo/vector-icons stubs + @/constants/design-system + BioGoalCard +
//   TaskListSection + biopsychosocial-plan types — dozens of MB of
//   devDeps to observe a handful of prop strings. Instead we read the
//   .tsx source as text, strip comments via the shared helper (chunk 103),
//   and grep for the literals the chunk-90 contract depends on. Same
//   discipline as:
//     - tests/unit/trends-band-pill-a11y-contract.test.mjs   (chunk 107)
//     - tests/unit/wellbeing-card-a11y-labels.test.mjs        (chunk 103)
//     - tests/unit/notification-tap-handoff.test.mjs          (chunk 98 v2)
//     - tests/unit/tab-bar-a11y-contract.test.mjs
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on SectionCard.tsx, confirm the a11y rewording is
//   deliberate (Ken really wanted a new phrase, or the pill was
//   intentionally re-exposed to the a11y tree), and only then update
//   the trip wire in lockstep.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob already
// present in package.json — no config changes required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const SECTION_CARD_TSX_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'SectionCard.tsx',
)

const SECTION_CARD_TSX_SRC_RAW = readFileSync(SECTION_CARD_TSX_PATH, 'utf8')
const SECTION_CARD_TSX_SRC = stripComments(SECTION_CARD_TSX_SRC_RAW)

// The exact phrase chunk 90 shipped in the isFocus branch of the header
// accessibilityLabel. Kept intentionally identical to the pill's fallback
// accessibilityLabel so if a future change re-exposes the pill (removes
// accessibilityElementsHidden), the VoiceOver copy stays coherent.
const FOCUS_PHRASE = 'Focus area, prioritized this week'

// -------------------------------------------------------------------------
// (a) Header Text has accessibilityRole="header".
//
// Without this role, VoiceOver drops the "heading" semantic — users
// can no longer rotor-jump to section headers, and the composed
// utterance loses its heading tail ("…, heading"). Chunk 90 explicitly
// tagged the header Text with the role for exactly that reason.
// -------------------------------------------------------------------------

test('(a) header Text has accessibilityRole="header"', () => {
  assert.match(
    SECTION_CARD_TSX_SRC,
    /accessibilityRole\s*=\s*["']header["']/,
    'SectionCard.tsx must retain accessibilityRole="header" on the section-title Text (chunk 90). Without it, VoiceOver drops the heading rotor semantic and the composed focus utterance loses its heading tail.',
  )
})

// -------------------------------------------------------------------------
// (b) When isFocus=true, the header accessibilityLabel includes the
//     exact phrase "Focus area, prioritized this week".
//
// The shipped literal in SectionCard.tsx is:
//   accessibilityLabel={isFocus ? `${title}, Focus area, prioritized this week` : title}
//
// The trip wire is intentionally strict on the phrase substring —
// dropping any word ("Focus area" alone, or "prioritized this week"
// alone) would still convey partial meaning but silently regress the
// contract that pins the pill's fallback label to the same string.
// -------------------------------------------------------------------------

test('(b) header accessibilityLabel composes in "Focus area, prioritized this week" on the isFocus branch', () => {
  // Look for the isFocus ternary within an accessibilityLabel binding
  // whose truthy branch is a template literal containing the exact
  // focus phrase. We use a permissive regex so a future refactor that
  // reformats whitespace or renames `title` (e.g. to a fallback chain)
  // still matches, as long as the phrase itself survives.
  const focusBranchPattern = new RegExp(
    // accessibilityLabel = { isFocus ? `...Focus area, prioritized this week...` : ... }
    'accessibilityLabel\\s*=\\s*\\{\\s*isFocus\\s*\\?\\s*`[^`]*' +
      FOCUS_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[^`]*`',
  )
  assert.match(
    SECTION_CARD_TSX_SRC,
    focusBranchPattern,
    `SectionCard.tsx must retain the isFocus-branch accessibilityLabel composing in "${FOCUS_PHRASE}" (chunk 90). Without this exact phrase on the header, VoiceOver falls back to the raw title and users lose the focus-area disambiguation — the pill's own fallback label is pinned to the same string to keep the copy coherent if the pill is ever re-exposed.`,
  )
})

// -------------------------------------------------------------------------
// (c) When isFocus=false, the header accessibilityLabel does NOT
//     contain "Focus area" (the else-branch is the raw title).
//
// The shipped ternary's else-branch is bare `title`. If a refactor
// removed the ternary and unconditionally composed "Focus area" into
// every card's label, non-focus cards would announce "Biological
// Wellness, Focus area, prioritized this week, heading" — a lie
// VoiceOver users can't visually correct. We assert the else-branch
// exists as a bare identifier (no template literal, no "Focus area"
// substring in the fallback).
// -------------------------------------------------------------------------

test('(c) header accessibilityLabel else-branch is the raw title, NOT a composed focus phrase', () => {
  // Extract the isFocus ternary's else-branch. We look for the pattern:
  //   accessibilityLabel={isFocus ? `...` : IDENTIFIER}
  // and assert IDENTIFIER is a bare identifier (no backticks, no
  // "Focus area" substring). This catches a refactor that inadvertently
  // composed the phrase into both branches.
  const elseBranchMatch = SECTION_CARD_TSX_SRC.match(
    /accessibilityLabel\s*=\s*\{\s*isFocus\s*\?\s*`[^`]*`\s*:\s*([^}\s]+)\s*\}/,
  )
  assert.ok(
    elseBranchMatch,
    'SectionCard.tsx must retain the `isFocus ? <focus-template> : <plain-title>` ternary shape on the header accessibilityLabel. If the ternary is gone, non-focus sections may inherit the focus phrase and lie to VoiceOver users.',
  )
  const elseBranch = elseBranchMatch[1]
  assert.equal(
    /Focus area/.test(elseBranch),
    false,
    `SectionCard.tsx header accessibilityLabel else-branch must NOT contain "Focus area" — that phrase belongs only on the isFocus=true branch. Found else-branch: ${JSON.stringify(elseBranch)}.`,
  )
  // The else-branch should be a bare identifier (typically `title`) —
  // no template literal, no string literal. If a future change wants a
  // fallback like `title ?? ''`, that's fine (still no template literal
  // and no "Focus area"), but a template literal on the else side is a
  // yellow flag worth flipping the wire on.
  assert.equal(
    /[`"']/.test(elseBranch),
    false,
    `SectionCard.tsx header accessibilityLabel else-branch must be a bare identifier (typically \`title\`), not a template or string literal. A literal on the else side risks composing focus copy into non-focus sections. Found: ${JSON.stringify(elseBranch)}.`,
  )
})

// -------------------------------------------------------------------------
// (d) FOCUS pill has accessibilityElementsHidden=true (iOS/VoiceOver).
//
// Without this, VoiceOver reads BOTH the header's composed label AND
// the pill's inner "FOCUS" Text — two utterances for one meaning.
// Chunk 90's fold depends on the pill being hidden from the a11y tree.
// -------------------------------------------------------------------------

test('(d) FOCUS pill carries accessibilityElementsHidden={true}', () => {
  // Accept `accessibilityElementsHidden` (implicit true, JSX shorthand),
  // `accessibilityElementsHidden={true}`, or `accessibilityElementsHidden={ true }`.
  // Reject `accessibilityElementsHidden={false}` explicitly.
  const truePattern =
    /accessibilityElementsHidden(?:\s*=\s*\{\s*true\s*\})?(?=[\s/>])/
  assert.match(
    SECTION_CARD_TSX_SRC,
    truePattern,
    'SectionCard.tsx FOCUS pill must retain accessibilityElementsHidden (implicit true or ={true}). Without it, VoiceOver reads the pill\'s inner "FOCUS" glyph as a second utterance after the header\'s composed focus label — the exact double-read chunk 90 was designed to prevent.',
  )
  // Belt + suspenders: assert no `accessibilityElementsHidden={false}`
  // slipped in. A refactor that flipped the boolean would technically
  // match the ={true} regex above if written as `={ true }`, but an
  // explicit `={false}` would compile and silently regress. Grep for it.
  assert.equal(
    /accessibilityElementsHidden\s*=\s*\{\s*false\s*\}/.test(SECTION_CARD_TSX_SRC),
    false,
    'SectionCard.tsx must NOT set accessibilityElementsHidden={false} anywhere — that would re-expose the FOCUS pill to VoiceOver and undo chunk 90.',
  )
})

// -------------------------------------------------------------------------
// (e) FOCUS pill has importantForAccessibility="no-hide-descendants"
//     (Android/TalkBack counterpart of accessibilityElementsHidden).
//
// iOS and Android use different props for the same intent. Chunk 90
// pairs them so both platforms hide the pill uniformly; dropping the
// Android side leaves TalkBack announcing "FOCUS" as a second stop.
// -------------------------------------------------------------------------

test('(e) FOCUS pill carries importantForAccessibility="no-hide-descendants"', () => {
  assert.match(
    SECTION_CARD_TSX_SRC,
    /importantForAccessibility\s*=\s*["']no-hide-descendants["']/,
    'SectionCard.tsx FOCUS pill must retain importantForAccessibility="no-hide-descendants" (the Android counterpart of accessibilityElementsHidden). Without it, TalkBack still announces the "FOCUS" glyph as a second stop after the header\'s composed focus label — chunk 90\'s double-read guard would only work on iOS.',
  )
})

// -------------------------------------------------------------------------
// (f) FOCUS pill renders only when isFocus (conditional render pattern).
//
// The shipped shape is:
//   {isFocus ? ( <View style={styles.focusPill} ...> ... </View> ) : null}
//
// If the conditional is dropped and the pill renders unconditionally,
// EVERY section card would carry a FOCUS badge — flatly false for two
// of the three cards on every render. We assert that a JSX expression
// gates the pill on isFocus AND that a null fallback exists (so the
// pill is genuinely null-when-absent, not just visually hidden — per
// the chunk-60 "no wrapper, no reserved height" comment).
// -------------------------------------------------------------------------

test('(f) FOCUS pill is gated by an `isFocus` conditional render with a null fallback', () => {
  // Look for `{isFocus ? ( <View ... styles.focusPill ...> ... </View> ) : null}`.
  // Permissive to allow either `styles.focusPill` inline or a variable
  // holding the same style, but strict on:
  //   - the `isFocus ?` gate
  //   - the `: null` fallback
  //   - the presence of `focusPill` somewhere between the ? and the :
  //     null (so we know the branch actually renders the pill).
  // We use [\s\S] so the pattern spans newlines (JSX pill body is multiline).
  const conditionalPattern =
    /\{\s*isFocus\s*\?\s*\(\s*<View[\s\S]*?focusPill[\s\S]*?<\/View>\s*\)\s*:\s*null\s*\}/
  assert.match(
    SECTION_CARD_TSX_SRC,
    conditionalPattern,
    'SectionCard.tsx must retain the `{isFocus ? ( <View ...styles.focusPill... /> ) : null}` conditional-render pattern (chunk 60 + 90). Without the gate, EVERY section card would render a FOCUS badge — false for the two non-focus cards on every render. Without the `: null` fallback, the pill wrapper would take reserved height even when absent (violating the chunk-60 "no wrapper, no reserved height" comment).',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 / 107 discipline — prove the trap
// snaps shut).
//
// These tests do NOT read SectionCard.tsx. They exercise the exact
// patterns above against synthetic sources whose SOLE PURPOSE is to
// reproduce the drift shape each wire is meant to catch. If ANY of
// these self-checks flip green when the drift is present, the
// corresponding wire above is toothless.
// =========================================================================

test('self-check: wire (a) fails when accessibilityRole="header" is removed', () => {
  // Synthetic header Text WITHOUT the role prop. Wire (a)'s match
  // assertion must fail against this stripped fixture.
  const brokenSrc = [
    '<Text',
    '  style={{ color: text }}',
    '  numberOfLines={2}',
    // accessibilityRole="header" intentionally removed
    '  accessibilityLabel={isFocus ? `${title}, Focus area, prioritized this week` : title}',
    '>',
    '  {title}',
    '</Text>',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.equal(
    /accessibilityRole\s*=\s*["']header["']/.test(stripped),
    false,
    'self-check: wire (a) must NOT match a source that removed accessibilityRole="header" from the header Text. If this flips true, wire (a) cannot detect the exact rotor-semantic regression it exists to catch.',
  )
})

test('self-check: wire (b) fails when the "Focus area, prioritized this week" phrase is removed from the isFocus branch', () => {
  // Synthetic header Text where the ternary still exists but the
  // truthy branch dropped the FOCUS_PHRASE for a shorter label. Wire
  // (b)'s exact-phrase assertion must fail.
  const brokenSrc = [
    '<Text',
    '  accessibilityRole="header"',
    // Truthy branch reworded — "Focus area, prioritized this week" replaced by "Focus"
    '  accessibilityLabel={isFocus ? `${title}, Focus` : title}',
    '>',
    '  {title}',
    '</Text>',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const focusBranchPattern = new RegExp(
    'accessibilityLabel\\s*=\\s*\\{\\s*isFocus\\s*\\?\\s*`[^`]*' +
      FOCUS_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[^`]*`',
  )
  assert.equal(
    focusBranchPattern.test(stripped),
    false,
    'self-check: wire (b) must NOT match a source whose isFocus-branch label dropped the exact "Focus area, prioritized this week" phrase. If this flips true, wire (b) cannot detect a silent copy regression on the composed focus label.',
  )
})

test('self-check: wire (d) fails when accessibilityElementsHidden is removed from the FOCUS pill', () => {
  // Synthetic FOCUS pill View WITHOUT the accessibilityElementsHidden
  // prop. Wire (d)'s match assertion must fail against this stripped
  // fixture.
  const brokenSrc = [
    '<View',
    '  style={[styles.focusPill]}',
    // accessibilityElementsHidden intentionally removed
    '  importantForAccessibility="no-hide-descendants"',
    '  accessibilityLabel="Focus area, prioritized this week"',
    '>',
    '  <Text>FOCUS</Text>',
    '</View>',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const truePattern =
    /accessibilityElementsHidden(?:\s*=\s*\{\s*true\s*\})?(?=[\s/>])/
  assert.equal(
    truePattern.test(stripped),
    false,
    'self-check: wire (d) must NOT match a source that removed accessibilityElementsHidden from the FOCUS pill. If this flips true, wire (d) cannot detect the exact chunk-90 double-read regression on iOS/VoiceOver it exists to catch.',
  )
})

test('self-check: stripComments removes a commented-out "Focus area" so wire (b) is not tripped by JSDoc', () => {
  // SectionCard.tsx contains a rich JSDoc block that mentions "Focus
  // area" in prose (chunk 60 / 90 comments). If stripComments regressed
  // and stopped removing those lines, wire (b) would falsely pass when
  // the LIVE ternary was reworded but the doc-comment still mentions
  // the phrase. This self-check pins the stripping behavior against
  // the exact shape.
  const src = [
    "// prose: the header now composes 'Focus area, prioritized this week' into the label",
    'accessibilityLabel={isFocus ? `${title}, Focus` : title}',
  ].join('\n')
  const stripped = stripComments(src)
  const focusBranchPattern = new RegExp(
    'accessibilityLabel\\s*=\\s*\\{\\s*isFocus\\s*\\?\\s*`[^`]*' +
      FOCUS_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '[^`]*`',
  )
  assert.equal(
    focusBranchPattern.test(stripped),
    false,
    'self-check: stripComments must remove "Focus area, prioritized this week" when it appears only inside a // comment. If this flips true, wire (b) would false-pass on prose alone even when the live ternary was reworded.',
  )
})
