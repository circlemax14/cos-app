// tests/unit/meds-card-a11y-contract.test.mjs — CHUNK 106 (2026-07-23)
//
// Source-drift trip wires for the MedicationCard VoiceOver / TalkBack
// accessibility contract in components/health-plan/MedicationsSection.tsx.
//
// BACKGROUND
// ----------
// Chunk 99 v1 landed a11y grouping on the OUTER med-card View — a single
//   <View style={[styles.card, ...]} accessible={true} accessibilityLabel={…}>
// wrapper. On iOS/Android that shape collapses the entire card into ONE AT
// leaf and subsumes every interactive Pressable / Switch inside it. Users on
// VoiceOver / TalkBack could hear the composed sentence but could not swipe
// to Edit, Hide, Track-adherence, Update-supply, or Snooze — the card was
// effectively read-only via assistive tech.
//
// Chunk 99 v2 fixed the swallow by moving accessible={true} onto a NEW
// INNER View that wraps ONLY the passive descriptive block (name / dose+
// frequency / times / badges). Every interactive control stays as a sibling
// of that inner grouping — descendants of the outer card, siblings of the
// inner leaf — so each remains individually swipe-focusable with its own
// accessibilityLabel. The refill banner / supply summary Text nodes /
// Track-adherence visual label Text remain marked
//   accessibilityElementsHidden={true}
//   importantForAccessibility="no-hide-descendants"
// so VoiceOver reads the composed card label ONCE, then walks to each
// interactive control in order.
//
// THIS TEST — SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / chunk 103 pattern)
// --------------------------------------------------------------------
// Mirroring the runtime behavior would require jsdom + react-native + a
// react-query stub + expo shims + @expo/vector-icons — dozens of MB of
// devDeps to observe a11y properties on a rendered tree. Instead we read
// MedicationsSection.tsx as text, strip comments through the shared
// helper (./strip-comments.mjs — chunk 103), and grep for the load-bearing
// shapes that guarantee the chunk-99-v1 blocker cannot come back.
//
// If any of these fail: DO NOT tweak the regex to make it pass. Read the
// diff on MedicationsSection.tsx, confirm the a11y refactor is deliberate
// (Ken-signed OR chunk-labeled with a re-derived label spec), and only
// then update the trip wire in lockstep.
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

const MEDS_SECTION_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'MedicationsSection.tsx',
)
const MEDS_SECTION_SRC_RAW = readFileSync(MEDS_SECTION_PATH, 'utf8')
const MEDS_SECTION_SRC = stripComments(MEDS_SECTION_SRC_RAW)

const BPS_SCREEN_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BiopsychosocialPlanScreen.tsx',
)
const BPS_SCREEN_SRC_RAW = readFileSync(BPS_SCREEN_PATH, 'utf8')
const BPS_SCREEN_SRC = stripComments(BPS_SCREEN_SRC_RAW)

// -------------------------------------------------------------------------
// Shared helper: given a JSX opening tag start pattern (a regex that lands
// somewhere inside the tag's contents), return the substring from the
// enclosing `<View` up to and including the tag's opening `>`. We use this
// to isolate the OUTER card container (identified by `styles.card`) so we
// can inspect its attributes in isolation from the rest of the file.
//
// Note: JSX opening tags in this file don't embed a `>` inside attribute
// interpolations (curly-brace-wrapped expressions are all shaped like
// `{[styles.card, { … }]}` or `{true}` — no `>` characters), so a
// non-greedy `[^>]*` walk from the anchor to the next `>` correctly
// snaps to the tag's own closing angle bracket.
// -------------------------------------------------------------------------

function outerViewOpeningTagContaining(src, anchorRegex) {
  const anchorMatch = anchorRegex.exec(src)
  if (!anchorMatch) return null
  const anchorIdx = anchorMatch.index
  // Walk backward from the anchor to the nearest `<View`. The tag start
  // must precede the anchor, so lastIndexOf on the prefix is sufficient.
  const prefix = src.slice(0, anchorIdx)
  const startIdx = prefix.lastIndexOf('<View')
  if (startIdx < 0) return null
  // Walk forward from the anchor to the nearest `>` — that closes the
  // opening tag (JSX attributes here don't contain literal `>` chars,
  // see helper comment above).
  const suffix = src.slice(anchorIdx)
  const closeRel = suffix.indexOf('>')
  if (closeRel < 0) return null
  return src.slice(startIdx, anchorIdx + closeRel + 1)
}

// =========================================================================
// (a) composeMedA11yLabel helper is defined in MedicationsSection.tsx.
//
// The composed sentence VoiceOver reads for each card is built by this
// helper. If it disappears (inlined, renamed, or moved to a sibling
// module without a re-export), the a11y grouping View still mounts but
// the composed label expression evaluates to a stale identifier — a
// runtime ReferenceError inside JSX. Pin the function definition so a
// silent extract-refactor is loud.
// =========================================================================

test('(a) composeMedA11yLabel helper is defined in MedicationsSection.tsx', () => {
  assert.match(
    MEDS_SECTION_SRC,
    /function\s+composeMedA11yLabel\s*\(/,
    'MedicationsSection.tsx must retain a top-level `function composeMedA11yLabel(...)` definition. This helper is the sole producer of the composed accessibilityLabel bound to the inner grouping View; removing or renaming it silently regresses the chunk-99 VoiceOver contract.',
  )
})

// =========================================================================
// (b) signedDaysUntil helper is defined in MedicationsSection.tsx.
//
// The composed label distinguishes "Refill in 3 days" from "Refill overdue
// by 2 days" using `signedDaysUntil` — a signed-diff variant of the
// visual `daysUntil` (which clamps at 0). If someone deletes it and
// falls back to the clamped `daysUntil`, overdue refills silently start
// announcing "Refill in 0 days" instead of "Refill overdue by N days".
// =========================================================================

test('(b) signedDaysUntil helper is defined in MedicationsSection.tsx', () => {
  assert.match(
    MEDS_SECTION_SRC,
    /function\s+signedDaysUntil\s*\(/,
    'MedicationsSection.tsx must retain a top-level `function signedDaysUntil(...)` definition. This is what preserves the sign for the overdue vs upcoming refill fork inside composeMedA11yLabel — folding it back into the clamped `daysUntil` regresses the "Refill overdue by N days" VoiceOver phrasing to "Refill in 0 days".',
  )
})

// =========================================================================
// (c) accessible={true} appears on an INNER View — NOT on the outer card
//     container.
//
// This is the load-bearing wire. Chunk 99 v1 shipped accessible={true}
// on the outer <View style={[styles.card, ...]}> wrapper. On iOS the
// outer wrapper became a single AT leaf that ate every Pressable /
// Switch / Snooze / Update-supply control inside — VoiceOver could
// swipe TO the card but could not swipe INTO any button on it. The
// exact regression we're guarding against here is a future refactor
// moving accessible={true} back to that same outer wrapper.
//
// Detection strategy:
//   1. Locate the outer card container by its unambiguous style anchor
//      `styles.card`. That style key is used only on the top-level map
//      iteration wrapper View inside MedicationCard.
//   2. Extract the outer View's opening tag (from `<View` to `>`).
//   3. Assert the extracted tag does NOT contain `accessible` — no
//      `accessible={true}`, no `accessible` shorthand attribute either.
//   4. Assert `accessible={true}` still lives somewhere ELSE in the
//      file (an inner View carries the grouping). Otherwise the a11y
//      composition was quietly deleted rather than moved.
//   5. Assert the accessibilityLabel that binds the composed sentence
//      to the inner View is the composed helper's output —
//      `accessibilityLabel={composedA11yLabel}` — so we're catching
//      "moved to outer wrapper" AND "wired to wrong container".
// =========================================================================

test('(c) accessible={true} is on an INNER View, not on the outer card container', () => {
  // (c.1) Outer card container has NO `accessible` attribute.
  const outerCardTag = outerViewOpeningTagContaining(
    MEDS_SECTION_SRC,
    /styles\.card/,
  )
  assert.ok(
    outerCardTag !== null,
    'MedicationsSection.tsx must retain a `<View style={[styles.card, …]}>` outer card wrapper — the top-level map iteration container. This is the anchor the trip wire uses to prove accessible={true} did not migrate back onto it.',
  )
  assert.equal(
    /\baccessible\b/.test(outerCardTag),
    false,
    `MedicationsSection.tsx must NOT put \`accessible\` on the outer <View style={[styles.card, …]}> card container. Chunk 99 v1 shipped that shape and it collapsed the card into a single AT leaf, swallowing Edit / Hide / Track / Update-supply / Snooze — VoiceOver could not reach any interactive control. Move the grouping to an INNER View that wraps ONLY the passive descriptive block. Found outer tag:\n${outerCardTag}`,
  )

  // (c.2) `accessible={true}` DOES exist elsewhere in the file — the
  // inner grouping View must still carry the composition.
  assert.match(
    MEDS_SECTION_SRC,
    /accessible=\{true\}/,
    'MedicationsSection.tsx must retain an `accessible={true}` attribute on the inner grouping View that wraps the passive descriptive block. Dropping it entirely deletes the composed VoiceOver utterance chunk 99 landed and reverts the card to four fragmented reads (name, dose+freq, times, badges).',
  )

  // (c.3) The composed label is wired to the inner grouping View via
  // `accessibilityLabel={composedA11yLabel}` (the identifier that
  // MedicationCard binds to `composeMedA11yLabel(med)` locally).
  assert.match(
    MEDS_SECTION_SRC,
    /accessibilityLabel=\{composedA11yLabel\}/,
    'MedicationsSection.tsx must bind the inner grouping View\'s accessibilityLabel to `composedA11yLabel` (the locally memo\'d output of composeMedA11yLabel). Wiring it to a different identifier — e.g. med.name — silently regresses to the chunk-99-v1 one-word utterance and drops the "Refill / Schedule" clauses.',
  )
})

// =========================================================================
// (d) accessibilityElementsHidden={true} appears on inner Text nodes.
//
// The composed inner-View label subsumes name / dose+freq / times / badges
// / refill banner / supply summary / Track-adherence visual label. Every
// one of those Text nodes must set accessibilityElementsHidden={true} on
// iOS and importantForAccessibility="no-hide-descendants" on Android, or
// VoiceOver double-reads: first the composed sentence, then each Text
// child in sequence. We assert at least THREE inner Text nodes are
// hidden — the minimum is the name Text, the dose+freq Text, and the
// badges View. Real code carries more (times Text + refill banner +
// supply summary + Track-adherence label). If the count drops below 3
// the double-read regression is already back on the two most-swiped
// utterances.
// =========================================================================

test('(d) accessibilityElementsHidden={true} appears on inner Text nodes (double-read guard)', () => {
  const hiddenMatches =
    MEDS_SECTION_SRC.match(/accessibilityElementsHidden=\{true\}/g) ?? []
  assert.ok(
    hiddenMatches.length >= 3,
    `MedicationsSection.tsx must retain accessibilityElementsHidden={true} on the inner passive Text nodes (name / dose+freq / times / badges / refill banner / supply summary / Track-adherence label). Without it VoiceOver double-reads the composed sentence AND each child Text in sequence — the exact regression chunk 99 v2 fixed. Found ${hiddenMatches.length}; expected at least 3.`,
  )
  // Paired Android attribute — dropping importantForAccessibility silently
  // regresses TalkBack while leaving VoiceOver intact (a platform-parity
  // trap).
  assert.match(
    MEDS_SECTION_SRC,
    /importantForAccessibility\s*=\s*["']no-hide-descendants["']/,
    'MedicationsSection.tsx must retain importantForAccessibility="no-hide-descendants" alongside accessibilityElementsHidden — the Android counterpart. Without it TalkBack still double-reads the med card even after the iOS fix.',
  )
})

// =========================================================================
// (e) Interactive controls preserve their accessibilityLabels.
//
// Chunk 99 v2 kept every interactive control as a sibling of the inner
// grouping View, each carrying its own accessibilityLabel:
//   - Edit Pressable                  → `Edit ${med.name}`
//   - Hide Pressable                  → `Hide ${med.name}`
//   - Track-adherence Switch          → `Track adherence for ${med.name}`
//   - Update-supply Pressable         → `Update supply for ${med.name}`
//   - Snooze refill Pressable         → `Snooze refill reminder for ${med.name}`
//
// If any of these disappear the corresponding interactive control becomes
// AT-unreachable — VoiceOver / TalkBack can focus a Pressable with no
// label but announces only "button", giving no idea WHICH med the action
// applies to (the card has 5 controls sharing one composed leaf label).
//
// Backtick-prefix regex intentional: these are template literals bound
// to `${med.name}`. Matching by the fixed prefix keeps the wire stable
// across future med-name identifier renames.
// =========================================================================

test('(e) interactive controls preserve their accessibilityLabels', () => {
  // JSX expression container (`{` after `=`) intentional: interactive
  // labels use template literals to interpolate `${med.name}`, so real
  // code always reads `accessibilityLabel={\`Edit ${med.name}\`}`. The
  // spec's `/accessibilityLabel=\`Edit /` shorthand elides the JSX
  // wrapper — we make it explicit here so the wire matches production
  // source verbatim.
  const requiredLabelPrefixes = [
    { name: 'Edit', re: /accessibilityLabel=\{`Edit / },
    { name: 'Hide', re: /accessibilityLabel=\{`Hide / },
    {
      name: 'Track adherence',
      re: /accessibilityLabel=\{`Track adherence for /,
    },
    {
      name: 'Update supply',
      re: /accessibilityLabel=\{`Update supply for /,
    },
    {
      name: 'Snooze refill reminder',
      re: /accessibilityLabel=\{`Snooze refill reminder for /,
    },
  ]
  for (const { name, re } of requiredLabelPrefixes) {
    assert.match(
      MEDS_SECTION_SRC,
      re,
      `MedicationsSection.tsx must retain accessibilityLabel=\`${name} …\` on its dedicated interactive control. Chunk 99 v2 kept each Pressable / Switch as a sibling of the inner grouping View so it stays swipe-focusable; a missing label leaves the control as an anonymous "button" utterance and users can't tell WHICH med the action targets.`,
    )
  }
})

// =========================================================================
// (f) Composed label contains "Refill" and "Schedule" fallback phrases.
//
// composeMedA11yLabel encodes the sentence template
//   "{name}, {dose}. {schedule}. {refill status}."
// with these fallbacks (chunk 99 spec):
//   - Schedule missing         → "Schedule not specified"
//   - Refill needs, days > 0   → "Refill in N days"
//   - Refill overdue           → "Refill overdue by N days"
//   - Refill status unknown    → "Refill status unknown"
//
// If someone reworks the fallback wording (e.g. "Refill" → "Reorder",
// "Schedule not specified" → "No schedule set"), VoiceOver announces the
// new phrase but the chunk-99 contract silently drifts — no compile-time
// signal. Pin the two anchor words that MUST survive: "Refill" and
// "Schedule".
// =========================================================================

test('(f) composed label helper contains "Refill" and "Schedule" fallback phrases', () => {
  assert.match(
    MEDS_SECTION_SRC,
    /Refill/,
    'MedicationsSection.tsx composeMedA11yLabel must retain a "Refill" anchor phrase in its output template. VoiceOver users rely on this as the section-of-the-sentence keyword that tells them the third clause is refill status; renaming to "Reorder" or "Restock" silently changes what they hear.',
  )
  assert.match(
    MEDS_SECTION_SRC,
    /Schedule not specified/,
    'MedicationsSection.tsx composeMedA11yLabel must retain the "Schedule not specified" fallback for the missing-schedule branch. Rewording to "No schedule set" or dropping the fallback entirely breaks the chunk-99 spec that the composed sentence never contains a bare "undefined" — VoiceOver would announce "Metformin, 500 mg.  . Refill status unknown." (empty clause) instead of the readable fallback.',
  )
})

// =========================================================================
// (g) The chunk 55/71 medsSectionRef binding is still present.
//
// The ?focus=medications deep-link (COS-357 / chunk 55/71) hinges on
// BiopsychosocialPlanScreen holding a React.useRef<View> named
// `medsSectionRef` and attaching it via `ref={medsSectionRef}` to the
// wrapper View that mounts <MedicationsSection>. That ref feeds
// findNodeHandle → AccessibilityInfo.setAccessibilityFocus so VoiceOver
// lands directly on the med section after a push tap.
//
// If someone renames the ref, drops the `ref={…}` attachment, or moves
// the ref onto a sibling that no longer wraps MedicationsSection, the
// deep-link a11y focus silently no-ops — the app still navigates but
// VoiceOver stays on the tab bar or on the top of the plan surface.
// =========================================================================

test('(g) chunk 55/71 medsSectionRef binding is still present in BiopsychosocialPlanScreen.tsx', () => {
  assert.match(
    BPS_SCREEN_SRC,
    /const\s+medsSectionRef\s*=\s*React\.useRef/,
    'BiopsychosocialPlanScreen.tsx must retain the `const medsSectionRef = React.useRef<View | null>(null)` declaration. This ref is what feeds findNodeHandle + AccessibilityInfo.setAccessibilityFocus for the ?focus=medications deep link (chunk 55/71). Renaming or removing it silently no-ops the a11y focus jump.',
  )
  assert.match(
    BPS_SCREEN_SRC,
    /ref=\{medsSectionRef\}/,
    'BiopsychosocialPlanScreen.tsx must retain a `ref={medsSectionRef}` attachment on the wrapper View that mounts <MedicationsSection>. If the attachment is dropped, findNodeHandle(medsSectionRef.current) returns null and the deep-link VoiceOver focus jump becomes a no-op.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 discipline — prove the traps snap shut)
//
// These tests do NOT read MedicationsSection.tsx. They synthesise a
// minimal "known good" MedicationCard-shaped source that would pass wires
// (c) and (e), then mutate it in the exact drift shapes the wires must
// catch, and assert the wire logic flips OFF on the mutation. If any of
// these self-checks flip green while the drift is present, the paired
// production wire above is toothless.
// =========================================================================

const SYNTHETIC_GOOD_MED_CARD = [
  'function MedicationCard({ med }) {',
  '  const composedA11yLabel = composeMedA11yLabel(med);',
  '  return (',
  '    <View style={[styles.card, { backgroundColor: "#fff" }]}>',
  '      <View style={styles.cardTopRow}>',
  '        <View',
  '          style={{ flex: 1, minWidth: 0 }}',
  '          accessible={true}',
  '          accessibilityLabel={composedA11yLabel}',
  '        >',
  '          <Text accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">{med.name}</Text>',
  '          <Text accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">{med.dose}</Text>',
  '          <Text accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">{med.times.join(", ")}</Text>',
  '        </View>',
  '        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${med.name}`} />',
  '        <Pressable accessibilityRole="button" accessibilityLabel={`Hide ${med.name}`} />',
  '        <Switch accessibilityLabel={`Track adherence for ${med.name}`} />',
  '        <Pressable accessibilityRole="button" accessibilityLabel={`Update supply for ${med.name}`} />',
  '        <Pressable accessibilityRole="button" accessibilityLabel={`Snooze refill reminder for ${med.name}`} />',
  '      </View>',
  '    </View>',
  '  );',
  '}',
].join('\n')

test('self-check: synthetic good source PASSES wire (c) — sanity that the fixture matches production shape', () => {
  const src = stripComments(SYNTHETIC_GOOD_MED_CARD)
  const outerCardTag = outerViewOpeningTagContaining(src, /styles\.card/)
  assert.ok(
    outerCardTag !== null,
    'self-check setup: the synthetic fixture must expose a `<View style={[styles.card, …]}>` outer wrapper so the wire (c) helper can find it.',
  )
  assert.equal(
    /\baccessible\b/.test(outerCardTag),
    false,
    'self-check setup: the synthetic fixture must NOT put `accessible` on the outer card. If this fires, the fixture itself is wrong and the mutation self-check below is meaningless.',
  )
  assert.match(
    src,
    /accessible=\{true\}/,
    'self-check setup: the synthetic fixture must retain `accessible={true}` on the inner grouping View.',
  )
})

test('self-check: wire (c) FAILS when accessible={true} is moved back to the outer card container', () => {
  // Mutate: add `accessible={true}` inside the outer <View style={[styles.card, …]}>
  // opening tag AND drop it from the inner grouping View — the exact chunk
  // 99 v1 shape that swallowed all interactive controls.
  const mutated = SYNTHETIC_GOOD_MED_CARD
    .replace(
      '<View style={[styles.card, { backgroundColor: "#fff" }]}>',
      '<View style={[styles.card, { backgroundColor: "#fff" }]} accessible={true} accessibilityLabel={composedA11yLabel}>',
    )
    // Drop the inner accessible={true} + label so the mutation is
    // unambiguously "moved to outer" not "duplicated on both".
    .replace('          accessible={true}\n', '')
    .replace('          accessibilityLabel={composedA11yLabel}\n', '')
  const src = stripComments(mutated)

  // Re-run wire (c.1): outer card container carries `accessible`.
  const outerCardTag = outerViewOpeningTagContaining(src, /styles\.card/)
  assert.ok(
    outerCardTag !== null,
    'self-check: mutated fixture must still expose the outer card so the wire can inspect it.',
  )
  const outerHasAccessible = /\baccessible\b/.test(outerCardTag)
  assert.equal(
    outerHasAccessible,
    true,
    'self-check: mutated fixture must show `accessible` on the outer card tag — otherwise this self-check does not exercise the chunk-99-v1 regression shape.',
  )
  // The trip wire's core assertion is that outerHasAccessible is FALSE.
  // Prove that on this mutated source the wire's contract would fail:
  assert.notEqual(
    outerHasAccessible,
    false,
    'self-check: wire (c) MUST reject a source where accessible={true} sits on the outer card. If this flips (outerHasAccessible somehow reads false on the mutation), wire (c) is toothless against the exact chunk-99-v1 regression it exists to catch.',
  )
})

test('self-check: wire (e) FAILS when the Edit accessibilityLabel is removed', () => {
  // Mutate: drop the `Edit ${med.name}` accessibilityLabel from the Edit
  // Pressable. Wire (e) requires all five interactive labels; the Edit
  // check should now fail.
  const mutated = SYNTHETIC_GOOD_MED_CARD.replace(
    'accessibilityLabel={`Edit ${med.name}`}',
    '',
  )
  const src = stripComments(mutated)
  assert.equal(
    /accessibilityLabel=\{`Edit /.test(src),
    false,
    'self-check: wire (e) MUST reject a source that dropped the `Edit …` accessibilityLabel. If this flips true, wire (e) cannot detect a silent removal of the Edit control\'s label — VoiceOver would announce it as a bare "button" and the wire would still pass.',
  )
})

test('self-check: stripComments does NOT eat live accessibilityLabels that share a line with a trailing `// comment`', () => {
  // Belt-and-suspenders: the shared stripper deliberately leaves trailing
  // inline comments on code lines UNTOUCHED (see strip-comments.mjs
  // rationale). Prove that a real accessibilityLabel with a trailing
  // comment on the SAME LINE is still visible to the wires above — so
  // future contributors adding "// chunk 106" trailers don't accidentally
  // blank the label out of scope.
  const src = "accessibilityLabel={`Edit ${med.name}`} // chunk 106 wire"
  const stripped = stripComments(src)
  assert.match(
    stripped,
    /accessibilityLabel=\{`Edit /,
    'self-check: stripComments must leave the accessibilityLabel intact on a code line with a trailing `//` comment. If this fails, wire (e) becomes fragile to future comment additions.',
  )
})
