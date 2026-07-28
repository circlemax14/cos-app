// tests/unit/wellbeing-card-a11y-labels.test.mjs — CHUNK 103 (2026-07-23)
//
// Source-drift trip wires for the VoiceOver accessibilityLabel composition
// inside components/health-plan/BpsWellbeingScoreCard.tsx. Chunks 82/92/96
// landed the following a11y contract:
//
//   - COMPOSITE (numberRowA11yLabel — chunk 92): reads
//       "Your wellbeing score: N out of 100[, improving|worsening|steady]"
//     when a score exists; "Your wellbeing score: loading" while the
//     query is in flight; and "Your wellbeing score: not yet calculated"
//     when composite is undefined (empty state).
//
//   - PER-DOMAIN PILL (pillA11y — chunk 96): reads
//       "{lowercase domain}: {score} out of 100. {N} check-in(s) contributing."
//     when the pill has contributors; falls back to "{domain}: refreshing."
//     during a plan regen, and "{domain}: not yet available." during load
//     or when the domain has no contributors and no regen is running.
//
//   - Inner Text nodes carry accessibilityElementsHidden so VoiceOver
//     reads ONE composed label per container instead of fragmenting per
//     Text child (chunk 92/96 double-read guard). Drop this attribute and
//     the composite reads "65" then "/100" then "Improving" as three
//     separate utterances — exactly the regression chunks 92/96 fixed.
//
//   - Chunk 96 requirement: the pill label lower-cases DOMAIN_LABEL so
//     screen-readers pronounce "social and faith" rather than spelling
//     out "SOCIAL & FAITH" letter-by-letter. This lives as a
//     `.toLowerCase()` call today, but a dedicated lowercase mapping
//     (DOMAIN_LABEL_LOWER etc.) would satisfy the same goal — accept
//     either shape.
//
//   - Chunk 82 stripped the render-time `justCompletedRecently` /
//     `JUST_COMPLETED_WINDOW_MS` heuristic from the pill "Processing…"
//     copy in favor of the shared regen mutation state. If either
//     identifier reappears in living code, chunk 82's regression trap
//     is broken — the "Processing…" pill would once again stick
//     account-wide from a single completion.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 pattern, no behavioral mirror):
//   The a11y labels are static string templates embedded in JSX inside a
//   React Native component. Standing up a behavioral mirror would require
//   jsdom + React Native mocks + @tanstack/react-query stubs + expo-router
//   shims + an @expo/vector-icons stub — dozens of MB of devDeps to render
//   a card whose only observable output for these tests is the templated
//   string. Instead we read the .tsx source as text, strip comments (via
//   the shared helper in ./strip-comments.mjs — chunk 98 v2 lesson), and
//   grep for the literals that must appear for VoiceOver to announce the
//   score correctly. Same discipline as:
//     - tests/unit/notification-tap-handoff.test.mjs  (chunk 98 v2)
//     - tests/unit/use-notifications-bps-eligible.test.mjs (chunk 91)
//     - tests/unit/use-wellbeing-derivation.test.mjs  (chunk 84 v2)
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on BpsWellbeingScoreCard.tsx, confirm the label
//   rewording is deliberate (Ken really wanted a new template, a state
//   name really changed, DOMAIN_LABEL really became a humanized map),
//   and only then update the trip wire in lockstep.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob already
// present in package.json. No config changes required.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')
const CARD_TSX_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BpsWellbeingScoreCard.tsx',
)
const CARD_TSX_SRC_RAW = readFileSync(CARD_TSX_PATH, 'utf8')
const CARD_TSX_SRC = stripComments(CARD_TSX_SRC_RAW)

// -------------------------------------------------------------------------
// (a) COMPOSITE label template contains "Your wellbeing score" AND
//     "out of 100".
//
// The chunk-92 numberRowA11yLabel is what VoiceOver reads when the user
// swipes into the composite score row. If someone rewords "out of 100"
// to just "of 100" (or "/100"), the number stops being announced as a
// score AT ALL — VoiceOver says "Your wellbeing score sixty-five of one
// hundred" is coherent; "Your wellbeing score sixty-five slash one
// hundred" is not. The paired "Your wellbeing score" prefix is what
// disambiguates the number from the surrounding cards.
// -------------------------------------------------------------------------

test('(a) composite label template contains "Your wellbeing score" and "out of 100"', () => {
  assert.match(
    CARD_TSX_SRC,
    /Your wellbeing score/,
    'BpsWellbeingScoreCard.tsx must retain the "Your wellbeing score" prefix in the composite accessibilityLabel — rewording it strips the disambiguating anchor VoiceOver uses to identify the score row',
  )
  assert.match(
    CARD_TSX_SRC,
    /out of 100/,
    'BpsWellbeingScoreCard.tsx must retain the "out of 100" phrasing in the composite accessibilityLabel — swapping to "of 100" or "/100" makes VoiceOver announce a raw number without the 0-100 scale',
  )
})

// -------------------------------------------------------------------------
// (b) COMPOSITE fallback for the undefined state — the label must read
//     something recognisably like "wellbeing score not yet calculated" so
//     VoiceOver announces the empty card as a not-yet-scored state
//     instead of just "loading" or a bare dash.
//
// The literal in code today is 'Your wellbeing score: not yet calculated'
// (colon-separated). We match the two anchors "wellbeing score" and
// "not yet calculated" independently so a trivial punctuation edit
// (e.g. removing the colon or reflowing the sentence) doesn't false-trip,
// while a wholesale reword to "Score unavailable" or "Loading" does trip.
// -------------------------------------------------------------------------

test('(b) composite undefined-state fallback contains "wellbeing score" and "not yet calculated"', () => {
  // Case-insensitive on the "wellbeing score" anchor — the composite
  // has two templates ("Your wellbeing score:" and the callout
  // "Wellbeing score not yet available"); either qualifies as evidence
  // that the anchor phrase still ties the number to its owner.
  assert.match(
    CARD_TSX_SRC,
    /wellbeing score/i,
    'BpsWellbeingScoreCard.tsx must retain a "wellbeing score" anchor phrase in its a11y labels — otherwise VoiceOver announces a raw number with no owner',
  )
  assert.match(
    CARD_TSX_SRC,
    /not yet calculated/,
    'BpsWellbeingScoreCard.tsx must retain the "not yet calculated" fallback copy for the undefined-composite state — rewording it silently swaps the VoiceOver announcement to something else without a compile-time signal',
  )
})

// -------------------------------------------------------------------------
// (c) PER-DOMAIN pill labels contain the four state phrases:
//     "check-in", "not yet available", "loading", "refreshing".
//
// These are the strings VoiceOver reads when the user swipes onto a
// domain pill. They come from three chunks:
//   - chunk 96: "{domain}: {score} out of 100. {N} check-in(s) contributing."
//                (the READY state — "check-in" is the load-bearing word)
//   - chunk 96: "{domain}: not yet available." (loading + no-contributors)
//   - chunk 67: "{domain}: refreshing." (regen in flight)
//   - chunk 92: "Your wellbeing score: loading" — the "loading" state
//                phrase for the composite (not the pill, but the pill
//                cluster shares state semantics with the composite, and
//                if "loading" gets removed from the a11y label surface
//                entirely, VoiceOver has NO way to say "cold-mount, wait")
//
// Renaming any of these ("check-in" → "checkin", "not yet available" →
// "unavailable", "refreshing" → "syncing", "loading" → "please wait") is
// exactly the silent regression this file exists to catch. VoiceOver
// happily announces the new phrase, but automated a11y snapshot tests
// (if any) would need to be updated in lockstep — and often aren't.
// -------------------------------------------------------------------------

test('(c) per-domain / composite label states contain the four state phrases', () => {
  const REQUIRED_STATE_PHRASES = [
    'check-in', // hasContributors branch (chunk 96); also composite readiness copy
    'not yet available', // loading + no-contributors pill fallback (chunk 96)
    'loading', // composite loading fallback (chunk 92 numberRowA11yLabel)
    'refreshing', // regen-in-flight pill fallback (chunk 67)
  ]
  for (const phrase of REQUIRED_STATE_PHRASES) {
    // Case-insensitive: some of the phrases live inside a template that
    // may be uppercased for the visual pill but stays lowercase in the
    // a11y label. What matters is the phrase EXISTS somewhere in the
    // a11y label surface — dropping any of them regresses VoiceOver
    // for that state.
    const pattern = new RegExp(phrase.replace(/-/g, '\\-'), 'i')
    assert.match(
      CARD_TSX_SRC,
      pattern,
      `BpsWellbeingScoreCard.tsx must retain the "${phrase}" state phrase in its accessibilityLabel templates — VoiceOver announces this string when the card is in the corresponding state; renaming it silently regresses a11y for that state`,
    )
  }
})

// -------------------------------------------------------------------------
// (d) Per-domain label template lower-cases DOMAIN_LABEL, either via a
//     `.toLowerCase()` call OR a dedicated humanized name mapping.
//
// Chunk 96 requirement: DOMAIN_LABEL entries like "SOCIAL & FAITH" get
// read by VoiceOver letter-by-letter (S-O-C-I-A-L…) unless the label
// composition lowercases them first. The current implementation is a
// `.toLowerCase()` call bound to `domainNameLower`, but a future refactor
// might switch to a lookup table (DOMAIN_LABEL_LOWER / DOMAIN_LABEL_A11Y
// / DOMAIN_HUMANIZED_NAME) — accept either shape so the wire isn't
// coupled to today's implementation detail.
//
// Reject the case where NEITHER pattern exists: that means DOMAIN_LABEL
// (the uppercase visual label) is being fed straight to VoiceOver.
// -------------------------------------------------------------------------

test('(d) per-domain a11y label lower-cases DOMAIN_LABEL (via .toLowerCase() OR a humanized name mapping)', () => {
  const toLowerCallOnDomainLabel =
    /DOMAIN_LABEL\s*\[[^\]]+\]\s*\.\s*toLowerCase\s*\(\s*\)/.test(CARD_TSX_SRC)
  // Accept a dedicated humanized-name map used inside the a11y label
  // composition. We look for a map whose name signals "lowercase" or
  // "humanized" or "a11y" AND is indexed by a domain expression.
  const humanizedMapUse =
    /(?:DOMAIN_LABEL_LOWER|DOMAIN_LABEL_A11Y|DOMAIN_HUMANIZED_NAME|DOMAIN_NAME_LOWER|DOMAIN_A11Y_NAME|DOMAIN_SPOKEN_NAME|DOMAIN_READABLE_NAME)\s*\[/.test(
      CARD_TSX_SRC,
    )
  // A generic `.toLowerCase()` call anywhere in the file is NOT enough
  // by itself (it could be on an unrelated string), but combined with a
  // pill-label context it's a fair signal — we still require the
  // toLowerCase to be on a DOMAIN_LABEL[...] index expression above.
  assert.equal(
    toLowerCallOnDomainLabel || humanizedMapUse,
    true,
    'BpsWellbeingScoreCard.tsx must lowercase DOMAIN_LABEL[domain] before folding it into an accessibilityLabel — otherwise "SOCIAL & FAITH" gets read by VoiceOver letter-by-letter. Accept either a `DOMAIN_LABEL[...].toLowerCase()` call OR a dedicated humanized-name mapping (DOMAIN_LABEL_LOWER etc.).',
  )
})

// -------------------------------------------------------------------------
// (e) accessibilityElementsHidden=true appears on inner Text nodes
//     (chunk 92/96 double-read guard).
//
// Without this attribute, VoiceOver reads BOTH the parent container's
// composed label AND each Text child in sequence — the composite reads
// "Your wellbeing score 65 out of 100 improving" (parent) then "65"
// (child 1) then "/100" (child 2) then "Improving" (child 3), four
// utterances for one glance. The chunks-92/96 fix hides every inner
// Text under the composed parent label so users hear ONE utterance.
//
// We assert at least three occurrences to cover the common inner-Text
// count (composite number + /100 suffix + trend text, plus the pill's
// label / score / suffix Texts). A regression where SOME (but not all)
// of these attributes get dropped would still trip because the count
// falls below three.
// -------------------------------------------------------------------------

test('(e) accessibilityElementsHidden appears on inner Text nodes (chunk 92/96 double-read guard)', () => {
  const matches = CARD_TSX_SRC.match(/accessibilityElementsHidden/g) ?? []
  assert.ok(
    matches.length >= 3,
    `BpsWellbeingScoreCard.tsx must retain accessibilityElementsHidden on inner Text nodes to prevent VoiceOver from double-reading the composite AND each Text child (chunk 92/96 fix). Found ${matches.length} occurrence(s); expected at least 3 (composite number + /100 suffix + trend, and the pill's label + score + suffix nodes typically add more).`,
  )
  // Paired Android attribute — the chunks-92/96 fix documented in this
  // file's inline comments applies BOTH attributes to each hidden Text
  // (iOS uses accessibilityElementsHidden, Android uses
  // importantForAccessibility="no-hide-descendants"). Dropping the
  // Android side silently regresses TalkBack while leaving VoiceOver
  // intact — a platform-parity trap. Assert at least one occurrence to
  // catch a full delete; count parity with iOS is a stronger check but
  // more fragile against a legitimate refactor that consolidates the
  // hidden Texts.
  assert.match(
    CARD_TSX_SRC,
    /importantForAccessibility\s*=\s*["']no-hide-descendants["']/,
    'BpsWellbeingScoreCard.tsx must retain importantForAccessibility="no-hide-descendants" alongside accessibilityElementsHidden — the Android counterpart of the iOS attribute; without it TalkBack still double-reads the pill and composite even after the iOS fix',
  )
})

// -------------------------------------------------------------------------
// (f) Chunk 82 stale-constant refresh is stable: no reference to
//     JUST_COMPLETED_WINDOW_MS or justCompletedRecently in living code.
//
// Chunk 67 dropped the render-time `justCompletedRecently` heuristic
// (Date.now() snapshot + JUST_COMPLETED_WINDOW_MS threshold) that was
// making the "Processing…" pill copy stick account-wide. The replacement
// is the shared `regenIsPending` derived from useIsMutating on
// REGENERATE_BIO_PLAN_MUTATION_KEY. Chunk 82 formalised this as a
// sanity guard: if either identifier reappears in living code, the
// stale-constant regression trap is back.
//
// We strip comments before checking so the historical commit-note
// references in the JSDoc (lines 429ff today) don't trip the wire.
// -------------------------------------------------------------------------

test('(f) chunk 82 stale-constant guard: no live reference to JUST_COMPLETED_WINDOW_MS or justCompletedRecently', () => {
  assert.equal(
    /\bJUST_COMPLETED_WINDOW_MS\b/.test(CARD_TSX_SRC),
    false,
    'BpsWellbeingScoreCard.tsx must NOT reintroduce the JUST_COMPLETED_WINDOW_MS constant in living code — chunk 67 dropped it and chunk 82 formalised the ban. The current signal is regenIsPending sourced from useIsMutating on REGENERATE_BIO_PLAN_MUTATION_KEY.',
  )
  assert.equal(
    /\bjustCompletedRecently\b/.test(CARD_TSX_SRC),
    false,
    'BpsWellbeingScoreCard.tsx must NOT reintroduce the justCompletedRecently helper in living code — the render-time Date.now() snapshot heuristic it embodied made the "Processing…" pill stick account-wide across domains (chunk 67 verify report). Use the shared regen-mutation-key signal instead.',
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 discipline — prove the trap snaps shut)
//
// These tests do NOT read BpsWellbeingScoreCard.tsx. They exercise the
// shared stripComments helper + the exact patterns above against
// synthetic sources whose SOLE PURPOSE is to reproduce the drift shapes
// each wire is meant to catch. If ANY of these self-checks flip green
// when the drift is present, the corresponding wire above is toothless.
// =========================================================================

test('self-check: wire (a) fails when the "out of 100" phrasing is reworded to "/100"', () => {
  const broken = "const label = `Your wellbeing score: ${n}/100`;"
  const stripped = stripComments(broken)
  assert.equal(
    /out of 100/.test(stripped),
    false,
    'self-check: wire (a) must NOT match a template that dropped "out of 100" for "/100". If this flips true, wire (a) is toothless against the exact regression it exists to catch.',
  )
})

test('self-check: wire (b) fails when the "not yet calculated" fallback is removed', () => {
  const broken =
    "const label = typeof n === 'number' ? `Your wellbeing score: ${n}` : 'Score unavailable';"
  const stripped = stripComments(broken)
  assert.equal(
    /not yet calculated/.test(stripped),
    false,
    'self-check: wire (b) must NOT match a fallback that rewords "not yet calculated" to something else. If this flips true, wire (b) cannot detect the exact undefined-state regression it exists to catch.',
  )
})

test('self-check: wire (c) fails when the "refreshing" state phrase is renamed', () => {
  const broken = [
    "const pillA11y = isLoading",
    "  ? `${d}: not yet available.`",
    "  : hasContributors",
    "    ? `${d}: ${s} out of 100. ${n} check-ins contributing.`",
    "    : isProcessing",
    "      ? `${d}: syncing.`", // regressed rename — was "refreshing"
    "      : `${d}: not yet available.`",
  ].join('\n')
  const stripped = stripComments(broken)
  assert.equal(
    /refreshing/i.test(stripped),
    false,
    'self-check: wire (c) must NOT match a source that renamed "refreshing" to "syncing" (or similar). If this flips true, wire (c) is toothless against the exact regen-state rename it exists to catch.',
  )
})

test("self-check: wire (d) fails when DOMAIN_LABEL is used verbatim (no toLowerCase or humanized map)", () => {
  const broken = "const domainName = DOMAIN_LABEL[d.domain];"
  const stripped = stripComments(broken)
  const toLowerCallOnDomainLabel =
    /DOMAIN_LABEL\s*\[[^\]]+\]\s*\.\s*toLowerCase\s*\(\s*\)/.test(stripped)
  const humanizedMapUse =
    /(?:DOMAIN_LABEL_LOWER|DOMAIN_LABEL_A11Y|DOMAIN_HUMANIZED_NAME|DOMAIN_NAME_LOWER|DOMAIN_A11Y_NAME|DOMAIN_SPOKEN_NAME|DOMAIN_READABLE_NAME)\s*\[/.test(
      stripped,
    )
  assert.equal(
    toLowerCallOnDomainLabel || humanizedMapUse,
    false,
    'self-check: wire (d) must NOT match a source that uses DOMAIN_LABEL directly without a .toLowerCase() call or humanized-name mapping. If this flips true, wire (d) is toothless against the "SOCIAL & FAITH read letter-by-letter" regression it exists to catch.',
  )
})

test('self-check: wire (e) fails when accessibilityElementsHidden is dropped from Text nodes', () => {
  const broken = [
    '<View accessible accessibilityLabel="composite">',
    '  <Text>{score}</Text>',
    '  <Text>/100</Text>',
    '  <Text>Improving</Text>',
    '</View>',
  ].join('\n')
  const stripped = stripComments(broken)
  const matches = stripped.match(/accessibilityElementsHidden/g) ?? []
  assert.ok(
    matches.length < 3,
    'self-check: wire (e) must NOT match a source that dropped accessibilityElementsHidden. If this flips true, wire (e) cannot detect the exact VoiceOver double-read regression chunks 92/96 fixed.',
  )
})

test('self-check: wire (f) fails when JUST_COMPLETED_WINDOW_MS is re-added in living code', () => {
  const broken = 'const JUST_COMPLETED_WINDOW_MS = 60_000;'
  const stripped = stripComments(broken)
  assert.equal(
    /\bJUST_COMPLETED_WINDOW_MS\b/.test(stripped),
    true,
    'self-check setup: the stale-constant identifier must survive stripComments (it is a real const, not a comment). If this flips false, the strip-comment helper is over-eager and wire (f) can no longer detect a reintroduction of the chunk-67-removed heuristic.',
  )
})

test('self-check: stripComments still strips a comment-only reference to the chunk-82 identifier so wire (f) is not tripped by JSDoc', () => {
  // The living file's JSDoc still discusses `justCompletedRecently` as
  // historical context (line 429 today). If stripComments regresses and
  // stops removing that comment line, wire (f) would trip on prose rather
  // than on live code — this self-check pins that behavior.
  const src = [
    '// dropped the',
    '// justCompletedRecently window. Three problems the heuristic had:',
    'const isProcessing = regenIsPending;',
  ].join('\n')
  const stripped = stripComments(src)
  assert.equal(
    /\bjustCompletedRecently\b/.test(stripped),
    false,
    'self-check: stripComments must remove `justCompletedRecently` when it appears only inside a `//` comment. If this flips true, wire (f) would false-trip on the existing JSDoc history section instead of on real code.',
  )
})
