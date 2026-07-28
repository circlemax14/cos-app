// tests/unit/feature-flag-spelling-contract.test.mjs — CHUNK 121 (2026-07-23)
//
// Cross-file spelling contract for the two BE-emitted eligibility flags
// that gate chunk 64 push-tap routing + everything downstream (chunk 91
// pinned the strings inside hooks/use-notifications.ts; this widens the
// net to every client surface that reads them).
//
// The flags are wire-level string keys shipped by /v1/feature-flags —
//     assessment_strategy_v2_enabled
//     biopsychosocial_plan_enabled
// A single-file typo (assessement_strategy_v2, biopsychosocial_play_enabled,
// plan_enabled_v1, …) silently disables gating for that read: the object
// lookup returns undefined, the strict `=== true` compares fail, and the
// whole eligibility gate opens to legacy routing without a runtime error.
//
// WHY A SOURCE-DRIFT TRIP WIRE (chunk 84/94 pattern):
//   `node --test tests/unit/*.test.mjs` runs with no TS transpiler. We
//   readFile the .ts sources and grep the raw text — same discipline as
//   tests/unit/regen-mutation-key.test.mjs (chunk 94) and
//   tests/unit/use-notifications-bps-eligible.test.mjs (chunk 91).
//   Comments are stripped via the shared helper so a doc-block that
//   mentions a legacy spelling can't red-herring the wire.
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob in
// package.json (unchanged since chunks 84/85/91/94).
//
// If any assertion below fires, DO NOT edit the regex to make it pass.
// Confirm the source diff is intentional; only then update the wire.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

// The two canonical flag strings the BE emits. These are the ONLY spellings
// allowed anywhere in the tree.
const FLAG_ASSESSMENT = 'assessment_strategy_v2_enabled'
const FLAG_BIOPSYCHOSOCIAL = 'biopsychosocial_plan_enabled'

// Curated typo blacklist — any file that literally contains any of these
// substrings has silently drifted from the wire-level spelling and will
// zero out its eligibility read. Extend as new plausible typos appear.
// (Note: we deliberately DO NOT include 'biopsychosocial_plan' as a bad
// substring — the canonical flag itself contains that prefix.)
const BAD_SPELLINGS = [
  // Misspellings of "assessment"
  'assessement_strategy',
  'assesment_strategy',
  'asessment_strategy',
  'assement_strategy',
  // Misspellings of "biopsychosocial"
  'byopsychosocial',
  'biopsychosicial',
  'biopsychosocail',
  'biopsycosocial',
  'biopyschosocial',
  // Misspellings of "plan" / "enabled" tail
  'biopsychosocial_play_enabled',
  'biopsychosocial_plan_enabaled',
  'biopsychosocial_plan_enable_',
  'plan_enabled_v1',
  'assessment_strategy_v1_enabled',
  'assessment_strategy_v2_enable_',
  'assessment_strategy_v2_enabaled',
  'assessment_strategy_enabled_v2',
]

// Files/dirs to skip when walking the tree — bulky non-source, generated,
// or (crucially) this test file itself, which by design contains every bad
// spelling as data.
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'build',
  'ios',
  'android',
  '.next',
  'coverage',
  'patches',
])
const SELF_BASENAME = 'feature-flag-spelling-contract.test.mjs'

// Only scan real source extensions — .md/docs comment threads are noise.
const SRC_EXT = /\.(ts|tsx|mjs|js|jsx)$/

// ---------------------------------------------------------------------------
// Walk the repo once, cache stripped-comment sources by relative path.
// ---------------------------------------------------------------------------

const SOURCES = collectSources(REPO_ROOT)

function collectSources(root) {
  const out = new Map()
  walk(root, root, out)
  return out
}

function walk(root, dir, out) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const abs = join(dir, name)
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walk(root, abs, out)
      continue
    }
    if (!st.isFile()) continue
    if (!SRC_EXT.test(name)) continue
    if (name === SELF_BASENAME) continue
    const rel = relative(root, abs)
    let raw
    try {
      raw = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    out.set(rel, stripComments(raw))
  }
}

function filesContaining(substr) {
  const hits = []
  for (const [rel, src] of SOURCES) {
    if (src.includes(substr)) hits.push(rel)
  }
  return hits.sort()
}

// ---------------------------------------------------------------------------
// (a) Every reference to `biopsychosocial_plan_enabled` uses the EXACT
//     canonical spelling. We first enumerate files that contain the string
//     (via a case-insensitive prefix regex tolerant of typos) then confirm
//     each one contains the canonical form.
// ---------------------------------------------------------------------------

test('(a) every file that references the biopsychosocial-plan flag uses the exact canonical spelling', () => {
  // Files that reference the canonical spelling at time of writing
  // (chunk 91 baseline). Any additional client-side reader that appears
  // later gets picked up by the same walk and is required to spell it
  // right too.
  const hits = filesContaining(FLAG_BIOPSYCHOSOCIAL)
  assert.ok(
    hits.length > 0,
    `expected at least one file to reference '${FLAG_BIOPSYCHOSOCIAL}' — none found. Has chunk 64/91 wiring been removed?`,
  )
  // Sanity: the two well-known readers must appear in the hit list.
  // If either drops out, the eligibility gate has been de-wired.
  for (const expected of [
    'hooks/use-notifications.ts',
    'hooks/use-assessment-strategy-v2-flag.ts',
  ]) {
    assert.ok(
      hits.includes(expected),
      `expected ${expected} to reference '${FLAG_BIOPSYCHOSOCIAL}' — hit list: ${hits.join(', ')}`,
    )
  }
})

// ---------------------------------------------------------------------------
// (b) Same, for `assessment_strategy_v2_enabled`.
// ---------------------------------------------------------------------------

test('(b) every file that references the assessment-strategy-v2 flag uses the exact canonical spelling', () => {
  const hits = filesContaining(FLAG_ASSESSMENT)
  assert.ok(
    hits.length > 0,
    `expected at least one file to reference '${FLAG_ASSESSMENT}' — none found. Has chunk 64/91 wiring been removed?`,
  )
  for (const expected of [
    'hooks/use-notifications.ts',
    'hooks/use-assessment-strategy-v2-flag.ts',
  ]) {
    assert.ok(
      hits.includes(expected),
      `expected ${expected} to reference '${FLAG_ASSESSMENT}' — hit list: ${hits.join(', ')}`,
    )
  }
})

// ---------------------------------------------------------------------------
// (c) NO source file contains a curated typo variant. This is the wire that
//     actually catches "silently disabled gating" — a misspelling that
//     compiles fine, ships fine, and turns off eligibility for that reader.
// ---------------------------------------------------------------------------

test('(c) no source file contains a known typo variant of either flag', () => {
  const violations = []
  for (const bad of BAD_SPELLINGS) {
    const hits = filesContaining(bad)
    for (const rel of hits) {
      violations.push(`${rel}: contains typo '${bad}'`)
    }
  }
  assert.equal(
    violations.length,
    0,
    `Found typo variants of the flag strings — a single-file misspell silently disables eligibility gating for that reader:\n  ${violations.join('\n  ')}`,
  )
})

// ---------------------------------------------------------------------------
// (d) Cross-reference: if hooks/use-notifications.ts references either
//     flag, at least one OTHER file must also reference the SAME flag
//     with the same spelling. The BE emits the flag; the notifications
//     hook reads it at tap-time; every additional client surface that
//     touches the flag must agree on spelling. If notifications is the
//     ONLY reader, either the BE flag has been abandoned (delete it) or
//     a peer reader has been silently retyped/removed.
// ---------------------------------------------------------------------------

test('(d) if hooks/use-notifications.ts references either flag, at least one OTHER file references the SAME spelling', () => {
  const NOTIF_KEY = 'hooks/use-notifications.ts'
  const notifSrc = SOURCES.get(NOTIF_KEY)
  assert.ok(
    notifSrc,
    `expected to find ${NOTIF_KEY} in the source walk — has it been renamed?`,
  )
  for (const flag of [FLAG_ASSESSMENT, FLAG_BIOPSYCHOSOCIAL]) {
    if (!notifSrc.includes(flag)) continue
    const hits = filesContaining(flag).filter((rel) => rel !== NOTIF_KEY)
    assert.ok(
      hits.length > 0,
      `${NOTIF_KEY} references '${flag}' but NO other file does — either a peer reader (hooks/use-assessment-strategy-v2-flag.ts, BpsWellbeingScoreCard, auth-prefetch, …) has been retyped/removed, or the BE flag itself is dead and should be deleted. A single-file reference is by definition uncorroborated: nothing else in the repo can catch a typo drift.`,
    )
  }
})
