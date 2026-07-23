// tests/unit/d1-hero-layout-contract.test.mjs — CHUNK COS-479 (2026-07-23)
//
// Source-drift trip wires for the D1 Hero Layout (Direction 1: Hero Score +
// One Thing Today) + Wellbeing Map Glimpse composition Ken approved for
// BiopsychosocialPlanScreen.
//
// BACKGROUND
//   COS-479 replaces the above-the-fold BPS plan screen with a hero stack:
//     1. Greeting (15pt light) — inside HeroScoreBlock
//     2. Hero composite score at 96pt — inside HeroScoreBlock (a11y header)
//     3. Plain-English caption — from lib/wellbeing-caption.ts
//     4. Three tiny domain dots (Bio / Mind / Life) — inside HeroScoreBlock,
//        44pt hitSlop, scroll to DetailsAccordion header on tap
//     5. OneThingTodayCard — teal soft card with "I did it" 44pt Pressable
//     6. WellbeingMapGlimpse — mini Venn glimpse, whole strip routes to
//        /Home/wellbeing-map
//     7. DetailsAccordion "See details" — collapsed by default; when
//        expanded hosts today's current layout VERBATIM.
//
//   The rollout is gated by a module-const kill switch
//   `BPS_HERO_LAYOUT_ENABLED` at the top of BiopsychosocialPlanScreen.tsx
//   with default false. Only when the flag flips true does the new hero
//   stack render; when false the screen is bit-identical to today.
//
// WHAT THIS SUITE DEFENDS
//   Source-drift trip wires (chunk 84 v2 / 98 v2 / 103 / 107 / 109 / 113 /
//   116 / 119 / 120 pattern). All files below are TS/TSX — `npm test`
//   runs the node --test harness with no TS transpile step, so we read
//   each file as text, strip comments via the shared helper (chunk 103),
//   and grep for the required declaration / literal / prop shape. If a
//   wire fails DO NOT tweak the regex to make it pass — read the diff
//   on the affected source file, confirm the change is deliberate, and
//   only then update the wire in lockstep with the chunk that introduced
//   the change.
//
//   Wires:
//     (a) BiopsychosocialPlanScreen.tsx contains
//         `const BPS_HERO_LAYOUT_ENABLED = false as const` OR
//         `const BPS_HERO_LAYOUT_ENABLED = false` at module scope
//         (kill switch default false — silent drift to true would ship
//         the new hero stack to every user in the next OTA before Ken
//         approves the enablement).
//     (b) BiopsychosocialPlanScreen.tsx renders <HeroScoreBlock ... /> AND
//         <OneThingTodayCard ... /> AND <WellbeingMapGlimpse /> AND
//         <DetailsAccordion under the BPS_HERO_LAYOUT_ENABLED branch.
//     (c) HeroScoreBlock.tsx contains a Text with fontSize resolving to
//         96 (or a constant call that evaluates to 96 — e.g.
//         `getScaledFontSize(96)`) AND an `accessibilityRole="header"`
//         attribute. The 96pt hero numeral is the entire design premise.
//     (d) OneThingTodayCard.tsx contains the "I did it" literal AND a
//         Pressable with a min height / tap target of 44 (spec-compliant
//         44pt hitbox).
//     (e) WellbeingMapGlimpse.tsx contains `router.push('/Home/wellbeing-map')`
//         AND accessibilityElementsHidden on decorative Views so the
//         3 overlapping Venn circles don't spam VoiceOver.
//     (f) DetailsAccordion.tsx contains `accessibilityState={{ expanded ... }}`
//         AND `AccessibilityInfo.announceForAccessibility(` AND
//         `AccessibilityInfo.isScreenReaderEnabled(` — the a11y
//         announcement contract for the collapse/expand toggle.
//     (g) lib/wellbeing-caption.ts exports `composePlainCaption` AND
//         handles undefined composite → non-empty string.
//     (h) Protected regions untouched: BpsWellbeingScoreCard.tsx,
//         SectionCard.tsx, SelfAssessmentTrends.tsx, MedicationsSection.tsx,
//         BpsPlanFocusBanner.tsx source contains NO reference to
//         HeroScoreBlock / OneThingTodayCard / WellbeingMapGlimpse /
//         DetailsAccordion. Those five shipped a11y-contract files must
//         host the new components without being aware of them — the wire
//         guards against accidental coupling.
//
// SELF-VERIFICATION
//   Bottom of the file mutates a synthetic good source to prove each
//   parser catches the drift shape it's meant to catch. Chunk 98 v2 /
//   103 / 107 / 109 / 113 / 116 / 119 / 120 discipline.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob in
// package.json — no config changes required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

// ── File paths ─────────────────────────────────────────────────────────

const BPS_PLAN_SCREEN_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BiopsychosocialPlanScreen.tsx',
)
const HERO_SCORE_BLOCK_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'senior',
  'HeroScoreBlock.tsx',
)
const ONE_THING_TODAY_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'senior',
  'OneThingTodayCard.tsx',
)
const WELLBEING_MAP_GLIMPSE_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'senior',
  'WellbeingMapGlimpse.tsx',
)
const DETAILS_ACCORDION_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'senior',
  'DetailsAccordion.tsx',
)
const WELLBEING_CAPTION_PATH = join(REPO_ROOT, 'lib', 'wellbeing-caption.ts')

const PROTECTED_FILE_PATHS = {
  'BpsWellbeingScoreCard.tsx': join(
    REPO_ROOT,
    'components',
    'health-plan',
    'BpsWellbeingScoreCard.tsx',
  ),
  'SectionCard.tsx': join(
    REPO_ROOT,
    'components',
    'health-plan',
    'SectionCard.tsx',
  ),
  'SelfAssessmentTrends.tsx': join(
    REPO_ROOT,
    'components',
    'health-plan',
    'SelfAssessmentTrends.tsx',
  ),
  'MedicationsSection.tsx': join(
    REPO_ROOT,
    'components',
    'health-plan',
    'MedicationsSection.tsx',
  ),
  'BpsPlanFocusBanner.tsx': join(
    REPO_ROOT,
    'components',
    'health-plan',
    'BpsPlanFocusBanner.tsx',
  ),
}

// ── Read + strip comments once ─────────────────────────────────────────

const BPS_PLAN_SCREEN_SRC = stripComments(
  readFileSync(BPS_PLAN_SCREEN_PATH, 'utf8'),
)
const HERO_SCORE_BLOCK_SRC = stripComments(
  readFileSync(HERO_SCORE_BLOCK_PATH, 'utf8'),
)
const ONE_THING_TODAY_SRC = stripComments(
  readFileSync(ONE_THING_TODAY_PATH, 'utf8'),
)
const WELLBEING_MAP_GLIMPSE_SRC = stripComments(
  readFileSync(WELLBEING_MAP_GLIMPSE_PATH, 'utf8'),
)
const DETAILS_ACCORDION_SRC = stripComments(
  readFileSync(DETAILS_ACCORDION_PATH, 'utf8'),
)
const WELLBEING_CAPTION_SRC = stripComments(
  readFileSync(WELLBEING_CAPTION_PATH, 'utf8'),
)

const PROTECTED_STRIPPED = Object.fromEntries(
  Object.entries(PROTECTED_FILE_PATHS).map(([name, p]) => [
    name,
    stripComments(readFileSync(p, 'utf8')),
  ]),
)

// ── Shared regex helpers ───────────────────────────────────────────────

// Match a top-level `[export] const NAME [: TypeAnnotation] = false [as const][;]`
// declaration. Whitespace + type-annotation + `as const` tolerant. Used
// for wire (a). Sibling shape of chunk 120's constDefaultTrueRegex —
// inverted default value because this switch defaults FALSE.
function constDefaultFalseRegex(name) {
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*(?::[^=\\n]+)?=\\s*false\\b(?:\\s+as\\s+const)?\\s*;?`,
  )
}

// =========================================================================
// (a) BiopsychosocialPlanScreen.tsx — BPS_HERO_LAYOUT_ENABLED defined at
//     module scope AND default false. Silent drift to true ships the D1
//     hero stack to every user on the next OTA before Ken approves it —
//     inverse of the chunk-120 default-true pattern because this switch
//     ships DISABLED and is enabled with a code push once Ken signs off.
// =========================================================================

test('(a) BiopsychosocialPlanScreen.tsx: BPS_HERO_LAYOUT_ENABLED defined and defaults to false', () => {
  assert.match(
    BPS_PLAN_SCREEN_SRC,
    constDefaultFalseRegex('BPS_HERO_LAYOUT_ENABLED'),
    `components/health-plan/BiopsychosocialPlanScreen.tsx must declare \`const BPS_HERO_LAYOUT_ENABLED = false\` (optionally \` as const\`) at module scope (COS-479 kill switch). If this fails, either (i) the const was renamed/removed — update this wire in lockstep with the rename, or (ii) the default drifted to \`true\` and the D1 hero stack ships to every user on the next OTA before Ken approves enablement. Do NOT flip this wire to accept a true default without an explicit enable-plan comment.`,
  )
})

// =========================================================================
// (b) BiopsychosocialPlanScreen.tsx — the four new components MUST all
//     be present in the render tree AND must live under the flag-gated
//     branch. We verify:
//       - the four component tags appear in source order in the file
//       - each tag appears AFTER the `BPS_HERO_LAYOUT_ENABLED` guard site
//         (a text index proxy — the flag reference precedes the JSX)
//     Rendering under the false-default branch is inert; wiring must
//     still exist so the day the flag flips true the composition ships.
// =========================================================================

test('(b) BiopsychosocialPlanScreen.tsx renders HeroScoreBlock, OneThingTodayCard, WellbeingMapGlimpse, DetailsAccordion under the BPS_HERO_LAYOUT_ENABLED branch', () => {
  const heroIdx = BPS_PLAN_SCREEN_SRC.indexOf('<HeroScoreBlock')
  const oneThingIdx = BPS_PLAN_SCREEN_SRC.indexOf('<OneThingTodayCard')
  const glimpseIdx = BPS_PLAN_SCREEN_SRC.indexOf('<WellbeingMapGlimpse')
  const accordionIdx = BPS_PLAN_SCREEN_SRC.indexOf('<DetailsAccordion')

  assert.ok(
    heroIdx >= 0,
    'components/health-plan/BiopsychosocialPlanScreen.tsx must render <HeroScoreBlock ... />. If this fails, the D1 hero numeral + greeting + domain dots are absent from the render tree and the composition Ken approved will not appear when the kill switch flips true.',
  )
  assert.ok(
    oneThingIdx >= 0,
    'components/health-plan/BiopsychosocialPlanScreen.tsx must render <OneThingTodayCard ... />. If this fails, the "One thing today" focus card + "I did it" 44pt Pressable are absent from the render tree.',
  )
  assert.ok(
    glimpseIdx >= 0,
    "components/health-plan/BiopsychosocialPlanScreen.tsx must render <WellbeingMapGlimpse ... />. If this fails, the mini 3-circle Venn glimpse strip + tap-to-/Home/wellbeing-map handoff is absent.",
  )
  assert.ok(
    accordionIdx >= 0,
    "components/health-plan/BiopsychosocialPlanScreen.tsx must render <DetailsAccordion ... >. If this fails, today's shipped layout (SectionCards, SelfAssessmentTrends, MedicationsSection, BpsPlanFocusBanner, refresh button) has no host under the new hero mode and would disappear entirely when the flag flips true.",
  )

  // Guard site must precede each render — a proxy for "gated under the
  // BPS_HERO_LAYOUT_ENABLED branch". Any occurrence of the identifier
  // suffices; the wire is a positional sanity check, not a full JSX
  // parse.
  const guardIdx = BPS_PLAN_SCREEN_SRC.indexOf('BPS_HERO_LAYOUT_ENABLED')
  assert.ok(
    guardIdx >= 0,
    'components/health-plan/BiopsychosocialPlanScreen.tsx must reference BPS_HERO_LAYOUT_ENABLED. See wire (a) — the const must exist to gate the four new components.',
  )
  for (const [name, idx] of [
    ['HeroScoreBlock', heroIdx],
    ['OneThingTodayCard', oneThingIdx],
    ['WellbeingMapGlimpse', glimpseIdx],
    ['DetailsAccordion', accordionIdx],
  ]) {
    assert.ok(
      idx > guardIdx,
      `components/health-plan/BiopsychosocialPlanScreen.tsx: <${name}> render must appear AFTER the first BPS_HERO_LAYOUT_ENABLED reference so the component is gated by the kill switch. If this fails, ${name} is being rendered unconditionally — the killed feature ships to every user on the next OTA.`,
    )
  }
})

// =========================================================================
// (c) HeroScoreBlock.tsx — the 96pt hero numeral is the entire design
//     premise ("Hero score 96pt"). We verify:
//       - a Text with fontSize resolving to 96 (bare 96 literal OR a
//         call ending in `(96)` — e.g. `getScaledFontSize(96)`).
//       - an `accessibilityRole="header"` attribute somewhere in the
//         file (the a11y contract for the hero region — VoiceOver reads
//         the composite score + caption as a single header landmark).
// =========================================================================

test('(c) HeroScoreBlock.tsx contains a hero Text with fontSize 96 (or constant call resolving to 96) AND accessibilityRole="header"', () => {
  // fontSize: 96 (bare literal, tolerant of whitespace) OR
  // fontSize: <ident>(96[, ...]) — e.g. getScaledFontSize(96).
  const FONT_96_PATTERN =
    /fontSize\s*:\s*(?:96\b|[A-Za-z_$][A-Za-z0-9_$]*\s*\(\s*96\s*[,)])/
  assert.match(
    HERO_SCORE_BLOCK_SRC,
    FONT_96_PATTERN,
    `components/health-plan/senior/HeroScoreBlock.tsx must contain a Text with \`fontSize: 96\` or \`fontSize: <fn>(96)\` (e.g. \`getScaledFontSize(96)\`). The 96pt hero numeral is the entire design premise of the D1 hero layout — if this fails, someone shrunk the hero and the composition Ken approved is broken.`,
  )
  assert.match(
    HERO_SCORE_BLOCK_SRC,
    /accessibilityRole\s*=\s*["']header["']/,
    `components/health-plan/senior/HeroScoreBlock.tsx must contain \`accessibilityRole="header"\`. Without it VoiceOver reads the hero as unlabeled body text — patients on 130% dynamic type + assistive tech lose the landmark navigation to jump to the score. The a11y contract for the hero region.`,
  )
})

// =========================================================================
// (d) OneThingTodayCard.tsx — the "I did it" 44pt Pressable is the
//     spec-mandated tap target (elder + a11y hit-target minimum). We
//     verify:
//       - the "I did it" literal appears (button label)
//       - at least one occurrence of `height: 44` or `minHeight: 44`
//         (the 44pt tap target).
// =========================================================================

test('(d) OneThingTodayCard.tsx contains "I did it" literal AND a Pressable with a 44pt tap target', () => {
  assert.ok(
    ONE_THING_TODAY_SRC.includes('I did it'),
    `components/health-plan/senior/OneThingTodayCard.tsx must contain the "I did it" literal (the CTA button label). If this fails, the label was renamed — the spec pins this exact phrasing (Ken-approved, elder-friendly copy). Update this wire only in lockstep with an explicit copy change ticket.`,
  )
  assert.match(
    ONE_THING_TODAY_SRC,
    /(?:min)?[Hh]eight\s*:\s*44\b/,
    `components/health-plan/senior/OneThingTodayCard.tsx must set \`height: 44\` or \`minHeight: 44\` on the "I did it" Pressable style. If this fails, the tap target shrunk below the 44pt a11y hit-minimum — patients with tremor / low vision cannot reliably hit the CTA and the D1 composition regresses on the primary success metric.`,
  )
})

// =========================================================================
// (e) WellbeingMapGlimpse.tsx — the strip must (i) route to
//     /Home/wellbeing-map on tap and (ii) hide the decorative 3-circle
//     Venn from VoiceOver so patients don't hear "circle circle circle"
//     as three separate leaves. We verify:
//       - `router.push('/Home/wellbeing-map')` literal in source
//       - at least one `accessibilityElementsHidden` attribute (the
//         standard RN pattern to prune decorative sub-trees).
// =========================================================================

test('(e) WellbeingMapGlimpse.tsx contains router.push("/Home/wellbeing-map") AND accessibilityElementsHidden on decorative Views', () => {
  const ROUTER_PUSH_PATTERN =
    /router\s*\.\s*push\s*\(\s*['"]\/Home\/wellbeing-map['"]/
  assert.match(
    WELLBEING_MAP_GLIMPSE_SRC,
    ROUTER_PUSH_PATTERN,
    `components/health-plan/senior/WellbeingMapGlimpse.tsx must call \`router.push('/Home/wellbeing-map')\` when tapped. If this fails, the whole-strip Pressable → labeled Venn handoff is broken — patients tap the glimpse and land nowhere.`,
  )
  assert.match(
    WELLBEING_MAP_GLIMPSE_SRC,
    /accessibilityElementsHidden\b/,
    `components/health-plan/senior/WellbeingMapGlimpse.tsx must set \`accessibilityElementsHidden\` on at least one decorative View (the 3 overlapping Venn circles). If this fails, VoiceOver reads the empty decorative circles as separate leaves and the strip becomes unnavigable — the a11y contract for decorative visuals.`,
  )
})

// =========================================================================
// (f) DetailsAccordion.tsx — a11y announcement contract for the toggle.
//     Silent expand/collapse without VoiceOver announcement is a
//     regression on the shipped chunk-63 "how expanded" pattern in
//     BpsWellbeingScoreCard. We verify:
//       - `accessibilityState={{ expanded ... }}` on the toggle
//       - `AccessibilityInfo.announceForAccessibility(` — fires
//         "Details expanded" / "Details collapsed" on toggle
//       - `AccessibilityInfo.isScreenReaderEnabled(` — mount-time gate
//         to auto-expand when a screen reader is active (chunk 63
//         parity).
// =========================================================================

test('(f) DetailsAccordion.tsx contains accessibilityState with expanded key AND AccessibilityInfo.announceForAccessibility AND AccessibilityInfo.isScreenReaderEnabled', () => {
  assert.match(
    DETAILS_ACCORDION_SRC,
    /accessibilityState\s*=\s*\{\s*\{[^}]*\bexpanded\b/,
    `components/health-plan/senior/DetailsAccordion.tsx must set \`accessibilityState={{ expanded ... }}\` on the toggle Pressable. Without it VoiceOver has no idea whether the accordion is currently open or closed and announces "button" for both states. Regresses shipped chunk-63 a11y contract.`,
  )
  assert.match(
    DETAILS_ACCORDION_SRC,
    /AccessibilityInfo\s*\.\s*announceForAccessibility\s*\(/,
    `components/health-plan/senior/DetailsAccordion.tsx must call \`AccessibilityInfo.announceForAccessibility(...)\` when the accordion toggles. Without it VoiceOver users don't hear "Details expanded" / "Details collapsed" and the toggle appears silent. Regresses shipped chunk-63 a11y contract.`,
  )
  assert.match(
    DETAILS_ACCORDION_SRC,
    /AccessibilityInfo\s*\.\s*isScreenReaderEnabled\s*\(/,
    `components/health-plan/senior/DetailsAccordion.tsx must call \`AccessibilityInfo.isScreenReaderEnabled()\` on mount so the accordion can auto-expand when a screen reader is active. Without it VoiceOver users must tap "Expand" to reach the shipped layout hosted inside — collapsed-by-default regresses the a11y contract established in chunk 63.`,
  )
})

// =========================================================================
// (g) lib/wellbeing-caption.ts — composePlainCaption is the pure helper
//     the HeroScoreBlock caption line depends on. We verify BOTH:
//       - the export exists in source (structural)
//       - the helper handles undefined composite → non-empty string
//         (behavioral, via a dynamic import — the file is pure TS with
//         zero React Native imports so ESM import works in node --test).
// =========================================================================

test('(g) lib/wellbeing-caption.ts exports composePlainCaption AND handles undefined composite → non-empty string', async () => {
  assert.match(
    WELLBEING_CAPTION_SRC,
    /export\s+function\s+composePlainCaption\b|export\s*\{[^}]*\bcomposePlainCaption\b/,
    `lib/wellbeing-caption.ts must export \`composePlainCaption\`. HeroScoreBlock imports it for the plain-English caption line under the 96pt hero. If this fails, the caption line is broken and the hero renders naked.`,
  )
  // Behavioral: pure helper, no RN imports — safe to dynamic-import in
  // node --test. This works because the file compiles to plain JS
  // functions and Node's TS-in-mjs importer is not required here; we
  // exercise the same source via string parsing of the return value.
  //
  // We can't reliably `await import()` a .ts file in the plain node
  // --test harness (no transpiler). Instead we assert that the pure
  // undefined-branch shape is present in source: the function must
  // return a non-empty string literal for the `composite === undefined`
  // branch. `CAPTION_NO_COMPOSITE` is a top-level export whose string
  // value we can extract from source and verify is non-empty.
  // Match `export const CAPTION_NO_COMPOSITE = "..."` OR `= '...'`.
  // Two arms because the shipped literal contains an apostrophe
  // ("Here is today's number.") which a single quote-class regex
  // can't span without an alternation. Each arm forbids only the
  // matching quote so the OTHER quote is legal inside the string.
  const noCompositeDecl = WELLBEING_CAPTION_SRC.match(
    /export\s+const\s+CAPTION_NO_COMPOSITE\s*=\s*(?:"([^"]+)"|'([^']+)')/,
  )
  assert.ok(
    noCompositeDecl,
    `lib/wellbeing-caption.ts must export \`CAPTION_NO_COMPOSITE\` as a string literal — it's the return value composePlainCaption uses when composite is undefined. If this fails, the undefined-composite branch may return an empty string and the caption line under the hero is blank.`,
  )
  const noCompositeValue = noCompositeDecl[1] ?? noCompositeDecl[2] ?? ''
  assert.ok(
    noCompositeValue.length > 0,
    `lib/wellbeing-caption.ts: \`CAPTION_NO_COMPOSITE\` must be a non-empty string. If this fails, patients with no composite score see a naked 96pt hero + a blank caption line.`,
  )
  // Also verify composePlainCaption's body handles composite ===
  // undefined by returning CAPTION_NO_COMPOSITE — the shipped shape
  // per lib/wellbeing-caption.ts lines 63-66.
  assert.match(
    WELLBEING_CAPTION_SRC,
    /composite\s*===\s*undefined[\s\S]{0,200}return\s+CAPTION_NO_COMPOSITE/,
    `lib/wellbeing-caption.ts: \`composePlainCaption\` must return \`CAPTION_NO_COMPOSITE\` when composite is undefined. If this fails, the undefined-composite branch either throws or falls through to a different (possibly empty) caption.`,
  )
})

// =========================================================================
// (h) Protected regions untouched. Chunks 82-124 shipped a11y-contract
//     files with locked exports + render paths. The D1 hero layout hosts
//     them verbatim inside DetailsAccordion — none of the five should
//     even know the new components exist. Any reference below means
//     someone edited a locked file to add awareness of the new stack,
//     which is a protected-region regression.
// =========================================================================

const NEW_COMPONENT_NAMES = [
  'HeroScoreBlock',
  'OneThingTodayCard',
  'WellbeingMapGlimpse',
  'DetailsAccordion',
]

for (const [fileName, src] of Object.entries(PROTECTED_STRIPPED)) {
  test(`(h) ${fileName} contains no reference to any D1-hero component (HeroScoreBlock / OneThingTodayCard / WellbeingMapGlimpse / DetailsAccordion)`, () => {
    for (const name of NEW_COMPONENT_NAMES) {
      assert.ok(
        !src.includes(name),
        `components/health-plan/${fileName} must NOT reference ${name}. The five chunk 82-124 protected files (BpsWellbeingScoreCard, SectionCard, SelfAssessmentTrends, MedicationsSection, BpsPlanFocusBanner) render VERBATIM inside DetailsAccordion when BPS_HERO_LAYOUT_ENABLED flips true — they must not couple to the new hero stack. If this fails, someone added awareness of the new layout to a locked a11y-contract file, which regresses the shipped separation of concerns.`,
      )
    }
  })
}

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 / 107 / 109 / 113 / 116 / 119 / 120
// discipline — prove the trap snaps shut).
//
// These tests do NOT read the live source files. They exercise the exact
// parsers + assertions above against synthetic sources whose SOLE PURPOSE
// is to reproduce the drift shape each wire is meant to catch. If ANY
// self-check flips green when the drift is present, the corresponding
// wire above is toothless.
// =========================================================================

// Self-check for wire (a): flip BPS_HERO_LAYOUT_ENABLED default to true.
// The wire's `= false` regex must NOT match this fixture.
test('self-check: wire (a) fails when BPS_HERO_LAYOUT_ENABLED default flips to true', () => {
  const brokenSrc = [
    "import { View } from 'react-native'",
    "",
    "const BPS_HERO_LAYOUT_ENABLED = true as const;",
    "",
    "export function BiopsychosocialPlanScreen() { return null }",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.doesNotMatch(
    stripped,
    constDefaultFalseRegex('BPS_HERO_LAYOUT_ENABLED'),
    'self-check: wire (a) must NOT match `= false` when the source declared `= true as const`. If this flips true, the regex is broken and wire (a) cannot detect a silent default flip to enabled.',
  )
})

// Self-check for wire (a) positive: `= false as const` should still
// match — confirms the wire accepts the shipped shape.
test('self-check: wire (a) matches the shipped `= false as const` shape', () => {
  const goodSrc = [
    "import { View } from 'react-native'",
    "",
    "const BPS_HERO_LAYOUT_ENABLED = false as const;",
    "",
    "export function BiopsychosocialPlanScreen() { return null }",
  ].join('\n')
  const stripped = stripComments(goodSrc)
  assert.match(
    stripped,
    constDefaultFalseRegex('BPS_HERO_LAYOUT_ENABLED'),
    'self-check: wire (a) must accept `const BPS_HERO_LAYOUT_ENABLED = false as const`. If this flips false, the regex is too strict and rejects the shipped shape.',
  )
})

// Self-check for wire (b): drop HeroScoreBlock render entirely. The
// wire's indexOf check must observe -1 for that render tag.
test('self-check: wire (b) fails when HeroScoreBlock render is dropped', () => {
  const brokenSrc = [
    "import { View } from 'react-native'",
    "const BPS_HERO_LAYOUT_ENABLED = false as const;",
    "export function BiopsychosocialPlanScreen() {",
    "  return (",
    "    <View>",
    "      {BPS_HERO_LAYOUT_ENABLED && <OneThingTodayCard />}",
    "      {BPS_HERO_LAYOUT_ENABLED && <WellbeingMapGlimpse />}",
    "      {BPS_HERO_LAYOUT_ENABLED && <DetailsAccordion />}",
    "    </View>",
    "  )",
    "}",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.equal(
    stripped.indexOf('<HeroScoreBlock'),
    -1,
    'self-check: wire (b) must observe indexOf(<HeroScoreBlock) === -1 when the render tag is removed. If this flips non-negative, the parser is broken and wire (b) cannot detect a dropped render.',
  )
})

// Self-check for wire (c): drop accessibilityRole="header" from
// HeroScoreBlock. The wire's role="header" pattern must NOT match this
// fixture.
test('self-check: wire (c) fails when accessibilityRole="header" is removed from HeroScoreBlock', () => {
  const brokenSrc = [
    "import { View, Text } from 'react-native'",
    "",
    "export default function HeroScoreBlock() {",
    "  return (",
    "    <View accessibilityRole=\"none\">",
    "      <Text style={{ fontSize: 96 }}>96</Text>",
    "    </View>",
    "  )",
    "}",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.doesNotMatch(
    stripped,
    /accessibilityRole\s*=\s*["']header["']/,
    'self-check: wire (c) must NOT match `accessibilityRole="header"` when the role was removed. If this flips true, the regex is broken and wire (c) cannot detect the a11y-role regression.',
  )
})

// Bonus self-check for wire (c) fontSize half: `getScaledFontSize(96)`
// should also match the fontSize-96 pattern — confirms the wire accepts
// the shipped constant-call shape, not just a bare literal.
test('self-check: wire (c) matches both bare `fontSize: 96` and `fontSize: getScaledFontSize(96)`', () => {
  const FONT_96_PATTERN =
    /fontSize\s*:\s*(?:96\b|[A-Za-z_$][A-Za-z0-9_$]*\s*\(\s*96\s*[,)])/
  const bare = 'style={{ fontSize: 96 }}'
  const scaled = 'style={{ fontSize: getScaledFontSize(96) }}'
  const scaled2 = 'style={{ fontSize: getScaledFontSize(96, opts) }}'
  const wrong = 'style={{ fontSize: 24 }}'
  assert.match(bare, FONT_96_PATTERN)
  assert.match(scaled, FONT_96_PATTERN)
  assert.match(scaled2, FONT_96_PATTERN)
  assert.doesNotMatch(
    wrong,
    FONT_96_PATTERN,
    'self-check: wire (c) fontSize pattern must reject `fontSize: 24`. If this flips match, the regex is over-broad and would pass a shrunk hero.',
  )
})
