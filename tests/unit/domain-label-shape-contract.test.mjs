// tests/unit/domain-label-shape-contract.test.mjs — CHUNK 116 (2026-07-23)
//
// Source-drift trip wires for two shared string tables exported from
// lib/wellbeing-score.ts:
//
//   - DOMAIN_LABEL           — patient-facing compact pill copy per BPS
//                              domain (bio/mind/social). Chunk 59 spec,
//                              chunk 62 rename ("SOCIAL" → "SOCIAL & FAITH").
//                              Consumed by BpsWellbeingScoreCard (chunk 92
//                              composite + chunk 96 domain pills),
//                              BpsPlanFocusBanner (chunk 60 focus copy),
//                              SelfAssessmentTrends composed labels, and
//                              various toast copies.
//
//   - DOMAIN_CALLOUT_NAME    — natural-English noun phrase for the
//                              full-sentence callout ("Focus this week:
//                              your {name} could use some focus."). Chunk
//                              59 adversarial-verify fix (major #3) —
//                              switched from engineer-jargon "bio area"
//                              to Ken's clinical-friendly wording; chunk
//                              62 renamed .social to "social & faith" so
//                              the callout sentence matches the section
//                              header verbatim.
//
// If either export shape drifts (e.g. .social back to 'SOCIAL & SPIRITUAL'
// or DOMAIN_CALLOUT_NAME.social to 'social' without the "faith" fragment),
// user-facing copy regresses across many surfaces at once — no test-run
// signal today.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / 103 / 107 / 109 / 113 pattern):
//   lib/wellbeing-score.ts is a pure TypeScript module — but this suite
//   runs via `node --test tests/unit/*.test.mjs` with no TS transpile
//   step. Importing the module directly is not viable in the mjs harness
//   the rest of the trip-wire suites use. Instead we read the .ts file
//   as text, strip comments via the shared helper (chunk 103), and grep
//   for the object-literal shape of each export. Same discipline as:
//     - tests/unit/plan-screen-headers-contract.test.mjs   (chunk 113)
//     - tests/unit/section-card-focus-fold-contract.test.mjs (chunk 109)
//     - tests/unit/trends-band-pill-a11y-contract.test.mjs (chunk 107)
//     - tests/unit/wellbeing-card-a11y-labels.test.mjs     (chunk 103)
//     - tests/unit/notification-tap-handoff.test.mjs       (chunk 98 v2)
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on lib/wellbeing-score.ts, confirm the string / shape
//   change is deliberate (e.g. Ken renamed "SOCIAL & FAITH" again, or a
//   fourth BPS domain landed), and only then update the wire in lockstep
//   with EVERY downstream consumer (BpsWellbeingScoreCard, focus banner,
//   trends labels, toasts).
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

const WELLBEING_SCORE_TS_PATH = join(REPO_ROOT, 'lib', 'wellbeing-score.ts')
const WELLBEING_SCORE_TS_RAW = readFileSync(WELLBEING_SCORE_TS_PATH, 'utf8')
const WELLBEING_SCORE_TS = stripComments(WELLBEING_SCORE_TS_RAW)

// Chunk 59 spec — the three canonical BPS domain keys, parity with
// DOMAIN_ORDER = ['bio', 'mind', 'social']. If a fourth domain lands
// (e.g. 'faith' as a first-class column) the object literal MUST expand
// in the same PR that adds it — otherwise the pill row / focus banner /
// trends labels all silently drop the new domain.
const EXPECTED_DOMAIN_KEYS = ['bio', 'mind', 'social']

// -------------------------------------------------------------------------
// Shared helper: extract the object-literal body for a given
// `export const NAME: Record<...> = { ... }` declaration.
//
// Returns the string BETWEEN the opening `{` and its matching `}`,
// exclusive of both braces. Uses a naive brace counter over the
// comment-stripped source — safe because the shipped tables carry only
// scalar string values (no nested objects, no template literals with
// interpolated braces).
// -------------------------------------------------------------------------

function extractObjectLiteralBody(source, identifier) {
  const declPattern = new RegExp(
    `export\\s+const\\s+${identifier}\\b[^=]*=\\s*\\{`,
  )
  const match = declPattern.exec(source)
  assert.ok(
    match,
    `lib/wellbeing-score.ts must retain an \`export const ${identifier} ... = { ... }\` declaration. If this fails, the export was renamed or reshaped — every downstream consumer (${identifier === 'DOMAIN_LABEL' ? 'BpsWellbeingScoreCard, BpsPlanFocusBanner, SelfAssessmentTrends, toasts' : 'focus banner sentence, toast copies'}) is broken.`,
  )
  const openIdx = match.index + match[0].length // index just past `{`
  let depth = 1
  let i = openIdx
  while (i < source.length && depth > 0) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    if (depth === 0) break
    i += 1
  }
  assert.ok(
    depth === 0 && i < source.length,
    `lib/wellbeing-score.ts: could not find matching closing brace for ${identifier} object literal. If this fails, the export declaration was reshaped in a way this suite cannot parse — update in lockstep.`,
  )
  return source.slice(openIdx, i)
}

// -------------------------------------------------------------------------
// Shared helper: extract the (key, string-value) pairs from an object
// literal body. Only recognizes shorthand string-valued entries of the
// form:
//
//   bio: 'BIO',
//   mind: "MIND",
//   social: `SOCIAL & FAITH`,
//
// which is exactly the shape both DOMAIN_LABEL and DOMAIN_CALLOUT_NAME
// ship today. If a future refactor threads the values through a `const`
// or a helper call, this parser will fail the (a)/(d) key-set checks —
// intentional: the trip wire only defends the literal-values shape.
// -------------------------------------------------------------------------

function parseStringEntries(body) {
  const entries = {}
  // Match `identifier : 'value'` (or "value" / `value`). The value
  // capture is a single quoted-string with no embedded quote-of-same-kind.
  const pattern = /(\w+)\s*:\s*(['"`])([^'"`]*)\2\s*,?/g
  let m
  while ((m = pattern.exec(body)) !== null) {
    entries[m[1]] = m[3]
  }
  return entries
}

const DOMAIN_LABEL_BODY = extractObjectLiteralBody(
  WELLBEING_SCORE_TS,
  'DOMAIN_LABEL',
)
const DOMAIN_LABEL_ENTRIES = parseStringEntries(DOMAIN_LABEL_BODY)

const DOMAIN_CALLOUT_NAME_BODY = extractObjectLiteralBody(
  WELLBEING_SCORE_TS,
  'DOMAIN_CALLOUT_NAME',
)
const DOMAIN_CALLOUT_NAME_ENTRIES = parseStringEntries(
  DOMAIN_CALLOUT_NAME_BODY,
)

// -------------------------------------------------------------------------
// (a) DOMAIN_LABEL keys are exactly {bio, mind, social} — parity with
//     DOMAIN_ORDER. Extra keys are a red flag (fourth domain landed
//     without updating downstream renderers); missing keys mean the
//     compact pill row drops a domain.
// -------------------------------------------------------------------------

test('(a) DOMAIN_LABEL keys are exactly {bio, mind, social}', () => {
  const actual = Object.keys(DOMAIN_LABEL_ENTRIES).sort()
  const expected = [...EXPECTED_DOMAIN_KEYS].sort()
  assert.deepEqual(
    actual,
    expected,
    `DOMAIN_LABEL keys must match DOMAIN_ORDER exactly (${expected.join(', ')}). Actual: ${actual.join(', ') || '<empty>'}. If a fourth BPS domain landed, every downstream renderer (BpsWellbeingScoreCard pills, focus banner sentence, trends labels, toasts) must be updated in the same PR — do NOT silently expand this map.`,
  )
})

// -------------------------------------------------------------------------
// (b) DOMAIN_LABEL.social === 'SOCIAL & FAITH' — chunk 59/62 verbatim
//     copy. Ampersand not "AND"; no trailing "WELLNESS".
// -------------------------------------------------------------------------

test('(b) DOMAIN_LABEL.social === "SOCIAL & FAITH" (chunk 59/62 verbatim)', () => {
  assert.equal(
    DOMAIN_LABEL_ENTRIES.social,
    'SOCIAL & FAITH',
    `DOMAIN_LABEL.social must be the exact literal "SOCIAL & FAITH" (chunk 59 spec + chunk 62 rename). Actual: ${JSON.stringify(DOMAIN_LABEL_ENTRIES.social)}. Common regressions: "SOCIAL & SPIRITUAL", "SOCIAL AND FAITH", "SOCIAL & FAITH WELLNESS" — all break parity with the BPS section header Ken uses on calls.`,
  )
})

// -------------------------------------------------------------------------
// (c) DOMAIN_LABEL.bio and DOMAIN_LABEL.mind values present (rename-catch).
//
// Not pinning exact "BIO"/"MIND" strings so that a future Ken-driven
// rename of the compact pill copy (e.g. "BODY"/"MIND") isn't blocked by
// this wire — but the entries MUST exist as non-empty strings so a
// silent deletion or empty-string typo is caught.
// -------------------------------------------------------------------------

test('(c) DOMAIN_LABEL.bio and DOMAIN_LABEL.mind values are present, non-empty strings', () => {
  assert.equal(
    typeof DOMAIN_LABEL_ENTRIES.bio,
    'string',
    'DOMAIN_LABEL.bio must be present as a string literal. If missing, the Bio pill in the compact wellbeing pill row renders empty.',
  )
  assert.ok(
    DOMAIN_LABEL_ENTRIES.bio.length > 0,
    'DOMAIN_LABEL.bio must be non-empty. An empty-string typo would render an invisible pill on the score card.',
  )
  assert.equal(
    typeof DOMAIN_LABEL_ENTRIES.mind,
    'string',
    'DOMAIN_LABEL.mind must be present as a string literal. If missing, the Mind pill in the compact wellbeing pill row renders empty.',
  )
  assert.ok(
    DOMAIN_LABEL_ENTRIES.mind.length > 0,
    'DOMAIN_LABEL.mind must be non-empty. An empty-string typo would render an invisible pill on the score card.',
  )
})

// -------------------------------------------------------------------------
// (d) DOMAIN_CALLOUT_NAME keys are exactly {bio, mind, social} — parity
//     with DOMAIN_ORDER. Same rationale as (a) but for the sentence-form
//     callout consumed by the focus banner.
// -------------------------------------------------------------------------

test('(d) DOMAIN_CALLOUT_NAME keys are exactly {bio, mind, social}', () => {
  const actual = Object.keys(DOMAIN_CALLOUT_NAME_ENTRIES).sort()
  const expected = [...EXPECTED_DOMAIN_KEYS].sort()
  assert.deepEqual(
    actual,
    expected,
    `DOMAIN_CALLOUT_NAME keys must match DOMAIN_ORDER exactly (${expected.join(', ')}). Actual: ${actual.join(', ') || '<empty>'}. If a domain key is missing, the focus banner sentence renders "Focus this week: your undefined could use some focus." for that domain.`,
  )
})

// -------------------------------------------------------------------------
// (e) DOMAIN_CALLOUT_NAME.social contains "faith" (case-insensitive) —
//     chunk 62 rename to match the section header verbatim ("social &
//     faith" or "social and faith"). Without the word "faith", the
//     callout sentence detaches from the section title.
// -------------------------------------------------------------------------

test('(e) DOMAIN_CALLOUT_NAME.social contains "faith" (case-insensitive)', () => {
  const value = DOMAIN_CALLOUT_NAME_ENTRIES.social
  assert.equal(
    typeof value,
    'string',
    'DOMAIN_CALLOUT_NAME.social must be present as a string literal.',
  )
  assert.match(
    value,
    /faith/i,
    `DOMAIN_CALLOUT_NAME.social must contain the word "faith" (case-insensitive) per chunk 62 — the callout sentence must reference the same "faith" concept as the section header. Actual: ${JSON.stringify(value)}. Common regressions: "social", "social connection", "social wellness" — all detach the sentence from the section title.`,
  )
})

// -------------------------------------------------------------------------
// (f) DOMAIN_CALLOUT_NAME values read as natural English — lowercase
//     first character, no UPPERCASE runs. This defends against a
//     copy-paste from DOMAIN_LABEL that would slot an ALL-CAPS token
//     into the middle of the callout sentence ("Focus this week: your
//     SOCIAL & FAITH could use some focus.").
//
// Concretely we allow: lowercase letters, spaces, ampersand, and "and".
// Regex per spec: values match /^[a-z ]/ (first char lowercase or
// space). The "no uppercase runs" tail check catches any embedded caps.
// -------------------------------------------------------------------------

test('(f) DOMAIN_CALLOUT_NAME values are natural-English lowercase phrases', () => {
  for (const [key, value] of Object.entries(DOMAIN_CALLOUT_NAME_ENTRIES)) {
    assert.equal(
      typeof value,
      'string',
      `DOMAIN_CALLOUT_NAME.${key} must be a string literal.`,
    )
    assert.match(
      value,
      /^[a-z ]/,
      `DOMAIN_CALLOUT_NAME.${key} must begin with a lowercase letter or space (natural-English sentence-fragment). Actual: ${JSON.stringify(value)}. Common regression: a copy-paste from DOMAIN_LABEL slots an ALL-CAPS pill string into the callout sentence.`,
    )
    // "No uppercase runs" — catch embedded caps like "physical Health"
    // or "MENTAL health". A single uppercase letter mid-string is
    // enough to fail; two consecutive uppercase letters are the shape
    // an ALL-CAPS copy-paste produces.
    assert.doesNotMatch(
      value,
      /[A-Z]/,
      `DOMAIN_CALLOUT_NAME.${key} must contain no uppercase letters (natural-English sentence-fragment consumed as "your ${value} could use some focus"). Actual: ${JSON.stringify(value)}. If Ken really wanted a capitalized noun mid-sentence, update this wire in lockstep — but the shipped copy since chunk 59 is all-lowercase.`,
    )
  }
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 / 107 / 109 / 113 discipline —
// prove the trap snaps shut).
//
// These tests do NOT read the live lib/wellbeing-score.ts. They exercise
// the exact parsers + assertions above against synthetic sources whose
// SOLE PURPOSE is to reproduce the drift shape each wire is meant to
// catch. If ANY of these self-checks flip green when the drift is
// present, the corresponding wire above is toothless.
// =========================================================================

test('self-check: wire (b) fails when DOMAIN_LABEL.social is renamed to "SOCIAL & SPIRITUAL WELLNESS"', () => {
  // Synthetic export where the chunk-62 rename was silently reverted
  // (and drifted further to append "WELLNESS"). Wire (b)'s exact-equal
  // check must NOT match "SOCIAL & FAITH" against this fixture.
  const brokenSrc = [
    "export const DOMAIN_LABEL: Record<BpsDomain, string> = {",
    "  bio: 'BIO',",
    "  mind: 'MIND',",
    "  social: 'SOCIAL & SPIRITUAL WELLNESS',",
    "}",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const body = extractObjectLiteralBody(stripped, 'DOMAIN_LABEL')
  const entries = parseStringEntries(body)
  assert.notEqual(
    entries.social,
    'SOCIAL & FAITH',
    'self-check: wire (b) must NOT observe "SOCIAL & FAITH" when the source was renamed to "SOCIAL & SPIRITUAL WELLNESS". If this flips true, the parser is broken or wire (b) cannot detect the chunk-62 rename regression it exists to catch.',
  )
})

test('self-check: wire (a) fails when a fourth domain key ("faith") is added to DOMAIN_LABEL', () => {
  // Synthetic export where a fourth first-class domain slipped into
  // DOMAIN_LABEL without a lockstep update to DOMAIN_ORDER + every
  // downstream renderer. Wire (a)'s exact key-set check must NOT match
  // the three-key {bio, mind, social} baseline.
  const brokenSrc = [
    "export const DOMAIN_LABEL: Record<BpsDomain, string> = {",
    "  bio: 'BIO',",
    "  mind: 'MIND',",
    "  social: 'SOCIAL & FAITH',",
    "  faith: 'FAITH',",
    "}",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const body = extractObjectLiteralBody(stripped, 'DOMAIN_LABEL')
  const entries = parseStringEntries(body)
  const actualKeys = Object.keys(entries).sort()
  const expectedKeys = [...EXPECTED_DOMAIN_KEYS].sort()
  assert.notDeepEqual(
    actualKeys,
    expectedKeys,
    'self-check: wire (a) must NOT observe the {bio, mind, social} baseline when a fourth key was added. If this flips true, wire (a) cannot detect a silent map expansion that leaves downstream renderers unaware of the new domain.',
  )
})

test('self-check: wire (f) fails when a DOMAIN_CALLOUT_NAME value is UPPERCASED', () => {
  // Synthetic export where DOMAIN_CALLOUT_NAME.mind was copy-pasted
  // from DOMAIN_LABEL — an ALL-CAPS pill token slotted into the
  // callout sentence. Wire (f)'s "no uppercase" check must fail
  // against this fixture.
  const brokenSrc = [
    "export const DOMAIN_CALLOUT_NAME: Record<BpsDomain, string> = {",
    "  bio: 'physical health',",
    "  mind: 'MENTAL HEALTH',",
    "  social: 'social & faith',",
    "}",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const body = extractObjectLiteralBody(stripped, 'DOMAIN_CALLOUT_NAME')
  const entries = parseStringEntries(body)
  // Wire (f) checks each value against /^[a-z ]/ AND /[A-Z]/. The
  // second check is the tighter one — assert it would fire on this
  // fixture.
  assert.match(
    entries.mind,
    /[A-Z]/,
    'self-check: wire (f) must observe an uppercase letter in the mutated DOMAIN_CALLOUT_NAME.mind fixture. If this flips false, the parser is broken or wire (f) cannot detect an ALL-CAPS copy-paste regression from DOMAIN_LABEL into the callout sentence.',
  )
})
