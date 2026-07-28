// tests/unit/meds-restore-banner-contract.test.mjs — CHUNK 117 (2026-07-23)
//
// Source-drift trip wires for the CHUNK 52.2 session-cached "recently
// hidden" restore banner in components/health-plan/MedicationsSection.tsx.
//
// BACKGROUND
// ----------
// The backend drops meds with removed=true from the /medications response
// on refetch. So a hidden med never re-mounts as a MedicationCard — the
// per-card "Hid this by mistake? Restore" Pressable that lived on the
// deleted card is UNREACHABLE the moment the mutation succeeds. Ken
// flagged that Restore was silently un-findable.
//
// CHUNK 52.2 fixed the reachability by pushing an entry into a
// SESSION-LOCAL `recentlyHidden` React.useState list on every successful
// Hide mutation. The MedicationsSection renders a compact "Recently
// hidden — tap Restore →" banner above the med list with one row per
// entry. Each row exposes a Pressable whose accessibilityLabel is the
// dynamic template literal `Restore ${entry.name}`; onPress invokes
// `restoreFromBanner(entry.id)`, which fires the unremove mutation and,
// on success only, drops the entry from `recentlyHidden`. Nothing is
// persisted — the list lives only for the duration of the current app
// session (until the component unmounts / reloads).
//
// THIS TEST — SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / chunk 103 pattern)
// --------------------------------------------------------------------
// Runtime-testing this contract would require jsdom + react-native + a
// react-query stub + expo shims — dozens of MB of devDeps to observe a
// dynamic accessibilityLabel and a mutation callback on a rendered tree.
// Instead we read MedicationsSection.tsx as text, strip comments through
// the shared helper (./strip-comments.mjs — chunk 103), and grep for the
// load-bearing shapes that guarantee the CHUNK 52.2 reachability fix
// cannot silently regress.
//
// If any of these fail: DO NOT tweak the regex to make it pass. Read the
// diff on MedicationsSection.tsx, confirm the banner refactor is
// deliberate (Ken-signed OR chunk-labeled with a re-derived spec), and
// only then update the trip wire in lockstep.
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
// Helper: extract the opening tag of the nearest <Pressable ...> that
// encloses the given anchor regex match. Walks backward from the anchor
// to the last `<Pressable` and forward to the first `>` at brace-depth 0
// (so `>` characters that live inside `{...}` expression attributes —
// e.g. `style={({ pressed }) => [...]}` where the `>` in `=>` sits at
// depth 1 — do NOT close the JSX opening tag prematurely).
//
// We intentionally do NOT track parens or square brackets because the
// only characters that toggle "am I still inside a JSX attribute value
// expression" are `{` and `}`. JSX attribute values are either
// double-quoted strings (no `>` case here) or a single `{...}` block, so
// brace-depth alone is the correct discriminator.
// -------------------------------------------------------------------------

function pressableOpeningTagContaining(src, anchorRegex) {
  const anchorMatch = anchorRegex.exec(src)
  if (!anchorMatch) return null
  const anchorIdx = anchorMatch.index
  const prefix = src.slice(0, anchorIdx)
  const startIdx = prefix.lastIndexOf('<Pressable')
  if (startIdx < 0) return null
  let depth = 0
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) {
      return src.slice(startIdx, i + 1)
    }
  }
  return null
}

// =========================================================================
// (a) Restore banner render path exists: a Pressable with a DYNAMIC
//     `accessibilityLabel={`Restore ${…}`}` template literal.
//
// The CHUNK 52.2 banner renders one row per hidden entry, each with its
// own Pressable whose accessibilityLabel is the med name interpolated
// after "Restore ". A hard-coded `accessibilityLabel="Restore"` would
// still render but would collapse every restore control to an identical
// utterance — the exact reachability gap chunk 52.2 exists to fix (users
// with 3 hidden meds would hear "Restore. Restore. Restore." and have
// no idea which is which). The `${…}` interpolation is load-bearing.
// =========================================================================

test('(a) Restore banner exposes a Pressable with a dynamic `accessibilityLabel={`Restore ${…}`}`', () => {
  assert.match(
    MEDS_SECTION_SRC,
    /accessibilityLabel=\{`Restore \$\{[^}]+\}`\}/,
    'MedicationsSection.tsx must retain a Pressable with a DYNAMIC accessibilityLabel of shape `Restore ${…}` (template literal interpolating the hidden entry name). A hard-coded "Restore" string would make every row\'s restore control announce identically — the exact reachability regression chunk 52.2 was landed to fix.',
  )
})

// =========================================================================
// (b) A session-cache state variable for the hidden entries exists.
//
// The banner drives its rows from a React.useState (or React.useRef)
// list whose identifier reads as "hidden" or "restore" — production uses
// `recentlyHidden`. Losing the state variable entirely (or downgrading
// it to a plain `let`) either breaks the banner render or, worse, keeps
// it rendering but stops it from updating when Hide fires, so users see
// a phantom banner from a previous Hide with no way to clear it.
//
// We accept either `useState` or `useRef` and either "hidden" or
// "restore" in the identifier, matched case-insensitively, so a future
// rename (e.g. `hiddenEntries`, `restoreList`, `hiddenRestoreQueue`)
// does not falsely trip the wire — the intent is a session cache, not
// a specific name.
// =========================================================================

test('(b) session-cache state variable exists (useState / useRef named around "hidden" or "restore")', () => {
  assert.match(
    MEDS_SECTION_SRC,
    /\b(?:const|let)\s+\[?\s*\w*(?:hidden|restore)\w*[\s,\]]/i,
    'MedicationsSection.tsx must retain a session-cached list of hidden entries — a `useState` (or `useRef`) declaration whose identifier reads as "hidden" or "restore" (production: `recentlyHidden`). Removing the state variable either breaks the banner render or, worse, freezes it on a stale snapshot with no update path when Hide fires.',
  )
  assert.match(
    MEDS_SECTION_SRC,
    /React\.(?:useState|useRef)\s*[<(]/,
    'MedicationsSection.tsx must retain at least one React.useState / React.useRef call — the banner\'s session cache depends on one. If this fails and (b.1) still passes, the identifier survived but its hook binding was dropped (dead code).',
  )
})

// =========================================================================
// (c) Restore Pressable's onPress triggers a handler whose body references
//     the hidden-list state setter.
//
// The onPress binds to `() => restoreFromBanner(entry.id)`. That handler
// is defined as a top-level function inside the component body and its
// body must call `setRecentlyHidden` (or the matching setter for whatever
// state variable satisfies (b)) so the entry is removed from the banner
// after the unremove mutation succeeds. If the setter is dropped, the
// banner keeps showing "restored" rows forever — the user restores a
// med, sees the banner still listing it, taps Restore again, and hits
// a duplicate-unremove no-op with no visible feedback.
//
// Detection strategy:
//   1. Locate the Restore Pressable via its dynamic accessibilityLabel
//      anchor (same regex as wire (a)).
//   2. Extract its opening tag with brace-depth tracking so `>` inside
//      `{...}` attribute expressions doesn't fool the walker.
//   3. Pull the handler identifier out of the onPress attribute. Accept
//      either `onPress={handlerName}` (bare) or
//      `onPress={() => handlerName(...)}` (inline thunk).
//   4. Locate the `const handlerName = ...` declaration and read
//      forward to its body's closing `}` at brace-depth 0.
//   5. Assert the body references a state setter shaped as `set<Word>`
//      matching the hidden-list identifier — production shape:
//      `setRecentlyHidden(…)`.
// =========================================================================

test('(c) Restore Pressable onPress triggers a handler whose body mutates the hidden-list state', () => {
  // (c.1 + c.2) Extract the Restore Pressable opening tag.
  const pressableTag = pressableOpeningTagContaining(
    MEDS_SECTION_SRC,
    /accessibilityLabel=\{`Restore \$\{[^}]+\}`\}/,
  )
  assert.ok(
    pressableTag !== null,
    'MedicationsSection.tsx must retain the Restore <Pressable …/> whose accessibilityLabel is `Restore ${…}`. If this fails, wire (a) probably fired too — investigate why the JSX enclosing the label is no longer a Pressable.',
  )

  // (c.3) Pull the handler identifier from onPress.
  //
  // Two acceptable shapes:
  //   onPress={handlerName}                       — bare reference
  //   onPress={() => handlerName(entry.id)}       — inline thunk
  //
  // The thunk shape is what production uses today.
  let handlerName = null
  const inlineThunk = /onPress=\{\s*\(\s*\)\s*=>\s*(\w+)\s*\(/.exec(pressableTag)
  if (inlineThunk) {
    handlerName = inlineThunk[1]
  } else {
    const bareRef = /onPress=\{\s*(\w+)\s*\}/.exec(pressableTag)
    if (bareRef) handlerName = bareRef[1]
  }
  assert.ok(
    handlerName !== null,
    `MedicationsSection.tsx Restore Pressable must expose an onPress handler — either \`onPress={handlerName}\` or \`onPress={() => handlerName(…)}\`. Found tag:\n${pressableTag}`,
  )

  // (c.4) Locate the handler's `const handlerName = …` declaration and
  // extract its body from the first `{` at brace-depth 0 to the matching
  // `}` at brace-depth 0.
  const declRe = new RegExp(`const\\s+${handlerName}\\s*=`)
  const declMatch = declRe.exec(MEDS_SECTION_SRC)
  assert.ok(
    declMatch,
    `MedicationsSection.tsx must define \`const ${handlerName} = …\` — the Restore Pressable onPress binds to this identifier. If the declaration is missing, the JSX references an undefined symbol at runtime and the banner throws on tap.`,
  )
  // Walk forward from the `=` to the first `{` at depth 0 (the body
  // opener), then walk to the matching `}` tracking brace depth.
  const afterEq = MEDS_SECTION_SRC.slice(declMatch.index + declMatch[0].length)
  const bodyOpen = afterEq.indexOf('{')
  assert.ok(
    bodyOpen >= 0,
    `MedicationsSection.tsx handler \`${handlerName}\` must have a block body — the wire needs to read its statements. An expression-body arrow like \`= (id) => setRecentlyHidden(…)\` is also acceptable in principle, but production uses a block; if you switched to an expression body, update this wire in lockstep.`,
  )
  let depth = 0
  let bodyEnd = -1
  for (let i = bodyOpen; i < afterEq.length; i++) {
    const c = afterEq[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        bodyEnd = i
        break
      }
    }
  }
  assert.ok(
    bodyEnd > bodyOpen,
    `MedicationsSection.tsx handler \`${handlerName}\` block body must be brace-balanced — could not find the matching closing \`}\`. If this fails the source is likely malformed; run the compiler.`,
  )
  const handlerBody = afterEq.slice(bodyOpen, bodyEnd + 1)

  // (c.5) The body must reference a state setter for the hidden-list.
  // Accept any `set<Word>(` where the identifier contains "hidden" or
  // "restore" so a rename of the state variable (production:
  // `recentlyHidden` → setter `setRecentlyHidden`) does not spuriously
  // trip the wire.
  assert.match(
    handlerBody,
    /\bset\w*(?:hidden|restore)\w*\s*\(/i,
    `MedicationsSection.tsx handler \`${handlerName}\` body must call the hidden-list state setter (e.g. \`setRecentlyHidden(prev => prev.filter(...))\`). Without it the banner keeps rendering restored entries forever, taps duplicate the unremove mutation, and users can't tell whether Restore worked. Handler body found:\n${handlerBody}`,
  )
})

// =========================================================================
// (d) The composed med-card a11y label (chunk 99 v2) coexists —
//     composeMedA11yLabel is still defined.
//
// This is a cross-repo consistency wire that mirrors chunk 106 wire (a).
// The Restore banner sits ABOVE the med-card list in the same component;
// a refactor that rips out the banner but also accidentally guts the
// composeMedA11yLabel helper (say, by deleting a shared header block or
// renaming the "Medications" section into a new file) would silently
// regress both features at once. We assert both survive together.
// =========================================================================

test('(d) composeMedA11yLabel helper (chunk 99 v2 / chunk 106) still defined in MedicationsSection.tsx', () => {
  assert.match(
    MEDS_SECTION_SRC,
    /function\s+composeMedA11yLabel\s*\(/,
    'MedicationsSection.tsx must retain a top-level `function composeMedA11yLabel(...)` definition. This helper is the sole producer of the composed VoiceOver utterance bound to each med card\'s inner grouping View (chunk 99 v2). If it disappears, every card falls back to fragmented four-Text reads — the exact regression chunk 106 was landed to trap. Restore-banner refactors should NEVER touch it.',
  )
})

// =========================================================================
// (e) The chunk 55/71 medsSectionRef binding is still present.
//
// The ?focus=medications deep link (COS-357 / chunk 55/71) hinges on
// BiopsychosocialPlanScreen holding a `medsSectionRef = React.useRef<View>`
// and attaching it via `ref={medsSectionRef}` to the wrapper View that
// mounts <MedicationsSection>. That ref feeds findNodeHandle →
// AccessibilityInfo.setAccessibilityFocus so VoiceOver lands directly on
// the med section (which now contains the restore banner ABOVE the med
// list) after a push notification tap. If the ref is severed, the deep
// link still navigates but VoiceOver misses the banner AND the med list.
// =========================================================================

test('(e) chunk 55/71 medsSectionRef binding is still present in BiopsychosocialPlanScreen.tsx', () => {
  assert.match(
    BPS_SCREEN_SRC,
    /const\s+medsSectionRef\s*=\s*React\.useRef/,
    'BiopsychosocialPlanScreen.tsx must retain `const medsSectionRef = React.useRef<View | null>(null)`. This ref feeds findNodeHandle + AccessibilityInfo.setAccessibilityFocus for the ?focus=medications deep link (chunk 55/71). Renaming or removing it silently no-ops the a11y focus jump — the restore banner and med list stay unreached by VoiceOver on push tap.',
  )
  assert.match(
    BPS_SCREEN_SRC,
    /ref=\{medsSectionRef\}/,
    'BiopsychosocialPlanScreen.tsx must retain a `ref={medsSectionRef}` attachment on the wrapper View that mounts <MedicationsSection>. Without the attachment, findNodeHandle(medsSectionRef.current) returns null and the deep-link VoiceOver focus jump becomes a no-op.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 discipline — prove the traps snap shut)
//
// These tests do NOT read MedicationsSection.tsx. They synthesise a
// minimal "known good" restore-banner-shaped source that would pass wires
// (a), (b), (c), and (d), then mutate it in the three drift shapes the
// spec calls out and assert the paired wire logic flips OFF on the
// mutation. If any of these self-checks flip green while the drift is
// present, the paired production wire above is toothless.
// =========================================================================

const SYNTHETIC_GOOD_MEDS_SECTION = [
  'function MedicationsSection() {',
  '  const [recentlyHidden, setRecentlyHidden] = React.useState([]);',
  '  const restoreFromBanner = (id) => {',
  '    updateMutation.mutate(',
  '      { unremove: [id] },',
  '      {',
  '        onSuccess: () => {',
  '          setRecentlyHidden((prev) => prev.filter((e) => e.id !== id));',
  '        },',
  '      },',
  '    );',
  '  };',
  '  return (',
  '    <View>',
  '      {recentlyHidden.map((entry) => (',
  '        <View key={entry.id}>',
  '          <Text>{entry.name}</Text>',
  '          <Pressable',
  '            onPress={() => restoreFromBanner(entry.id)}',
  '            accessibilityRole="button"',
  '            accessibilityLabel={`Restore ${entry.name}`}',
  '            style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}',
  '          >',
  '            <Text>Restore</Text>',
  '          </Pressable>',
  '        </View>',
  '      ))}',
  '    </View>',
  '  );',
  '}',
  'function composeMedA11yLabel(med) {',
  '  return `${med.name}, ${med.dose}. Refill in ${med.daysUntilRefill} days.`;',
  '}',
].join('\n')

test('self-check: synthetic good source PASSES wires (a) (b) (c) (d) — sanity that the fixture matches production shape', () => {
  const src = stripComments(SYNTHETIC_GOOD_MEDS_SECTION)
  // (a)
  assert.match(
    src,
    /accessibilityLabel=\{`Restore \$\{[^}]+\}`\}/,
    'self-check setup: the synthetic fixture must expose an `accessibilityLabel={`Restore ${…}`}` — otherwise the mutation self-check for wire (a) is meaningless.',
  )
  // (b)
  assert.match(
    src,
    /\b(?:const|let)\s+\[?\s*\w*(?:hidden|restore)\w*[\s,\]]/i,
    'self-check setup: the synthetic fixture must expose a `recentlyHidden`-shaped state declaration.',
  )
  // (c) — the Restore Pressable\'s handler body references the setter.
  const tag = pressableOpeningTagContaining(
    src,
    /accessibilityLabel=\{`Restore \$\{[^}]+\}`\}/,
  )
  assert.ok(tag !== null, 'self-check setup: fixture must expose a Pressable around the Restore label.')
  assert.match(
    tag,
    /onPress=\{\s*\(\s*\)\s*=>\s*restoreFromBanner\s*\(/,
    'self-check setup: fixture Pressable must bind onPress to `() => restoreFromBanner(...)` so the handler-extraction path in wire (c) is exercised.',
  )
  // (d)
  assert.match(
    src,
    /function\s+composeMedA11yLabel\s*\(/,
    'self-check setup: fixture must define composeMedA11yLabel.',
  )
})

test('self-check: wire (a) FAILS when the "Restore" template-literal label is stripped', () => {
  // Mutate: drop the literal word "Restore" from the accessibilityLabel
  // (rename to `Undo ${entry.name}`, say). Wire (a) requires the "Restore"
  // prefix inside the template — the exact wording is what the spec pins.
  const mutated = SYNTHETIC_GOOD_MEDS_SECTION.replace(
    'accessibilityLabel={`Restore ${entry.name}`}',
    'accessibilityLabel={`Undo ${entry.name}`}',
  )
  const src = stripComments(mutated)
  assert.equal(
    /accessibilityLabel=\{`Restore \$\{[^}]+\}`\}/.test(src),
    false,
    'self-check: wire (a) MUST reject a source that renamed the Restore label to "Undo …". If this flips true, wire (a) is toothless — a future refactor could quietly rename the banner\'s AT wording without any signal.',
  )
})

test('self-check: wire (b) FAILS when the hidden-list state declaration is removed', () => {
  // Mutate: delete the `const [recentlyHidden, setRecentlyHidden] = ...`
  // line entirely. Wire (b) requires a `useState`/`useRef` declaration
  // whose identifier contains "hidden" or "restore".
  //
  // Also delete other identifiers that would coincidentally satisfy the
  // "const/let named around hidden/restore" match — the setter name and
  // the `restoreFromBanner` const both contain the target substrings, so
  // stripping just the useState line leaves the wire green. We reduce
  // the fixture to a shape where NO const/let identifier still matches,
  // to prove the wire snaps shut on real removal.
  const mutated = SYNTHETIC_GOOD_MEDS_SECTION
    .replace(
      '  const [recentlyHidden, setRecentlyHidden] = React.useState([]);\n',
      '',
    )
    .replace(
      '  const restoreFromBanner = (id) => {',
      '  const bannerHandler = (id) => {',
    )
    // Also strip the setter identifier so the const/let regex has nothing
    // left to match on "hidden"/"restore".
    .replace(/setRecentlyHidden/g, 'noop')
    // And the map iteration variable so `recentlyHidden.map` isn't seen as
    // a stray identifier (it isn't a const/let anyway but be safe).
    .replace(/recentlyHidden\.map/g, 'items.map')
    // The accessibilityLabel and Restore text remain — wire (a) still
    // matches, which is fine: (b) is what we're testing.
  const src = stripComments(mutated)
  assert.equal(
    /\b(?:const|let)\s+\[?\s*\w*(?:hidden|restore)\w*[\s,\]]/i.test(src),
    false,
    `self-check: wire (b) MUST reject a source that dropped the session-cache state declaration. If this flips true, wire (b) is toothless and a future refactor could silently delete the banner\'s update path. Mutated source:\n${src}`,
  )
})

test('self-check: wire (d) FAILS when composeMedA11yLabel is removed', () => {
  // Mutate: strip the composeMedA11yLabel definition (rename or delete).
  // Wire (d) requires a `function composeMedA11yLabel(...)` declaration.
  const mutated = SYNTHETIC_GOOD_MEDS_SECTION.replace(
    /function\s+composeMedA11yLabel\s*\([^)]*\)\s*\{[^}]*\}/,
    '',
  )
  const src = stripComments(mutated)
  assert.equal(
    /function\s+composeMedA11yLabel\s*\(/.test(src),
    false,
    'self-check: wire (d) MUST reject a source that dropped composeMedA11yLabel. If this flips true, the cross-repo consistency wire against chunk-106 regression is toothless — a restore-banner refactor could silently nuke the composed med-card VoiceOver utterance.',
  )
})

test('self-check: stripComments does NOT eat live restore-banner literals that share a line with a trailing `// comment`', () => {
  // Belt-and-suspenders: the shared stripper deliberately leaves trailing
  // inline comments on code lines UNTOUCHED (see strip-comments.mjs
  // rationale). Prove that a real accessibilityLabel with a trailing
  // comment on the SAME LINE is still visible to the wires above — so
  // future contributors adding "// chunk 117" trailers don't accidentally
  // blank the label out of scope.
  const src =
    'accessibilityLabel={`Restore ${entry.name}`} // chunk 117 wire'
  const stripped = stripComments(src)
  assert.match(
    stripped,
    /accessibilityLabel=\{`Restore \$\{[^}]+\}`\}/,
    'self-check: stripComments must leave the accessibilityLabel intact on a code line with a trailing `//` comment. If this fails, wire (a) becomes fragile to future comment additions.',
  )
})
