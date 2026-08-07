// tests/unit/tab-bar-a11y-contract.test.mjs — CHUNK 104 (2026-07-23)
//
// Source-drift trip wires for the CHUNK 101 accessibility props on the
// custom bottom tab bar — components/custom-scrollable-tab-bar.tsx.
//
// Chunk 101 landed four load-bearing accessibility contracts that every
// screen-reader user relies on:
//
//   (a) Each tab PlatformPressable declares accessibilityRole="tab" so
//       VoiceOver announces the row as a tab (not a generic button).
//   (b) Each tab Pressable declares accessibilityState={{ selected: <expr> }}
//       — set on EVERY tab, not just the focused one — so VoiceOver hears
//       an explicit "selected" cue on the active tab and "not selected" on
//       the others.
//   (c) Each tab Pressable declares an accessibilityHint that says
//       "Switches to …" and interpolates the visible displayLabel (or the
//       TAB_LABELS map entry that displayLabel is derived from). Sighted
//       label and spoken hint stay 1:1.
//   (d) The parent tabsContainer View declares accessibilityRole="tablist"
//       (exactly once), so VoiceOver treats the tab strip as a group and
//       the rotor / swipe-between-tabs gesture navigates it as a set.
//
// If any of those props gets accidentally deleted during a refactor —
// e.g. someone rips out the accessibilityHint for "cleanliness", or
// swaps the tab Pressable to a bare View, or replaces the parent's role
// with something generic — the TypeScript compiler emits ZERO warnings.
// The app ships, sighted UX looks identical, and screen-reader users
// silently revert to the generic Pressable experience: no role, no
// state, no hint. This file is the trip wire that prevents that.
//
// We also guard two adjacent invariants that chunk 101 depended on:
//
//   (e) Chunk 73's `labelAllowFontScaling` derived from
//       `settings.isAccessibilityMode` is still present. Chunk 101's
//       hint copy assumes the label is legible; if chunk 73's OS Dynamic
//       Type wire regresses, low-vision users lose the label scaling
//       that pairs with the VoiceOver hint.
//   (f) Tab labels are ADAPTIVE per device width (Ken 2026-08-05, which
//       superseded the static "always 2-word" map from chunks 54 / 54.1):
//       phones (<768pt) get "Plan" / "Summary" so five tabs fit an
//       iPhone SE without wrapping, tablets (>=768pt) get "Care Plan" /
//       "Health Summary". Chunk 101's accessibilityHint interpolates
//       `displayLabel`, which is read out of the per-render
//       buildTabLabels() result — so the spoken hint tracks whichever
//       spelling the sighted user sees. Collapsing the ternaries back to
//       one spelling (either direction) silently drops a form factor.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / chunk 98 v2 pattern):
//   components/custom-scrollable-tab-bar.tsx is a React Native component
//   wired into @react-navigation/bottom-tabs. Standing up a behavioral
//   mirror would require jsdom + React Native renderer + a react-navigation
//   test harness + a safe-area-context stub — tens of MB of devDeps to
//   exercise five load-bearing lines of JSX props. Instead we read the
//   .tsx source as text and grep for the literals that must appear for
//   the wires to be intact. Same discipline as:
//     - tests/unit/notification-tap-handoff.test.mjs         (chunk 98 v2)
//     - tests/unit/use-notifications-bps-eligible.test.mjs   (chunk 91)
//     - tests/unit/use-wellbeing-derivation.test.mjs         (chunk 84 v2)
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on components/custom-scrollable-tab-bar.tsx, confirm the
//   source change is deliberate (role really renamed, hint copy really
//   changed, the label spellings really re-derived), and only then update
//   the trip wire in lockstep.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob already
// present in package.json's `test` script. No config changes required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const TAB_BAR_TSX_PATH = join(
  REPO_ROOT,
  'components',
  'custom-scrollable-tab-bar.tsx',
)
const TAB_BAR_TSX_SRC_RAW = readFileSync(TAB_BAR_TSX_PATH, 'utf8')

// Strip comments before running the load-bearing "the code literally does X"
// matchers. Without this, a commented-out `// accessibilityRole="tab"` line
// would still contain the substring `accessibilityRole="tab"` and silently
// satisfy every downstream matcher — exactly the drift shape this file is
// meant to catch. Re-uses the chunk 98 v2 line-oriented state machine from
// tests/unit/notification-tap-handoff.test.mjs; see that file's stripComments
// docstring for the full rationale (line-comment vs block-comment vs `//`
// inside string literals).
function stripComments(src) {
  const out = []
  let inBlock = false
  for (const rawLine of src.split('\n')) {
    if (inBlock) {
      if (rawLine.includes('*/')) inBlock = false
      out.push('')
      continue
    }
    const trimmed = rawLine.trimStart()
    if (trimmed.startsWith('//')) {
      out.push('')
      continue
    }
    if (trimmed.startsWith('/*')) {
      if (trimmed.slice(2).includes('*/')) {
        out.push(rawLine.replace(/\/\*[\s\S]*?\*\//g, ''))
      } else {
        out.push('')
        inBlock = true
      }
      continue
    }
    out.push(rawLine)
  }
  return out.join('\n')
}

const TAB_BAR_TSX_SRC = stripComments(TAB_BAR_TSX_SRC_RAW)

// =========================================================================
// (a) Each tab PlatformPressable has accessibilityRole="tab".
//
// The tab bar renders one PlatformPressable per visible route inside
// renderTab(...). Because renderTab is a single function called N times
// at runtime, the SOURCE contains exactly one `<PlatformPressable ...>`
// opening JSX tag and exactly one `accessibilityRole="tab"` literal. If
// those counts diverge — a second Pressable added without the role, or
// the role deleted from the sole one — the drift is real and we want to
// fail. Assert count-equality between the two.
// =========================================================================

test('(a) accessibilityRole="tab" appears exactly once per tab PlatformPressable in source', () => {
  const pressableOpenTags = TAB_BAR_TSX_SRC.match(/<PlatformPressable\b/g) ?? []
  const tabRoles = TAB_BAR_TSX_SRC.match(/accessibilityRole\s*=\s*"tab"/g) ?? []
  assert.notEqual(
    pressableOpenTags.length,
    0,
    'expected at least one <PlatformPressable ...> in components/custom-scrollable-tab-bar.tsx — the tab renderer looks structurally different from chunk 101',
  )
  assert.equal(
    tabRoles.length,
    pressableOpenTags.length,
    `accessibilityRole="tab" count (${tabRoles.length}) must match <PlatformPressable> count (${pressableOpenTags.length}) — a Pressable without the role silently regresses screen-reader users to the generic-button experience`,
  )
})

// =========================================================================
// (b) accessibilityState={{ selected: <expression> }} is passed to each
//     tab and the expression is a runtime selector (not a bare literal),
//     matching the isFocused semantic chunk 101 established.
//
// The chunk-101 shape is `accessibilityState={{ selected: isFocused }}`.
// A regression to `{ selected: true }` (hard-coded) would announce every
// tab as selected — the exact bug chunk 101 fixed. A regression that
// drops the prop entirely means AT hears no "selected" cue at all.
// =========================================================================

test('(b) accessibilityState={{ selected: <expression> }} is passed to each tab (matches isFocused semantic)', () => {
  const pressableOpenTags = TAB_BAR_TSX_SRC.match(/<PlatformPressable\b/g) ?? []
  // Accept any non-empty expression after `selected:` up to the closing
  // `}}` — the value expression is deliberately non-anchored so a
  // refactor to `state.routes[state.index]?.key === route.key` (inlining
  // isFocused) would still satisfy the wire. What we REJECT is:
  //   - the prop being deleted
  //   - the value being a bare `true` / `false` literal (would announce
  //     every / no tab as selected)
  const stateMatches =
    TAB_BAR_TSX_SRC.match(
      /accessibilityState\s*=\s*\{\{\s*selected\s*:\s*([^}]+?)\s*\}\}/g,
    ) ?? []
  assert.equal(
    stateMatches.length,
    pressableOpenTags.length,
    `accessibilityState={{ selected: ... }} count (${stateMatches.length}) must match <PlatformPressable> count (${pressableOpenTags.length}) — chunk 101 requires the selected state on EVERY tab, not just the focused one`,
  )
  // Second pass: within each match, the value expression must not be a
  // bare boolean literal — chunk 101 explicitly regressed away from that.
  for (const m of stateMatches) {
    const inner = m.match(
      /selected\s*:\s*(true|false)\s*\}\}/,
    )
    assert.equal(
      inner,
      null,
      'accessibilityState.selected must be a runtime expression (e.g. isFocused), not a bare true/false literal — hard-coding it announces every / no tab as selected, the exact regression chunk 101 fixed',
    )
  }
})

// =========================================================================
// (c) accessibilityHint template contains "Switches to" and interpolates
//     the visible displayLabel (or a TAB_LABELS-mapped equivalent).
//
// Chunk 101 form: `accessibilityHint={`Switches to the ${displayLabel} section`}`.
// The critical properties:
//   1. The literal phrase "Switches to" — screen-reader consistency with
//      iOS convention ("Double-tap to activate. Switches to X.").
//   2. Interpolation on `displayLabel` (or, defensively, on the
//      `TAB_LABELS[...]` expression that displayLabel is derived from) so
//      the spoken hint tracks the sighted label. A regression to a static
//      string like `"Switch tabs"` would satisfy #1 but silently detach
//      the hint from the label — VoiceOver users would hear the same
//      hint for every tab.
// =========================================================================

test('(c) accessibilityHint contains "Switches to" AND interpolates displayLabel (or TAB_LABELS entry)', () => {
  const pressableOpenTags = TAB_BAR_TSX_SRC.match(/<PlatformPressable\b/g) ?? []
  // Grab every accessibilityHint prop value (backtick-templated). We
  // scope to backtick literals because chunk 101 uses a template string;
  // if the source drops to a plain "" string the interpolation regex
  // below will naturally miss.
  const hintMatches =
    TAB_BAR_TSX_SRC.match(
      /accessibilityHint\s*=\s*\{`[^`]*`\}/g,
    ) ?? []
  assert.equal(
    hintMatches.length,
    pressableOpenTags.length,
    `accessibilityHint={\`…\`} count (${hintMatches.length}) must match <PlatformPressable> count (${pressableOpenTags.length}) — chunk 101 requires a hint on every tab`,
  )
  for (const hint of hintMatches) {
    assert.match(
      hint,
      /Switches to/,
      `accessibilityHint must contain the literal "Switches to" (iOS convention) — got: ${hint}`,
    )
    // The interpolated expression must reference either displayLabel
    // (the local variable chunk 101 chose) or the TAB_LABELS map that
    // displayLabel derives from. Either shape provably tracks the
    // sighted label; a bare static string would fail this check.
    const interpolatesLabel =
      /\$\{\s*displayLabel\s*\}/.test(hint) ||
      /\$\{\s*TAB_LABELS\s*\[/.test(hint)
    assert.equal(
      interpolatesLabel,
      true,
      `accessibilityHint must interpolate displayLabel (or TAB_LABELS[...]) so the spoken hint tracks the sighted label — got: ${hint}`,
    )
  }
})

// =========================================================================
// (d) Parent tabsContainer View has accessibilityRole="tablist" — exactly
//     one occurrence.
//
// The tablist role tells VoiceOver to treat the tab strip as a semantic
// group (rotor / swipe-between-tabs navigates the whole set). More than
// one occurrence would mean somebody duplicated the tab strip or shoved
// the role on a child by mistake; zero means the group semantic was
// dropped and the row degrades to loose Pressables from AT's POV.
// =========================================================================

test('(d) accessibilityRole="tablist" appears exactly once on the parent tabsContainer', () => {
  const tablistMatches =
    TAB_BAR_TSX_SRC.match(/accessibilityRole\s*=\s*"tablist"/g) ?? []
  assert.equal(
    tablistMatches.length,
    1,
    `accessibilityRole="tablist" must appear exactly once (found ${tablistMatches.length}) — the parent tabsContainer needs it so VoiceOver announces the row as a tab list and navigates it as a set`,
  )
})

// =========================================================================
// (e) Chunk 73 preserved: labelAllowFontScaling reference derived from
//     settings.isAccessibilityMode is still present.
//
// Chunk 101's spoken hint assumes the sighted label is legible. If chunk
// 73's WCAG 1.4.4 wire regresses — e.g. the code stops branching on
// settings.isAccessibilityMode and defaults allowFontScaling to false —
// low-vision users lose the OS Dynamic Type scaling that pairs with the
// VoiceOver hint. We assert BOTH the derived-variable name AND the
// underlying settings flag it reads from are still in source.
// =========================================================================

test('(e) chunk 73 wire preserved: labelAllowFontScaling reference is still derived from settings.isAccessibilityMode', () => {
  assert.match(
    TAB_BAR_TSX_SRC,
    /\blabelAllowFontScaling\b/,
    'components/custom-scrollable-tab-bar.tsx must still reference labelAllowFontScaling — chunk 73 (WCAG 1.4.4) uses it to gate OS Dynamic Type on the tab label',
  )
  assert.match(
    TAB_BAR_TSX_SRC,
    /settings\.isAccessibilityMode/,
    'components/custom-scrollable-tab-bar.tsx must still read settings.isAccessibilityMode — chunk 73 branches allowFontScaling on it so low-vision users get OS-level scaling when the app toggle is off',
  )
})

// =========================================================================
// (f) Tab labels are ADAPTIVE: 1-word on phones, 2-word on tablets.
//
// HISTORY. Chunks 54 / 54.1 pinned a static `TAB_LABELS` map whose values
// were always the full "Care Plan" / "Health Summary" spellings — Ken
// rejected the terse "Care" / "Summary" forms on 2026-07-22.
//
// WHAT CHANGED. Ken 2026-08-05 asked for smaller phone labels: five tabs
// at the 2-word spelling wrap on an iPhone SE. The static map became the
// `buildTabLabels()` factory, which reads the window width and returns the
// 2-word forms only at tablet widths (>=768pt, matching isTablet() in
// stores/accessibility-store.tsx) and 1-word forms below that. The
// identifier `TAB_LABELS` no longer exists.
//
// WHY THE A11Y CONTRACT STILL HOLDS. Chunk 101's accessibilityHint
// interpolates `displayLabel`, which is read out of whatever
// buildTabLabels() returned for this device — so the spoken hint still
// tracks the SIGHTED label 1:1 on both form factors, which is the
// invariant chunks 54/101 actually cared about. (VoiceOver users also
// still get the unabridged route title via accessibilityLabel, which
// falls back to `options.title` — see wire (c) and the source comment at
// the accessibilityLabel prop.)
//
// WHAT THIS WIRE PINS. That the adaptivity is real and both ends of it
// survive: the width test, the tablet branch spellings ("Care Plan" /
// "Health Summary"), the phone branch spellings ("Plan" / "Summary"), and
// the consumer reading the built map by route name. Collapsing the
// ternaries back to a single spelling — in EITHER direction — trips this.
// =========================================================================

test('(f) tab labels are adaptive: "Plan"/"Summary" on phones, "Care Plan"/"Health Summary" on tablets (Ken 2026-08-05)', () => {
  // The factory replaced the static map. A revert to a module-level const
  // map would lose the per-device branch entirely.
  assert.match(
    TAB_BAR_TSX_SRC,
    /function\s+buildTabLabels\s*\(\s*\)\s*:\s*Record<\s*string\s*,\s*string\s*>/,
    'custom-scrollable-tab-bar.tsx must define `function buildTabLabels(): Record<string, string>` — the factory that replaced the static TAB_LABELS map (Ken 2026-08-05). A module-level const map cannot branch on device width, so reinstating one silently drops the adaptive behaviour.',
  )
  // The tablet test itself. 768 matches isTablet() in the accessibility
  // store; drifting it desyncs the tab bar from every other tablet branch.
  assert.match(
    TAB_BAR_TSX_SRC,
    /const\s+isTablet\s*=\s*Dimensions\.get\(\s*['"]window['"]\s*\)\.width\s*>=\s*768/,
    'buildTabLabels() must derive `isTablet` from `Dimensions.get("window").width >= 768`. The 768pt threshold is shared with isTablet() in stores/accessibility-store.tsx — if it drifts here, the tab bar disagrees with the rest of the app about what a tablet is, and phones near the boundary get labels that overflow the row.',
  )
  // Both branches of both adaptive routes, asserted explicitly. A one-sided
  // check would pass if someone collapsed the ternary to the surviving arm.
  assert.match(
    TAB_BAR_TSX_SRC,
    /'health-plan':\s*isTablet\s*\?\s*['"]Care Plan['"]\s*:\s*['"]Plan['"]/,
    'The `health-plan` tab label must remain `isTablet ? \'Care Plan\' : \'Plan\'`. Collapsing to "Care Plan" everywhere re-breaks the iPhone SE wrap Ken flagged on 2026-08-05; collapsing to "Plan" everywhere throws away the tablet spelling he asked to keep — and either way the accessibilityHint follows the sighted label, so the regression is silent in QA.',
  )
  assert.match(
    TAB_BAR_TSX_SRC,
    /'unified-plan':\s*isTablet\s*\?\s*['"]Care Plan['"]\s*:\s*['"]Plan['"]/,
    'The `unified-plan` tab label must carry the SAME adaptive pair as `health-plan` (`isTablet ? \'Care Plan\' : \'Plan\'`). The two routes are the flag-off / flag-on variants of one slot (see isHealthPlan in renderTab) — if only one is updated, flipping TAB_SWAP_BPS_ENABLED silently changes the tab\'s wording.',
  )
  assert.match(
    TAB_BAR_TSX_SRC,
    /\bplan:\s*isTablet\s*\?\s*['"]Health Summary['"]\s*:\s*['"]Summary['"]/,
    'The `plan` tab label must remain `isTablet ? \'Health Summary\' : \'Summary\'`. Same reasoning as the health-plan pair: both spellings are load-bearing, one per form factor.',
  )
  // The consumer. If displayLabel stops reading the built map, the labels
  // above become dead code and every tab falls back to options.title.
  assert.match(
    TAB_BAR_TSX_SRC,
    /const\s+tabLabels\s*=\s*buildTabLabels\(\)/,
    'CustomScrollableTabBar must call `buildTabLabels()` once per render into `tabLabels` — the labels must be rebuilt on re-render so an orientation change or split-view resize re-evaluates the width test.',
  )
  assert.match(
    TAB_BAR_TSX_SRC,
    /tabLabels\[route\.name\]\s*\?\?/,
    'displayLabel must be derived from `tabLabels[route.name] ?? …` (falling back to tabBarLabel / title / route.name for routes not in the map). Without this lookup the adaptive labels are dead code and every tab renders its raw route title instead.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 84 v2 / chunk 98 v2 pattern)
//
// These tests do NOT read components/custom-scrollable-tab-bar.tsx. They
// exercise the tightened regexes above against synthetic sources whose
// SOLE PURPOSE is to reproduce the exact drift shapes chunk 104 is meant
// to catch:
//
//   1. Removal of the parent accessibilityRole="tablist" prop — wire (d)
//      must fail cleanly on the synthetic mutation. This is the load-
//      bearing self-check called out in the chunk brief.
//   2. Removal of the per-tab accessibilityRole="tab" prop — wire (a)'s
//      count-equality check must fail cleanly.
//   3. Regression of accessibilityState.selected to a bare `true` literal
//      — wire (b)'s second-pass literal-rejection must fail cleanly.
//   4. Regression of accessibilityHint to a static string with no
//      interpolation — wire (c)'s interpolation check must fail cleanly.
//   5. stripComments correctly blanks a commented-out
//      `// accessibilityRole="tablist"` line, so wire (d) does not
//      falsely see the role on a comment.
//
// If any of THESE self-checks flip green when the drift is present, the
// trip wires above are toothless and must be re-tightened. This is the
// chunk 84 v2 discipline: prove the trap actually snaps shut.
// =========================================================================

// A minimal synthetic source that mirrors the load-bearing chunk-101
// shape: one PlatformPressable per tab, tablist role on the parent
// container. We mutate this to reproduce specific drift shapes and
// re-run the exact regexes / count-equality checks the wires above use.
function synthGoodSource() {
  return [
    "const TAB_LABELS = { 'health-plan': 'Care Plan', plan: 'Health Summary' };",
    'function CustomScrollableTabBar() {',
    '  return (',
    '    <View accessibilityRole="tablist">',
    '      <PlatformPressable',
    '        accessibilityRole="tab"',
    '        accessibilityState={{ selected: isFocused }}',
    '        accessibilityHint={`Switches to the ${displayLabel} section`}',
    '      />',
    '    </View>',
    '  );',
    '}',
  ].join('\n')
}

test('self-check: removing the parent accessibilityRole="tablist" prop makes wire (d) fail on the mutation (drift-catching proof)', () => {
  // Chunk-brief-mandated mutation: rip out the tablist role from a
  // synthetic drift source and prove wire (d)'s tightened count check
  // fails. This is the load-bearing evidence that chunk 104 catches
  // the exact regression it was written to guard against.
  const good = synthGoodSource()
  const broken = good.replace(/\s*accessibilityRole="tablist"/, '')
  const strippedGood = stripComments(good)
  const strippedBroken = stripComments(broken)

  const goodMatches =
    strippedGood.match(/accessibilityRole\s*=\s*"tablist"/g) ?? []
  const brokenMatches =
    strippedBroken.match(/accessibilityRole\s*=\s*"tablist"/g) ?? []
  assert.equal(
    goodMatches.length,
    1,
    'self-check baseline: synthetic good source must have exactly one tablist role — if this fails the synth setup is wrong, not the wire',
  )
  assert.equal(
    brokenMatches.length,
    0,
    "wire (d) must fail on the exact drift shape 'tablist prop removed' — count must go from 1 → 0. If this stays at 1, the wire is toothless and cannot catch a screen-reader-group regression.",
  )
})

test('self-check: removing accessibilityRole="tab" from the sole Pressable makes wire (a) fail on the mutation', () => {
  const good = synthGoodSource()
  const broken = good.replace(/\s*accessibilityRole="tab"/, '')
  const strippedBroken = stripComments(broken)

  const pressables = strippedBroken.match(/<PlatformPressable\b/g) ?? []
  const roles = strippedBroken.match(/accessibilityRole\s*=\s*"tab"/g) ?? []
  assert.equal(
    pressables.length,
    1,
    'self-check baseline: synthetic broken source must still have one PlatformPressable — mutation was too aggressive',
  )
  assert.notEqual(
    roles.length,
    pressables.length,
    "wire (a)'s count-equality must fail when a Pressable is missing its accessibilityRole='tab' — otherwise the wire cannot detect the drift shape it was written for",
  )
})

test('self-check: regressing accessibilityState.selected to a bare literal makes wire (b) fail on the mutation', () => {
  const good = synthGoodSource()
  // Reproduce the pre-chunk-101 bug: hard-coded { selected: true } on
  // every tab. Wire (b)'s second pass rejects bare boolean literals.
  const broken = good.replace(
    'selected: isFocused',
    'selected: true',
  )
  const strippedBroken = stripComments(broken)
  const stateMatches =
    strippedBroken.match(
      /accessibilityState\s*=\s*\{\{\s*selected\s*:\s*([^}]+?)\s*\}\}/g,
    ) ?? []
  assert.equal(
    stateMatches.length,
    1,
    'self-check baseline: synthetic broken source must still have one accessibilityState prop',
  )
  const literalHit = stateMatches.some((m) =>
    /selected\s*:\s*(true|false)\s*\}\}/.test(m),
  )
  assert.equal(
    literalHit,
    true,
    'wire (b) must detect a bare true/false literal on accessibilityState.selected — otherwise the pre-chunk-101 "every tab announces as selected" regression slips through',
  )
})

test('self-check: regressing accessibilityHint to a static string with no interpolation makes wire (c) fail on the mutation', () => {
  const good = synthGoodSource()
  // Static hint — no ${...} interpolation. Wire (c)'s interpolation
  // check must reject this even though the "Switches to" phrase survives.
  const broken = good.replace(
    'accessibilityHint={`Switches to the ${displayLabel} section`}',
    'accessibilityHint={`Switches to another tab`}',
  )
  const strippedBroken = stripComments(broken)
  const hintMatches =
    strippedBroken.match(/accessibilityHint\s*=\s*\{`[^`]*`\}/g) ?? []
  assert.equal(
    hintMatches.length,
    1,
    'self-check baseline: synthetic broken source must still have one accessibilityHint prop',
  )
  const hint = hintMatches[0]
  // Confirm "Switches to" still matches (proves the drift is narrowly
  // scoped to interpolation, not phrasing) …
  assert.match(
    hint,
    /Switches to/,
    'self-check baseline: the mutated hint still contains "Switches to" — this proves wire (c)\'s phrase check alone would let the drift through',
  )
  // … and confirm the interpolation check correctly rejects the static
  // form. Neither displayLabel nor TAB_LABELS[...] appears.
  const interpolatesLabel =
    /\$\{\s*displayLabel\s*\}/.test(hint) ||
    /\$\{\s*TAB_LABELS\s*\[/.test(hint)
  assert.equal(
    interpolatesLabel,
    false,
    'wire (c) must reject a static accessibilityHint (no ${displayLabel} / ${TAB_LABELS[...]}) — otherwise every tab announces the same hint and diverges from the sighted label',
  )
})

test('self-check: stripComments blanks a line-commented tablist role, so wire (d) cannot be satisfied by a comment', () => {
  // Reproduce the chunk 98 v2 comment-drift shape for wire (d): if
  // someone leaves a commented-out `// accessibilityRole="tablist"`
  // above a deleted real one, a naive substring grep would still hit
  // the comment. stripComments must blank the whole line.
  const broken = [
    'function Container() {',
    '  return (',
    '    // accessibilityRole="tablist"',
    '    <View>',
    '      <PlatformPressable accessibilityRole="tab" />',
    '    </View>',
    '  );',
    '}',
  ].join('\n')
  const stripped = stripComments(broken)
  const tablistMatches =
    stripped.match(/accessibilityRole\s*=\s*"tablist"/g) ?? []
  assert.equal(
    tablistMatches.length,
    0,
    'stripComments must blank a line-commented `// accessibilityRole="tablist"` so wire (d) does not falsely see the role on a comment. If this fails, wire (d) is toothless against comment-out drift.',
  )
})
