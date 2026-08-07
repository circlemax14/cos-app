// tests/unit/trends-band-pill-a11y-contract.test.mjs — CHUNK 107 (2026-07-23)
//
// Source-drift trip wires for the composed VoiceOver accessibilityLabel on
// each row of components/health-plan/SelfAssessmentTrends.tsx. Chunk 93
// landed a single composed sentence on the outer Pressable of every
// per-instrument card and hid the inner pill + arrow row from
// accessibility so VoiceOver reads ONE utterance per row instead of
// three separate fragments ("Depression: low." → "Low" → "Improving").
//
// The composed label template shipped by chunk 93 (rebuilt in the render
// loop of SelfAssessmentTrends.tsx) is roughly:
//
//   "{Human title}: {band}. {healthy | attention needed | concerning}.
//    {trending upward | trending downward | no change}.
//    {improving | worsening | steady}. {relative time}."
//
// Direction-of-goodness ("healthy / attention needed / concerning") is
// derived from ASSESSMENT_BANDS via getBandDef + computeBand — chunk 58
// folded the direction into band.tone so the trends card never
// hard-codes a higher-is-better / lower-is-better mapping. That decision
// is load-bearing: three instruments (PHQ-9, GAD-7, PSS-4) use
// lower-is-better; a rewrite that assumed "up = good" here would flip
// depression cards to announce a worsening patient as "improving".
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / 103 pattern):
//   The composed label is a static string template inside a React Native
//   component's JSX. Standing up a behavioral mirror would drag in jsdom
//   + RN mocks + @tanstack/react-query stubs + expo-router shims +
//   @expo/vector-icons stubs — dozens of MB of devDeps to render a card
//   whose only observable output for these tests is a templated string.
//   Instead we read the .tsx source as text, strip comments (shared
//   helper from ./strip-comments.mjs — chunk 98 v2 lesson), and grep for
//   the literals the chunk-93 contract depends on. Same discipline as:
//     - tests/unit/wellbeing-card-a11y-labels.test.mjs (chunk 103)
//     - tests/unit/notification-tap-handoff.test.mjs   (chunk 98 v2)
//     - tests/unit/tab-bar-a11y-contract.test.mjs
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on SelfAssessmentTrends.tsx, confirm the label
//   rewording is deliberate (Ken really wanted a new template, or
//   ASSESSMENT_BANDS grew a new direction value), and only then update
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
const TRENDS_TSX_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'SelfAssessmentTrends.tsx',
)
const BANDS_TS_PATH = join(REPO_ROOT, 'lib', 'assessment-bands.ts')
// Wave 2: the FRIENDLY_NAME map that used to live inline in
// SelfAssessmentTrends.tsx was consolidated here. Wire (f) follows it.
const INSTRUMENT_LABELS_TS_PATH = join(REPO_ROOT, 'lib', 'instrument-labels.ts')

const TRENDS_TSX_SRC_RAW = readFileSync(TRENDS_TSX_PATH, 'utf8')
const TRENDS_TSX_SRC = stripComments(TRENDS_TSX_SRC_RAW)
const BANDS_TS_SRC_RAW = readFileSync(BANDS_TS_PATH, 'utf8')
const BANDS_TS_SRC = stripComments(BANDS_TS_SRC_RAW)
const INSTRUMENT_LABELS_TS_SRC = stripComments(
  readFileSync(INSTRUMENT_LABELS_TS_PATH, 'utf8'),
)

// -------------------------------------------------------------------------
// (a) Composed label template contains all 5 phrase categories:
//     "healthy", "attention needed", "concerning", trending
//     upward|downward|no change, improving|worsening|steady.
//
// These are the exact string literals bandDirectionPhrasing() +
// trendArrowPhrasing() + the chunk-58 trendA11y ternary emit into the
// composedA11yLabel. Dropping any one of them silently regresses the
// VoiceOver announcement for that band-tone or trend-direction — a
// concerning card would announce "Depression: high." with no
// "concerning." disambiguator, and a healthy card would sound
// indistinguishable from a warn card.
// -------------------------------------------------------------------------

test('(a) composed label template contains all 5 phrase categories', () => {
  // Category 1: direction-of-goodness = "healthy" (band.tone === 'good')
  assert.match(
    TRENDS_TSX_SRC,
    /['"`]healthy['"`]/,
    'SelfAssessmentTrends.tsx must retain the "healthy" phrase in bandDirectionPhrasing() — VoiceOver users cannot tell if "Low" is good or bad for a given instrument without this direction-of-goodness word for the good tone',
  )
  // Category 2: direction-of-goodness = "attention needed" (band.tone === 'warn')
  assert.match(
    TRENDS_TSX_SRC,
    /attention needed/,
    'SelfAssessmentTrends.tsx must retain the "attention needed" phrase for the warn tone — dropping it makes a moderate band read identically to a healthy or concerning band via VoiceOver',
  )
  // Category 3: direction-of-goodness = "concerning" (band.tone === 'bad')
  assert.match(
    TRENDS_TSX_SRC,
    /['"`]concerning['"`]/,
    'SelfAssessmentTrends.tsx must retain the "concerning" phrase for the bad tone — dropping it strips the severity disambiguator VoiceOver users rely on when the visual pill color is inaccessible',
  )
  // Category 4: arrow direction phrases — assert ALL THREE variants
  // appear (upward / downward / no change). A partial drop (only
  // "trending upward" survives) would still let this test pass if we
  // checked with a single alternation, but the trip wire is meant to
  // detect any drop of a variant.
  for (const arrow of ['trending upward', 'trending downward', 'no change']) {
    assert.match(
      TRENDS_TSX_SRC,
      new RegExp(arrow),
      `SelfAssessmentTrends.tsx must retain the "${arrow}" arrow phrase in trendArrowPhrasing() — this describes the visual trend arrow shape for VoiceOver; dropping any variant silently regresses the announcement for that arrow direction`,
    )
  }
  // Category 5: trendA11y phrases — improving / worsening / steady.
  // Case-insensitive because the composed label capitalizes the first
  // letter via `${p[0].toUpperCase()}${p.slice(1)}`, so the literal in
  // source is lowercase but the visual pill also renders "Improving" /
  // "Worsening" / "Steady" capitalized. Either evidence counts.
  for (const trend of ['improving', 'worsening', 'steady']) {
    assert.match(
      TRENDS_TSX_SRC,
      new RegExp(trend, 'i'),
      `SelfAssessmentTrends.tsx must retain the "${trend}" trend phrase — chunk 58 established this maps trend TONE (not arrow direction) to a VoiceOver-friendly word; dropping any variant regresses one trend state`,
    )
  }
})

// -------------------------------------------------------------------------
// (b) accessibilityElementsHidden=true on inner pill container + arrow
//     row (chunk 93 double-read guard).
//
// Without this attribute, VoiceOver reads BOTH the outer Pressable's
// composed label AND the pill's inner "Low" Text AND the arrow row's
// "Improving" Text — three utterances for one card. The chunk-93 fix
// hides the pill + arrow-row containers so users hear ONE composed
// sentence. Two occurrences are required because the pill container and
// the arrow row are distinct <View>s.
// -------------------------------------------------------------------------

test('(b) accessibilityElementsHidden=true on inner pill container + arrow row', () => {
  const matches =
    TRENDS_TSX_SRC.match(/accessibilityElementsHidden\s*=\s*\{?\s*true\s*\}?/g) ??
    []
  assert.ok(
    matches.length >= 2,
    `SelfAssessmentTrends.tsx must retain accessibilityElementsHidden={true} on BOTH the inner pill container AND the trend arrow row (chunk 93 double-read guard). Found ${matches.length} occurrence(s); expected at least 2 (humanBandPill container + trendRow container).`,
  )
  // Android parity — chunk 93 pairs iOS accessibilityElementsHidden
  // with Android's importantForAccessibility="no-hide-descendants".
  // Assert at least two occurrences to keep the platform pair in sync;
  // dropping one platform silently regresses TalkBack while leaving
  // VoiceOver intact.
  const androidMatches =
    TRENDS_TSX_SRC.match(
      /importantForAccessibility\s*=\s*["']no-hide-descendants["']/g,
    ) ?? []
  assert.ok(
    androidMatches.length >= 2,
    `SelfAssessmentTrends.tsx must retain importantForAccessibility="no-hide-descendants" on BOTH the pill container AND the trend arrow row — the Android counterpart of accessibilityElementsHidden. Found ${androidMatches.length} occurrence(s); expected at least 2.`,
  )
})

// -------------------------------------------------------------------------
// (c) The row Pressable carries the composed label — grep for a
//     Pressable that receives an accessibilityLabel including at least
//     one of the phrase categories.
//
// We do TWO things:
//   (1) Confirm the composedA11yLabel identifier is bound onto a
//       Pressable via `accessibilityLabel={composedA11yLabel}`.
//   (2) Confirm the identifier's template body is composed from at
//       least one phrase-category source (bandDirectionPhrasing,
//       trendArrowPhrasing, or one of the literal phrase words).
//
// This wire specifically defends against a refactor that renames
// `composedA11yLabel` to something else without keeping the label on
// the row Pressable — the check would trip because the identifier is
// gone and the fallback grep also fails.
// -------------------------------------------------------------------------

test('(c) row Pressable carries composed label wired to a phrase-category source', () => {
  // (c.1) A Pressable's accessibilityLabel prop references a template
  //       expression (curly-brace binding, not a bare string). We
  //       search for `accessibilityLabel={...}` where the interior
  //       includes an identifier we know composes the phrase
  //       categories. `composedA11yLabel` is today's identifier; a
  //       refactor could rename it. Accept either the current
  //       identifier OR a direct inline template that itself
  //       references directionPhrase or arrowPhrase.
  const pressableCarriesComposed =
    /accessibilityLabel\s*=\s*\{\s*composedA11yLabel\s*\}/.test(TRENDS_TSX_SRC) ||
    /accessibilityLabel\s*=\s*\{[^}]*(?:directionPhrase|arrowPhrase|bandDirectionPhrasing|trendArrowPhrasing)[^}]*\}/.test(
      TRENDS_TSX_SRC,
    )
  assert.equal(
    pressableCarriesComposed,
    true,
    'SelfAssessmentTrends.tsx must bind the composed label onto the row Pressable via `accessibilityLabel={composedA11yLabel}` (or an inline template that references one of the phrase-category producers). Without this, VoiceOver falls back to the visual "LOW" pill and users lose the direction-of-goodness disambiguation.',
  )

  // (c.2) The composed label expression itself must reference at least
  //       one phrase-category source. We look for `composedA11yLabel`
  //       being assigned an expression that concatenates one of the
  //       phrase helpers or contains one of the literal phrase words.
  const bindingBody = TRENDS_TSX_SRC.match(
    /composedA11yLabel\s*=\s*[^\n]+(?:\n[^\n]+){0,20}/,
  )
  if (bindingBody) {
    const body = bindingBody[0]
    const referencesPhraseCategory =
      /directionPhrase|arrowPhrase|healthy|attention needed|concerning|trending (?:upward|downward)|no change|improving|worsening|steady/i.test(
        body,
      )
    assert.equal(
      referencesPhraseCategory,
      true,
      'SelfAssessmentTrends.tsx `composedA11yLabel` expression must reference at least one of the phrase-category producers (directionPhrase, arrowPhrase) or one of the literal phrase words. Otherwise the identifier survives but the composition is empty and VoiceOver reads only the human title + relative time.',
    )
  }
})

// -------------------------------------------------------------------------
// (d) Chunk 87 empty-state Pressable UNTOUCHED: accessibilityLabel,
//     accessibilityHint, accessibilityRole all still present.
//
// Chunk 79 shipped the empty-state Pressable with the exact strings
// below. If someone refactors the empty state and drops any of these
// three props, VoiceOver either fails to name the button
// ("accessibilityLabel"), fails to describe the destination
// ("accessibilityHint"), or drops the button semantic entirely
// ("accessibilityRole") — different regressions, all silent.
// -------------------------------------------------------------------------

test('(d) chunk 87 empty-state Pressable retains label + hint + role', () => {
  assert.match(
    TRENDS_TSX_SRC,
    /accessibilityLabel\s*=\s*["']Take a check-in for self-assessments["']/,
    'SelfAssessmentTrends.tsx empty-state Pressable must retain accessibilityLabel="Take a check-in for self-assessments" — VoiceOver names the empty-state CTA with this string. Dropping it makes the CTA read as an unnamed button.',
  )
  assert.match(
    TRENDS_TSX_SRC,
    /accessibilityHint\s*=\s*["']Opens the assessment for this domain["']/,
    'SelfAssessmentTrends.tsx empty-state Pressable must retain accessibilityHint="Opens the assessment for this domain" — the hint tells VoiceOver users what happens on activation. Dropping it means users cannot preview the destination.',
  )
  assert.match(
    TRENDS_TSX_SRC,
    /accessibilityRole\s*=\s*["']button["']/,
    'SelfAssessmentTrends.tsx empty-state Pressable must retain accessibilityRole="button" — without the role, VoiceOver announces it as a bare view rather than a tappable button, and TalkBack cannot activate it via the button-activation gesture.',
  )
})

// -------------------------------------------------------------------------
// (e) ASSESSMENT_BANDS.direction reference — composed label logic MUST
//     read direction from ASSESSMENT_BANDS (not hardcoded).
//
// The chunk-58 architectural invariant is: direction-of-goodness lives
// in ASSESSMENT_BANDS (lib/assessment-bands.ts), gets folded into
// band.tone by computeBand/computeTrend, and downstream label code
// reads TONE (not raw direction) to phrase the announcement. That
// invariant is invisible on the SelfAssessmentTrends.tsx surface —
// hard-coding a "PHQ-9 lower is better" ternary into the trends file
// would type-check, render fine, and only surface as a wrong
// VoiceOver announcement on a specific instrument.
//
// We enforce the invariant indirectly: at least one occurrence of a
// direction check pattern of the shape
// `direction === '(higher|lower)-is-better'` must live in
// lib/assessment-bands.ts (the ASSESSMENT_BANDS source of truth).
// The `is-` middle segment is optional in case a future refactor
// shortens the enum ('higher-better' / 'lower-better'). If this trip
// wire fails, ASSESSMENT_BANDS no longer looks at direction at all —
// meaning band.tone can no longer encode direction-of-goodness, and
// SelfAssessmentTrends.tsx (or another consumer) is by definition
// hard-coding the direction elsewhere.
// -------------------------------------------------------------------------

test('(e) ASSESSMENT_BANDS module contains a direction check pattern (not hardcoded downstream)', () => {
  const directionCheckPattern =
    /direction\s*===?\s*['"](higher|lower)-(?:is-)?better['"]/
  assert.match(
    BANDS_TS_SRC,
    directionCheckPattern,
    "lib/assessment-bands.ts must contain at least one `direction === 'higher-is-better'` (or `lower-is-better`) check — chunk 58's architectural invariant is that direction-of-goodness lives in ASSESSMENT_BANDS and gets folded into band.tone by computeBand/computeTrend. If this check disappears, downstream label code (SelfAssessmentTrends, BpsWellbeingScoreCard) must be hard-coding the mapping — a silent regression per-instrument.",
  )
  // Also assert that SelfAssessmentTrends.tsx does NOT itself
  // hard-code a direction literal — it should read direction only via
  // getBandDef / band.tone. A stray `'higher-is-better'` string here
  // would mean chunk 58's delegation broke.
  assert.equal(
    /['"](higher|lower)-(?:is-)?better['"]/.test(TRENDS_TSX_SRC),
    false,
    "SelfAssessmentTrends.tsx must NOT contain a hard-coded 'higher-is-better' or 'lower-is-better' literal — chunk 58 delegates direction-of-goodness to ASSESSMENT_BANDS via getBandDef; a literal here would bypass the source of truth and drift per-instrument (PHQ-9, GAD-7, PSS-4 are lower-is-better and would announce backwards).",
  )
})

// -------------------------------------------------------------------------
// (f) Human title fallback: if def.humanLabel is missing, the label
//     falls back to id or a generic string — no naked "undefined" leak.
//
// WHAT CHANGED (Wave 2). The second link in this chain used to be an
// inline `FRIENDLY_NAME` map in SelfAssessmentTrends.tsx, read as
// `FRIENDLY_NAME[String(record.instrumentId)] ?? String(record.instrumentId)`.
// That map was consolidated into lib/instrument-labels.ts as
// `WARMER_INSTRUMENT_LABEL` behind the accessor
// `getWarmerInstrumentLabel(instrumentId, fallback): string`, shared with
// the assessment stepper header and the catalog cards.
//
// The protective intent is UNCHANGED and, if anything, better enforced:
// the accessor's `: string` return type plus its internal `?? fallback`
// make "resolves to undefined" a compile error at the helper rather than a
// convention at each call site. But the call site still has to PASS a real
// fallback — `getWarmerInstrumentLabel(id)` with a missing second arg, or
// one that can itself be undefined, would put us right back where we
// started. So the chain is now pinned in two places.
//
// The current fallback chain is:
//   humanTitle = def?.humanLabel ?? label
//   label      = getWarmerInstrumentLabel(String(record.instrumentId),
//                                         String(record.instrumentId))
//
// So an instrument with no humanLabel and no WARMER_INSTRUMENT_LABEL entry
// still reads its instrumentId as a string — never "undefined". We assert:
//   (f.1) def?.humanLabel ?? label (or equivalent ??-fallback) exists
//   (f.2) the label lookup goes through getWarmerInstrumentLabel WITH a
//         String(...) fallback argument, imported from the shared module
//   (f.2b) the helper itself returns `string` (not `string | undefined`)
//          and terminates the chain with `?? fallback`
//   (f.3) The word "undefined" never appears in a template literal
//         within a JSX expression — a bare `${maybeUndefined}` inside
//         a template would leak the string "undefined" to VoiceOver.
//
// (f.3) is a coarse guard — we grep for the literal token "undefined"
// (case-sensitive) INSIDE a template literal `...${...}...`. TypeScript
// syntax uses the identifier `undefined` freely (`| undefined` unions,
// `=== undefined` guards), so we only trip when it appears between
// backticks — a template literal is the only place a bare `undefined`
// value could serialize into a VoiceOver string.
// -------------------------------------------------------------------------

test('(f) human title fallback chain — no naked "undefined" leak', () => {
  // (f.1) At least one ??-fallback whose LHS references humanLabel.
  const hasHumanLabelFallback =
    /humanLabel\s*\?\?/.test(TRENDS_TSX_SRC) ||
    /\?\.\s*humanLabel\s*\?\?/.test(TRENDS_TSX_SRC)
  assert.equal(
    hasHumanLabelFallback,
    true,
    'SelfAssessmentTrends.tsx must retain a `def?.humanLabel ?? label` (or equivalent) fallback for the row title — without it, instruments whose def has no humanLabel serialize to "undefined" in the composed a11y label.',
  )

  // (f.2) The label lookup delegates to the shared accessor AND supplies
  //       a String(...) fallback as the second argument.
  assert.match(
    TRENDS_TSX_SRC,
    /from\s*['"]@\/lib\/instrument-labels['"]/,
    'SelfAssessmentTrends.tsx must import from `@/lib/instrument-labels` — Wave 2 moved the old inline FRIENDLY_NAME map there so the trends card, the stepper header and the catalog all speak one set of patient-facing names. A local map reappearing here means the surfaces have forked again.',
  )
  assert.match(
    TRENDS_TSX_SRC,
    /getWarmerInstrumentLabel\s*\(\s*[^,]+,\s*String\s*\(/,
    'SelfAssessmentTrends.tsx must call `getWarmerInstrumentLabel(<id>, String(record.instrumentId))` — WITH the second, fallback argument. The helper only guarantees a non-undefined result because the caller hands it a concrete fallback; a one-arg call (or a fallback that can itself be undefined) puts "undefined" straight back into the composed a11y label.',
  )

  // (f.2b) The helper terminates the chain: returns `string`, not
  //        `string | undefined`, and coalesces to its fallback.
  assert.match(
    INSTRUMENT_LABELS_TS_SRC,
    /export\s+function\s+getWarmerInstrumentLabel\s*\([\s\S]*?\)\s*:\s*string\s*\{/,
    'lib/instrument-labels.ts must declare `getWarmerInstrumentLabel(...): string` — a `string | undefined` return would re-open the exact hole this wire guards, and TypeScript would not flag the leak because the composed label interpolates into a template literal.',
  )
  assert.match(
    INSTRUMENT_LABELS_TS_SRC,
    /WARMER_INSTRUMENT_LABEL\s*\[[^\]]+\]\s*\?\?\s*fallback/,
    'lib/instrument-labels.ts must terminate the lookup with `WARMER_INSTRUMENT_LABEL[instrumentId] ?? fallback`. Without the coalesce, an unmapped (agency-custom or newly BE-added) instrument resolves to undefined and every consumer — trends card, stepper header, catalog — leaks "undefined" into user-visible copy.',
  )

  // (f.3) No literal "undefined" appears inside a template literal in
  //       the file. Scan template literals only (backtick-delimited)
  //       so `AssessmentRecord | undefined` type unions are exempt.
  const templateLiterals = TRENDS_TSX_SRC.match(/`[^`]*`/g) ?? []
  for (const tpl of templateLiterals) {
    assert.equal(
      /\bundefined\b/.test(tpl),
      false,
      `SelfAssessmentTrends.tsx template literal ${JSON.stringify(tpl.slice(0, 80))} must NOT contain a literal "undefined" — that string would serialize into the composed a11y label VoiceOver reads. Wrap the interpolation in a ?? fallback.`,
    )
  }
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 discipline — prove the trap snaps
// shut).
//
// These tests do NOT read SelfAssessmentTrends.tsx. They exercise the
// exact patterns above against synthetic sources whose SOLE PURPOSE is
// to reproduce the drift shape each wire is meant to catch. If ANY of
// these self-checks flip green when the drift is present, the
// corresponding wire above is toothless.
// =========================================================================

test('self-check: wire (a) fails when the "concerning" phrase category is dropped', () => {
  // Synthetically remove the "concerning" phrase from a fake source
  // that otherwise contains every other category. Wire (a)'s per-
  // phrase-category assertion for "concerning" must fail against this.
  const brokenSrc = [
    "case 'good': return 'healthy'",
    "case 'warn': return 'attention needed'",
    // "concerning" removed — case 'bad' now returns something else
    "case 'bad':  return 'not great'",
    "if (direction === 'up') return 'trending upward'",
    "if (direction === 'down') return 'trending downward'",
    "return 'no change'",
    "const trendA11y = 'improving' // or worsening / steady",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.equal(
    /['"`]concerning['"`]/.test(stripped),
    false,
    'self-check: wire (a) must NOT match a source that dropped "concerning" for another word. If this flips true, the "concerning" per-phrase assertion is toothless against the exact regression it exists to catch.',
  )
})

test('self-check: wire (a) fails when the "no change" phrase category is dropped from the arrow set', () => {
  // A partial drop where "trending upward" and "trending downward"
  // survive but "no change" is renamed. The per-arrow loop inside
  // wire (a) must trip on this. We verify by reproducing the "no
  // change" specific check.
  const brokenSrc = [
    "if (direction === 'up') return 'trending upward'",
    "if (direction === 'down') return 'trending downward'",
    "return 'flat'", // renamed from "no change"
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.equal(
    /no change/.test(stripped),
    false,
    'self-check: wire (a) must NOT match a source that renamed "no change" to "flat" or similar. If this flips true, the arrow-set per-variant assertion is toothless.',
  )
})

test('self-check: wire (b) fails when the accessibilityElementsHidden marker is dropped', () => {
  // Synthetic broken source: pill container + arrow row exist but
  // neither carries accessibilityElementsHidden. Wire (b)'s
  // `matches.length >= 2` assertion must fail (matches.length === 0).
  const brokenSrc = [
    '<View style={styles.humanBandPill}>',
    '  <View style={styles.bandDot} />',
    '  <Text>{pillLabel}</Text>',
    '</View>',
    '<View style={styles.trendRow}>',
    '  <MaterialIcons name="trending-up" />',
    '  <Text>Improving</Text>',
    '</View>',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const matches =
    stripped.match(/accessibilityElementsHidden\s*=\s*\{?\s*true\s*\}?/g) ?? []
  assert.ok(
    matches.length < 2,
    'self-check: wire (b) must NOT match a source that dropped accessibilityElementsHidden from BOTH the pill container AND the arrow row. If this flips true, wire (b) cannot detect the exact chunk-93 double-read regression it exists to catch.',
  )
})

test('self-check: stripComments removes a commented-out "concerning" so wire (a) is not tripped by JSDoc', () => {
  // The living file contains historical prose that mentions all the
  // phrase words in JSDoc. If stripComments regresses and stops
  // removing those lines, wire (a) would falsely pass when the LIVE
  // return statement is broken but the doc-comment still mentions it.
  // This self-check pins the stripping behavior.
  const src = [
    "// old copy said 'concerning' but we swapped it for 'not great'",
    "case 'bad': return 'not great'",
  ].join('\n')
  const stripped = stripComments(src)
  assert.equal(
    /['"`]concerning['"`]/.test(stripped),
    false,
    'self-check: stripComments must remove "concerning" when it appears only inside a // comment. If this flips true, wire (a) would false-pass on prose alone even when the live return was renamed.',
  )
})

test('self-check: wire (f) fails when a template literal leaks a bare "undefined"', () => {
  // Reproduce the exact regression wire (f.3) exists to catch: a
  // template literal that interpolates a possibly-undefined value
  // WITHOUT a ?? fallback. TypeScript would compile this; the runtime
  // string would contain "undefined".
  const brokenSrc = [
    'const humanTitle = def.humanLabel',
    'const composedA11yLabel = `${humanTitle}: ${undefined}. Healthy.`',
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const templateLiterals = stripped.match(/`[^`]*`/g) ?? []
  const anyLiteralLeaks = templateLiterals.some((tpl) =>
    /\bundefined\b/.test(tpl),
  )
  assert.equal(
    anyLiteralLeaks,
    true,
    'self-check: wire (f.3) must trip on a template literal containing the bare identifier `undefined`. If this flips false, wire (f.3) cannot detect a real "undefined" leak into the composed a11y label.',
  )
})
