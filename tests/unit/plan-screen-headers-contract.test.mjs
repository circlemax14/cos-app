// tests/unit/plan-screen-headers-contract.test.mjs — CHUNK 113 (2026-07-23)
//
// Source-drift trip wires for two orthogonal a11y/header contracts on the
// BPS Care Plan surface. Both landed as tiny prop edits with no visible
// diff at runtime — a silent regression on either one would strip a
// heading semantic (VoiceOver rotor stop) or drift the section title
// copy without producing any test-run failure.
//
// The two contracts this suite pins:
//
//   1. components/health-plan/BiopsychosocialPlanScreen.tsx
//      - SECTION_ORDER carries the three titles verbatim:
//          "Biological Wellness"
//          "Psychological Wellness"
//          "Social & Faith"      (chunk 74 rename — was "Social & Spiritual
//                                 Wellness" via chunks 59/62, renamed to
//                                 match Ken's shorter card copy at chunk 74)
//      - The "Self-Assessments" section header Text (chunk 57) carries
//        accessibilityRole="header" (chunk 105 addition — VoiceOver rotor
//        jump into the section carousel). Proximity check: role must appear
//        within N lines of the "Self-Assessments" text-content.
//      - Imports SectionCard from ./SectionCard.
//      - Every SECTION_ORDER entry ends up as a `title` prop to
//        <SectionCard title={...}> — i.e. this file is the source of the
//        three titles the header Text below will render.
//
//   2. components/health-plan/SectionCard.tsx
//      - The section-title Text has accessibilityRole="header" (chunk 90
//        preservation — cross-checked with chunk 109's
//        section-card-focus-fold-contract suite).
//      - The header Text renders `{title}` (or `props.title`) as its child
//        — i.e. the `title` prop is the source of the header label. If a
//        refactor swapped `{title}` for a hard-coded literal, the three
//        titles in SECTION_ORDER would silently detach from what users see.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / 103 / 107 / 109 pattern):
//   Both files pull in RN + @expo/vector-icons + tanstack query + the
//   full BPS component subtree. A behavioral mirror would need jsdom +
//   dozens of MB of stubs to observe a handful of static prop strings and
//   literal titles. Instead we read each .tsx as text, strip comments via
//   the shared helper (chunk 103), and grep for the literals the
//   chunk-90 / chunk-105 / chunk-74 contracts depend on. Same discipline as:
//     - tests/unit/section-card-focus-fold-contract.test.mjs  (chunk 109)
//     - tests/unit/trends-band-pill-a11y-contract.test.mjs    (chunk 107)
//     - tests/unit/wellbeing-card-a11y-labels.test.mjs        (chunk 103)
//     - tests/unit/notification-tap-handoff.test.mjs          (chunk 98 v2)
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on the source file, confirm the title / role change is
//   deliberate (e.g. Ken renamed "Social & Faith" back, or chunk 105 was
//   intentionally reverted), and only then update the wire in lockstep.
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

const BPS_SCREEN_TSX_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BiopsychosocialPlanScreen.tsx',
)
const SECTION_CARD_TSX_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'SectionCard.tsx',
)

const BPS_SCREEN_TSX_RAW = readFileSync(BPS_SCREEN_TSX_PATH, 'utf8')
const BPS_SCREEN_TSX = stripComments(BPS_SCREEN_TSX_RAW)

const SECTION_CARD_TSX_RAW = readFileSync(SECTION_CARD_TSX_PATH, 'utf8')
const SECTION_CARD_TSX = stripComments(SECTION_CARD_TSX_RAW)

// Chunk 74 rename catch: "Social & Faith" replaced the earlier "Social &
// Spiritual Wellness" copy shipped in chunks 59/62. If a merge silently
// reverted the rename, users would see the old header on the BPS surface
// again — visually noticeable to Ken, but no test-run signal today.
const SECTION_ORDER_TITLES = [
  'Biological Wellness',
  'Psychological Wellness',
  'Social & Faith',
]

// Proximity window for the "Self-Assessments" ↔ accessibilityRole="header"
// check. The shipped JSX puts the role prop 8 lines above the text-content
// child (opening tag → props → closing `>` → content). N=15 gives generous
// headroom for a future style-block edit that inserts a few lines between
// the role and the content while still catching a regression that moved
// the role fully out of the block.
const PROXIMITY_LINES = 15

// -------------------------------------------------------------------------
// (a) SECTION_ORDER titles present as literals in BiopsychosocialPlanScreen.tsx.
//
// Chunk 74 rename catch — if "Social & Faith" was reverted to "Social &
// Spiritual Wellness" (or renamed to anything else), the SectionCard
// header for that card would silently drift back to the old copy.
// -------------------------------------------------------------------------

test('(a) BiopsychosocialPlanScreen.tsx SECTION_ORDER carries the three verbatim titles', () => {
  for (const title of SECTION_ORDER_TITLES) {
    // Match a stringified title literal (single or double quotes) — we
    // intentionally do NOT anchor to SECTION_ORDER's array shape so that a
    // future refactor which threads the title through a const or a helper
    // still passes as long as the literal survives somewhere in the file
    // where a JSX/prop consumer can pick it up. That's strictly the
    // property this wire is defending: the copy string exists.
    const literalPattern = new RegExp(
      `['"\`]${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`,
    )
    assert.match(
      BPS_SCREEN_TSX,
      literalPattern,
      `BiopsychosocialPlanScreen.tsx must retain the literal "${title}" (chunk 74 rename catch — "Social & Faith" replaced "Social & Spiritual Wellness" at chunks 59/62; the other two titles have shipped since chunk 47). Without this literal, the corresponding SectionCard header renders the wrong copy.`,
    )
  }
})

// -------------------------------------------------------------------------
// (b) The "Self-Assessments" section header Text (chunk 57) has
//     accessibilityRole="header" (chunk 105) — proximity check.
//
// The shipped JSX in BiopsychosocialPlanScreen.tsx is a single Text
// element:
//   <Text
//     accessibilityRole="header"
//     style={{ color: ..., fontSize: ..., fontWeight: ..., marginLeft: 6 }}
//   >
//     Self-Assessments
//   </Text>
//
// The role appears above the child text-content because JSX attributes
// come before children. We locate the "Self-Assessments" child text and
// scan a symmetric window around it (both above and below, to be robust
// to a future style-block reorder that moves the role below the style
// prop or wraps the content in a fragment).
// -------------------------------------------------------------------------

test('(b) "Self-Assessments" Text has accessibilityRole="header" within ±N lines', () => {
  const lines = BPS_SCREEN_TSX.split('\n')

  // "Self-Assessments" appears in the shipped file exactly once as JSX
  // text-content (the section header child) — the string also appears
  // inside comments (chunk 57/59/86 prose) but stripComments has blanked
  // those out already. Anchor on the JSX-content occurrence: a line whose
  // trimmed content starts with the exact literal (indented Text child)
  // or contains it as a template combining piece. This tolerates a future
  // refactor that wraps the copy in a `${…}` interpolation.
  const literal = 'Self-Assessments'
  const contentLineIdxs = []
  for (let i = 0; i < lines.length; i++) {
    // Match a line whose non-comment content contains the literal AS
    // JSX text-content — i.e. not inside a string/attribute assignment.
    // Heuristic: the literal appears on the line AND the line does NOT
    // look like an `accessibilityLabel=...Self-Assessments` binding
    // (JSX child text lines don't carry an `=` immediately before the
    // literal). This is intentionally narrow to avoid false-matching on
    // future accessibility-label additions.
    if (!lines[i].includes(literal)) continue
    // Reject attribute-value shapes like `accessibilityLabel="Self-Assessments"`
    // or `something="Self-Assessments"` — those aren't the child text-content.
    if (/=\s*["'`][^"'`]*Self-Assessments[^"'`]*["'`]/.test(lines[i])) continue
    contentLineIdxs.push(i)
  }

  assert.ok(
    contentLineIdxs.length > 0,
    'BiopsychosocialPlanScreen.tsx must retain the "Self-Assessments" section header text-content (chunk 57 port of the Health Trends carousel). If the string is gone entirely, the section header disappeared with it — check for an intentional rename in lockstep with a wire update.',
  )

  // For each candidate content line, look for accessibilityRole="header"
  // within a symmetric ±PROXIMITY_LINES window. The check passes as
  // long as at least one occurrence of "Self-Assessments" sits inside a
  // block that also carries the role — chunk 105's exact contract.
  const rolePattern = /accessibilityRole\s*=\s*["']header["']/
  let matched = false
  for (const idx of contentLineIdxs) {
    const lo = Math.max(0, idx - PROXIMITY_LINES)
    const hi = Math.min(lines.length, idx + PROXIMITY_LINES + 1)
    const windowSrc = lines.slice(lo, hi).join('\n')
    if (rolePattern.test(windowSrc)) {
      matched = true
      break
    }
  }
  assert.equal(
    matched,
    true,
    `BiopsychosocialPlanScreen.tsx: the "Self-Assessments" section header Text must carry accessibilityRole="header" within ±${PROXIMITY_LINES} lines (chunk 105 addition — VoiceOver rotor jump into the Self-Assessments carousel). Without the role, VoiceOver users can no longer rotor-navigate to this section header.`,
  )
})

// -------------------------------------------------------------------------
// (c) SectionCard.tsx: the header Text carries accessibilityRole="header".
//
// Cross-check with chunk 109's section-card-focus-fold-contract suite —
// both wires guard the same prop from opposite angles. Chunk 109 pins the
// role AND the isFocus label composition; this wire pins the role in
// isolation so a future edit that removes ONLY the role (leaving the
// isFocus copy intact) still fails at least one of the two suites.
// -------------------------------------------------------------------------

test('(c) SectionCard.tsx header Text has accessibilityRole="header"', () => {
  assert.match(
    SECTION_CARD_TSX,
    /accessibilityRole\s*=\s*["']header["']/,
    'SectionCard.tsx must retain accessibilityRole="header" on the section-title Text (chunk 90). Without it, VoiceOver drops the heading rotor semantic and users cannot jump between the three BPS section cards by heading. Cross-checked with chunk 109\'s section-card-focus-fold-contract suite.',
  )
})

// -------------------------------------------------------------------------
// (d) SectionCard.tsx: the `title` prop is the source of the header
//     label — the header Text renders `{title}` (or `props.title`) as
//     its child.
//
// If a refactor swapped `{title}` for a hard-coded literal (or a lookup
// on `sectionKey`), the three titles carried in SECTION_ORDER would
// silently detach from what users see — the (a) wire above would still
// pass while the surface drifted underneath.
// -------------------------------------------------------------------------

test('(d) SectionCard.tsx header Text renders `{title}` (or `props.title`) as its child', () => {
  // Look for the JSX child shape `>{title}</Text>` or `>{props.title}</Text>`
  // — the closing `>` of the opening tag, then the child expression, then
  // the closing tag. Tolerant of whitespace/newlines around the identifier.
  const childPattern =
    />\s*\{\s*(?:props\.)?title\s*\}\s*<\/Text>/
  assert.match(
    SECTION_CARD_TSX,
    childPattern,
    'SectionCard.tsx must render the `title` prop as the header Text child (i.e. `<Text ...>{title}</Text>` or `{props.title}`). If a hard-coded literal is substituted, the three SECTION_ORDER titles in BiopsychosocialPlanScreen.tsx will silently detach from what users see on the BPS surface.',
  )
})

// -------------------------------------------------------------------------
// Cross-reference (e): BiopsychosocialPlanScreen.tsx imports SectionCard
// from ./SectionCard.
//
// Sanity anchor for the (d) contract — if the screen stopped importing
// SectionCard, its `title` prop no longer feeds the rendered header even
// if wires (a) and (d) both pass. We match the destructured named import
// pattern shipped today: `import { SectionCard, SECTION_STYLE, type ... }`.
// -------------------------------------------------------------------------

test('(e) BiopsychosocialPlanScreen.tsx imports SectionCard from ./SectionCard', () => {
  // Accept any named import from a path ending in "./SectionCard" (or
  // "./SectionCard.tsx") — permissive to a future re-export shim.
  const importPattern =
    /import\s*\{[^}]*\bSectionCard\b[^}]*\}\s*from\s*['"]\.\/SectionCard(?:\.tsx)?['"]/
  assert.match(
    BPS_SCREEN_TSX,
    importPattern,
    'BiopsychosocialPlanScreen.tsx must retain a named `SectionCard` import from "./SectionCard". Without it, the three SECTION_ORDER titles are dead literals with no consumer — a silent surface break the (a) wire alone cannot catch.',
  )
})

// -------------------------------------------------------------------------
// Cross-reference (f): each SECTION_ORDER title is passed as the `title`
// prop to a <SectionCard> in the same file.
//
// The shipped shape (see BiopsychosocialPlanScreen.tsx around L1839) is:
//   {SECTION_ORDER.map(({ key, title }) => (
//     <View key={key} onLayout={...}>
//       <SectionCard
//         sectionKey={key}
//         title={title}
//         ...
//
// So the wire looks for `<SectionCard` followed by any prop chunk that
// includes `title={` — the identifier or expression is fed from the map's
// destructured `title`. We deliberately don't try to statically link the
// literal strings back to this JSX (they flow through SECTION_ORDER's
// destructure), but we DO assert the plumbing exists at all: a
// <SectionCard title={…}> call site is present, and SECTION_ORDER is
// mapped somewhere in the file.
// -------------------------------------------------------------------------

test('(f) SECTION_ORDER entries end up as `title` props to <SectionCard>', () => {
  // 1. A <SectionCard ... title={...}> call site exists. Permissive on
  //    prop ordering (title may not be the first prop) — we look for the
  //    JSX open tag then scan for `title={` inside the same tag body.
  const sectionCardTitlePattern =
    /<SectionCard\b[\s\S]*?\btitle\s*=\s*\{[\s\S]*?\}[\s\S]*?\/?>/
  assert.match(
    BPS_SCREEN_TSX,
    sectionCardTitlePattern,
    'BiopsychosocialPlanScreen.tsx must call <SectionCard title={...}> with the `title` prop bound (currently threaded from SECTION_ORDER.map). If the prop is removed, the SectionCard header falls back to nothing and the three chunk-74 titles never reach the screen.',
  )

  // 2. SECTION_ORDER is mapped over — the plumbing that carries the
  //    three titles into the <SectionCard title={...}> call site.
  //    Permissive on the destructure shape: `.map((entry) =>`,
  //    `.map(({ key, title }) =>`, etc.
  assert.match(
    BPS_SCREEN_TSX,
    /SECTION_ORDER\s*\.\s*map\s*\(/,
    'BiopsychosocialPlanScreen.tsx must retain `SECTION_ORDER.map(...)` iteration. Without the map, the three verbatim titles are dead literals — no consumer, no <SectionCard title={...}> binding, no rendered header.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 / 107 / 109 discipline — prove the
// trap snaps shut).
//
// These tests do NOT read the live .tsx files. They exercise the exact
// patterns above against synthetic sources whose SOLE PURPOSE is to
// reproduce the drift shape each wire is meant to catch. If ANY of these
// self-checks flip green when the drift is present, the corresponding
// wire above is toothless.
// =========================================================================

test('self-check: wire (a) fails when "Social & Faith" is renamed to "Social & Spiritual Wellness"', () => {
  // Synthetic SECTION_ORDER where the chunk-74 rename was silently reverted
  // back to the chunks-59/62 copy. Wire (a)'s literal check for
  // "Social & Faith" must NOT match this fixture — that's how the wire
  // catches the rename regression.
  const brokenSrc = [
    "const SECTION_ORDER = [",
    "  { key: 'biological', title: 'Biological Wellness' },",
    "  { key: 'psychological', title: 'Psychological Wellness' },",
    // Rename target: "Social & Faith" reverted to "Social & Spiritual Wellness"
    "  { key: 'social', title: 'Social & Spiritual Wellness' },",
    "];",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const literalPattern = new RegExp(
    `['"\`]${'Social & Faith'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`,
  )
  assert.equal(
    literalPattern.test(stripped),
    false,
    'self-check: wire (a) must NOT match a source where "Social & Faith" was renamed to "Social & Spiritual Wellness". If this flips true, wire (a) cannot detect the exact chunk-74 rename regression it exists to catch.',
  )
})

test('self-check: wire (b) fails when accessibilityRole="header" is dropped from the Self-Assessments Text', () => {
  // Synthetic Self-Assessments section header WITHOUT the role prop.
  // Wire (b)'s proximity check must fail against this stripped fixture.
  // Note: no other accessibilityRole="header" appears in the window,
  // so a false-positive from an unrelated header nearby is impossible.
  const brokenSrc = [
    '<View style={styles.selfAssessmentsHeader}>',
    '  <MaterialIcons name="assignment" />',
    '  <Text',
    // accessibilityRole="header" intentionally removed
    '    style={{ color: colors.text, fontSize: 15, fontWeight: 700 }}',
    '  >',
    '    Self-Assessments',
    '  </Text>',
    '</View>',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const lines = stripped.split('\n')
  const literal = 'Self-Assessments'
  const rolePattern = /accessibilityRole\s*=\s*["']header["']/

  const contentLineIdxs = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(literal)) continue
    if (/=\s*["'`][^"'`]*Self-Assessments[^"'`]*["'`]/.test(lines[i])) continue
    contentLineIdxs.push(i)
  }
  assert.ok(
    contentLineIdxs.length > 0,
    'self-check fixture must contain the "Self-Assessments" child text for the wire to have anything to anchor on. If this fails, the self-check itself is broken.',
  )

  let matched = false
  for (const idx of contentLineIdxs) {
    const lo = Math.max(0, idx - PROXIMITY_LINES)
    const hi = Math.min(lines.length, idx + PROXIMITY_LINES + 1)
    const windowSrc = lines.slice(lo, hi).join('\n')
    if (rolePattern.test(windowSrc)) {
      matched = true
      break
    }
  }
  assert.equal(
    matched,
    false,
    'self-check: wire (b) must NOT match a source that dropped accessibilityRole="header" from the "Self-Assessments" Text block. If this flips true, wire (b) cannot detect the exact chunk-105 rotor-semantic regression it exists to catch.',
  )
})

test('self-check: wire (c) fails when accessibilityRole="header" is dropped from the SectionCard header Text', () => {
  // Synthetic SectionCard header Text WITHOUT the role prop. Wire (c)'s
  // simple match assertion must fail against this stripped fixture.
  // The fixture also strips the FOCUS pill's role/label to make sure the
  // check doesn't false-match against an unrelated accessibilityRole
  // elsewhere in the module (chunk 90 fold pins the pill's role to
  // "text"/"button" in its own trip wire, but a defensive fixture keeps
  // this self-check isolated to the header contract).
  const brokenSrc = [
    '<Text',
    // accessibilityRole="header" intentionally removed
    '  accessibilityLabel={isFocus ? `${title}, Focus area, prioritized this week` : title}',
    '  style={{ color: text, fontSize: 19, fontWeight: 800 }}',
    '  numberOfLines={2}',
    '>',
    '  {title}',
    '</Text>',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.equal(
    /accessibilityRole\s*=\s*["']header["']/.test(stripped),
    false,
    'self-check: wire (c) must NOT match a source that removed accessibilityRole="header" from the SectionCard header Text. If this flips true, wire (c) cannot detect the exact rotor-semantic regression it exists to catch (cross-checked with chunk 109).',
  )
})
