// tests/unit/kill-switches-contract.test.mjs — CHUNK 120 (2026-07-23)
//
// Source-drift trip wires for the CLIENT-SIDE kill-switch module
// constants that gate feature paths across the BPS pivot surface.
//
// BACKGROUND
//   Post-BPS pivot (chunks 47+), several feature paths (BPS plan
//   sections, wellbeing domain picker, notification routing) are guarded
//   by module-const kill switches instead of runtime feature flags. The
//   contract is:
//
//     - Each switch is a top-level `const NAME = true` (optionally
//       `export const NAME = true`) declaration.
//     - Flipping ON/OFF is a code edit + OTA push (~30-60s) — not a
//       runtime env-var flip.
//     - The DEFAULT VALUE is `true`, because the constants are only
//       introduced when the guarded feature is READY to ship. A silent
//       drift to `false` (e.g. mid-refactor, mid-merge) would ship the
//       shipped feature disabled to every user in the next OTA.
//
// WHAT THIS SUITE DEFENDS
//   Chunk 81 already asserted the notification kill-switch defaults via a
//   BEHAVIORAL test (call the router, observe the route). This suite is
//   broader and structural: assert that the constants EXIST and DEFAULT
//   TO TRUE across every client kill-switch site, so an accidental
//   default flip to `false` — or a rewrite to `process.env.X === 'true'`
//   that quietly resolves to `false` in prod — is caught by `npm test`
//   before it merges.
//
//   Wires:
//     (a) components/health-plan/BpsWellbeingScoreCard.tsx —
//         WELLBEING_DOMAIN_PICKER_ENABLED defined + default true (chunk 67).
//     (b) lib/notification-routing.ts —
//         NOTIFICATION_MEDS_ROUTE_BPS_ENABLED defined + default true (chunk 64).
//     (c) lib/notification-routing.ts —
//         NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED defined + default true (chunk 70).
//     (d) components/health-plan/BiopsychosocialPlanScreen.tsx —
//         at least one BPS_*_ENABLED module-const kill switch defined AND
//         defaulted to true. (Multiple ship today: BPS_TODAY_HERO_ENABLED,
//         BPS_AI_SUMMARY_ENABLED, BPS_PROGRESS_LINK_ENABLED, etc. — a
//         handful of chunk 60+ ports. The "at least one" bar keeps this
//         wire resilient to Ken renaming individual switches while still
//         catching a wholesale conversion away from the module-const
//         pattern.)
//     (e) None of the three files use `process.env` or feature-flag
//         runtime lookups. The module-const pattern is DELIBERATE — flips
//         are OTA + code deploys, not runtime env-var flips. A drift to
//         `const NAME = process.env.KILL_SWITCH === 'true'` silently
//         resolves to `false` in a stage that never sets that env-var
//         and disables the shipped feature everywhere.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / 98 v2 / 103 / 107 / 109 /
// 113 / 116 / 119 pattern)
//   All three files are TypeScript/TSX modules — but `npm test` runs the
//   node --test harness with no TS transpile step. Importing the modules
//   directly is not viable in the mjs harness. Instead we read each
//   file as text, strip comments via the shared helper (chunk 103), and
//   grep for the declaration shape. If a wire below fails, DO NOT tweak
//   the regex to make it pass — read the diff on the affected source
//   file, confirm the change is deliberate, and only then update the
//   wire in lockstep with the chunk that introduced the switch.
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

const WELLBEING_CARD_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BpsWellbeingScoreCard.tsx',
)
const NOTIFICATION_ROUTING_PATH = join(
  REPO_ROOT,
  'lib',
  'notification-routing.ts',
)
const BPS_PLAN_SCREEN_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BiopsychosocialPlanScreen.tsx',
)

const WELLBEING_CARD_RAW = readFileSync(WELLBEING_CARD_PATH, 'utf8')
const NOTIFICATION_ROUTING_RAW = readFileSync(NOTIFICATION_ROUTING_PATH, 'utf8')
const BPS_PLAN_SCREEN_RAW = readFileSync(BPS_PLAN_SCREEN_PATH, 'utf8')

const WELLBEING_CARD_SRC = stripComments(WELLBEING_CARD_RAW)
const NOTIFICATION_ROUTING_SRC = stripComments(NOTIFICATION_ROUTING_RAW)
const BPS_PLAN_SCREEN_SRC = stripComments(BPS_PLAN_SCREEN_RAW)

// -------------------------------------------------------------------------
// Shared helper: build a regex matching a top-level
//
//   [export] const NAME [: TypeAnnotation] = true[;]
//
// declaration for a specific constant name. Whitespace-tolerant and
// type-annotation-tolerant (some switches carry `: boolean`, most do
// not). Case-SENSITIVE on the identifier — a rename to lowercase or a
// typo counts as drift.
// -------------------------------------------------------------------------

function constDefaultTrueRegex(name) {
  // Sequence: optional `export`, `const`, NAME, optional `: <type>` (any
  // chars other than `=`), `=`, `true`, optional `;`. The trailing
  // word-boundary keeps `true` from matching `truest` or similar.
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*(?::[^=\\n]+)?=\\s*true\\b`,
  )
}

// -------------------------------------------------------------------------
// (a) BpsWellbeingScoreCard.tsx — WELLBEING_DOMAIN_PICKER_ENABLED
//     defined AND default true (chunk 67). Flipping to false rolls back
//     the domain-scoped picker to the chunk-66 deep-link-to-stepper
//     behavior — the OTA-revertible escape hatch Ken asked for. A
//     silent drift to false in a merge would ship the feature disabled.
// -------------------------------------------------------------------------

test('(a) BpsWellbeingScoreCard.tsx: WELLBEING_DOMAIN_PICKER_ENABLED defined and defaults to true', () => {
  assert.match(
    WELLBEING_CARD_SRC,
    constDefaultTrueRegex('WELLBEING_DOMAIN_PICKER_ENABLED'),
    `components/health-plan/BpsWellbeingScoreCard.tsx must declare \`const WELLBEING_DOMAIN_PICKER_ENABLED = true\` at module scope (chunk 67 kill-switch). If this fails, either (i) the const was renamed/removed — update this wire in lockstep with the rename, or (ii) the default drifted to \`false\` and the domain-scoped picker is silently disabled for every user on the next OTA. Do NOT flip this wire to accept a false default without an explicit disable-plan comment on the const.`,
  )
})

// -------------------------------------------------------------------------
// (b) lib/notification-routing.ts — NOTIFICATION_MEDS_ROUTE_BPS_ENABLED
//     defined AND default true (chunk 64). Flipping to false routes the
//     BIOPSYCHOSOCIAL_MED_UPDATE push back to the legacy meds surface.
//     A silent drift to false disables the BPS-surface med-update route
//     for every bio-eligible patient on the next OTA. Behavioral parity
//     with chunk 81's notification kill-switch DEFAULTS behavior test —
//     this wire is the structural companion.
// -------------------------------------------------------------------------

test('(b) lib/notification-routing.ts: NOTIFICATION_MEDS_ROUTE_BPS_ENABLED defined and defaults to true', () => {
  assert.match(
    NOTIFICATION_ROUTING_SRC,
    constDefaultTrueRegex('NOTIFICATION_MEDS_ROUTE_BPS_ENABLED'),
    `lib/notification-routing.ts must declare \`export const NOTIFICATION_MEDS_ROUTE_BPS_ENABLED = true\` at module scope (chunk 64 kill-switch). If this fails, either (i) the const was renamed/removed — update this wire AND the chunk 81 behavioral test in lockstep, or (ii) the default drifted to \`false\` and BIOPSYCHOSOCIAL_MED_UPDATE pushes silently route to the legacy meds surface for every bio-eligible patient on the next OTA.`,
  )
})

// -------------------------------------------------------------------------
// (c) lib/notification-routing.ts —
//     NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED defined AND default true
//     (chunk 70). Same rationale as (b) but for the BIOPSYCHOSOCIAL_PLAN_READY
//     push. Silent drift to false detaches the ready notification from
//     the BPS surface where the freshly-regenerated plan actually
//     renders — user lands on legacy /Home/health-plan with stale copy.
// -------------------------------------------------------------------------

test('(c) lib/notification-routing.ts: NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED defined and defaults to true', () => {
  assert.match(
    NOTIFICATION_ROUTING_SRC,
    constDefaultTrueRegex('NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED'),
    `lib/notification-routing.ts must declare \`export const NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED = true\` at module scope (chunk 70 kill-switch). If this fails, either (i) the const was renamed/removed — update this wire AND the chunk 81 behavioral test in lockstep, or (ii) the default drifted to \`false\` and BIOPSYCHOSOCIAL_PLAN_READY pushes silently land on legacy /Home/health-plan with stale copy for every bio-eligible patient on the next OTA.`,
  )
})

// -------------------------------------------------------------------------
// (d) BiopsychosocialPlanScreen.tsx — at least one BPS_*_ENABLED module
//     const defined AND defaulted to true.
//
//     The screen ships a family of chunk-60+ port kill switches
//     (BPS_TODAY_HERO_ENABLED, BPS_AI_SUMMARY_ENABLED,
//     BPS_PROGRESS_LINK_ENABLED, BPS_NOTIFICATION_CATEGORIES_ENABLED,
//     BPS_MEDICATIONS_EDITOR_ENABLED, BPS_MODAL_CONSOLIDATION_ENABLED,
//     BPS_SELF_ASSESSMENTS_ENABLED, BPS_WELLBEING_SCORE_ENABLED,
//     BPS_PLAN_FOCUS_SIGNAL_ENABLED, etc.). Ken renames individual
//     switches often — pinning any single name here would be brittle.
//     Instead we require that AT LEAST ONE BPS_*_ENABLED module const
//     ships with `= true`. This catches (i) a wholesale conversion away
//     from the module-const pattern (e.g. to a hook / config object),
//     and (ii) a merge that silently flips every default to false.
//
//     Note: not every ported switch defaults to true — e.g.
//     BPS_INTAKE_CTA_ENABLED currently ships as false because Ken is
//     still iterating on the intake CTA slot. The "at least one" bar
//     avoids blocking those intentional-false defaults.
// -------------------------------------------------------------------------

// Match any `[export] const BPS_<TAIL>_ENABLED [: type] = true` line
// in the stripped source, capturing the NAME. Global flag so we can
// enumerate them.
const BPS_ENABLED_TRUE_PATTERN =
  /(?:^|\n)\s*(?:export\s+)?const\s+(BPS_[A-Z0-9_]+_ENABLED)\s*(?::[^=\n]+)?=\s*true\b/g

function findBpsEnabledTrueConsts(src) {
  const found = []
  let m
  const re = new RegExp(BPS_ENABLED_TRUE_PATTERN.source, 'g')
  while ((m = re.exec(src)) !== null) {
    found.push(m[1])
  }
  return found
}

test('(d) BiopsychosocialPlanScreen.tsx: at least one BPS_*_ENABLED module const defaults to true', () => {
  const found = findBpsEnabledTrueConsts(BPS_PLAN_SCREEN_SRC)
  assert.ok(
    found.length > 0,
    `components/health-plan/BiopsychosocialPlanScreen.tsx must declare at least one \`const BPS_<NAME>_ENABLED = true\` at module scope (chunk 60+ port kill-switch pattern). Found zero. If this fails, either (i) every BPS_*_ENABLED const was silently flipped to false — every ported feature (Today hero, AI summary, progress link, notification categories, medications editor, modal consolidation, self-assessments, wellbeing score, plan focus signal) ships disabled — or (ii) the module-const kill-switch pattern was replaced wholesale (e.g. by a hook / config-object lookup), losing the one-line OTA-revert escape hatch documented in chunk 47. Do NOT flip this wire to accept zero without an explicit sign-off on removing the pattern.`,
  )
})

// -------------------------------------------------------------------------
// (e) None of the three files use `process.env` (a proxy for "feature
//     flag runtime lookup"). The module-const pattern is DELIBERATE:
//     flips are OTA + code deploys, not runtime env-var flips. A drift
//     to `const NAME = process.env.KILL_SWITCH === 'true'` silently
//     resolves to `false` in every stage that never sets the env-var
//     and disables the shipped feature everywhere.
//
//     We check the COMMENT-STRIPPED source so a "consider promoting to
//     process.env" note in a doc comment doesn't false-positive. The
//     check is per-file so the failure message points at the file that
//     drifted.
// -------------------------------------------------------------------------

const PROCESS_ENV_PATTERN = /\bprocess\.env\b/

test('(e) BpsWellbeingScoreCard.tsx does not use process.env for the kill switch', () => {
  assert.doesNotMatch(
    WELLBEING_CARD_SRC,
    PROCESS_ENV_PATTERN,
    `components/health-plan/BpsWellbeingScoreCard.tsx must NOT reference process.env (module-const kill-switch pattern is deliberate — OTA flips only, not runtime env-var flips). If this fails, a runtime-env-var lookup slipped in — likely \`const WELLBEING_DOMAIN_PICKER_ENABLED = process.env.X === 'true'\`, which silently resolves to false in every stage that never sets X and disables the shipped feature everywhere on the next OTA. Revert to \`const WELLBEING_DOMAIN_PICKER_ENABLED = true\` unless the promotion-to-runtime-flag follow-up is explicitly approved.`,
  )
})

test('(e) lib/notification-routing.ts does not use process.env for the kill switches', () => {
  assert.doesNotMatch(
    NOTIFICATION_ROUTING_SRC,
    PROCESS_ENV_PATTERN,
    `lib/notification-routing.ts must NOT reference process.env (module-const kill-switch pattern is deliberate — OTA flips only, not runtime env-var flips). If this fails, a runtime-env-var lookup slipped in for NOTIFICATION_MEDS_ROUTE_BPS_ENABLED or NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED, which silently resolves to false in every stage that never sets the env-var and reverts every BPS-surface notification to legacy on the next OTA. Revert to the plain \`export const NAME = true\` shape unless the promotion-to-runtime-flag follow-up (chunk 64 / 70 footnote) is explicitly approved.`,
  )
})

test('(e) BiopsychosocialPlanScreen.tsx does not use process.env for the kill switches', () => {
  assert.doesNotMatch(
    BPS_PLAN_SCREEN_SRC,
    PROCESS_ENV_PATTERN,
    `components/health-plan/BiopsychosocialPlanScreen.tsx must NOT reference process.env (module-const kill-switch pattern is deliberate — OTA flips only, not runtime env-var flips). If this fails, a runtime-env-var lookup slipped in for a BPS_*_ENABLED const, which silently resolves to false in every stage that never sets the env-var and disables the affected ported feature everywhere on the next OTA. Revert to the plain \`const NAME = true\` shape unless a promotion-to-runtime-flag follow-up is explicitly approved.`,
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 / 107 / 109 / 113 / 116 discipline
// — prove the trap snaps shut).
//
// These tests do NOT read the live source files. They exercise the exact
// parsers + assertions above against synthetic sources whose SOLE PURPOSE
// is to reproduce the drift shape each wire is meant to catch. If ANY
// self-check flips green when the drift is present, the corresponding
// wire above is toothless.
// =========================================================================

// Self-check for wire (a): flip WELLBEING_DOMAIN_PICKER_ENABLED default
// to false. The wire's `= true` regex must NOT match this fixture.
test('self-check: wire (a) fails when WELLBEING_DOMAIN_PICKER_ENABLED default flips to false', () => {
  const brokenSrc = [
    "import { View } from 'react-native'",
    "",
    "const WELLBEING_DOMAIN_PICKER_ENABLED = false",
    "",
    "export function BpsWellbeingScoreCard() { return null }",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.doesNotMatch(
    stripped,
    constDefaultTrueRegex('WELLBEING_DOMAIN_PICKER_ENABLED'),
    'self-check: wire (a) must NOT match `= true` when the source declared `= false`. If this flips true, the regex is broken and wire (a) cannot detect a silent default flip.',
  )
})

// Self-check for wire (b): delete NOTIFICATION_MEDS_ROUTE_BPS_ENABLED
// entirely. The wire's identifier-anchored regex must NOT match a
// fixture that lacks the identifier.
test('self-check: wire (b) fails when NOTIFICATION_MEDS_ROUTE_BPS_ENABLED is deleted', () => {
  const brokenSrc = [
    "// notification-routing.ts — kill-switch quietly removed in a merge",
    "",
    "export const NOTIFICATION_PLAN_READY_ROUTE_BPS_ENABLED = true;",
    "",
    "export function routeForNotification() { return '/Home/health-plan' }",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.doesNotMatch(
    stripped,
    constDefaultTrueRegex('NOTIFICATION_MEDS_ROUTE_BPS_ENABLED'),
    'self-check: wire (b) must NOT match when the identifier NOTIFICATION_MEDS_ROUTE_BPS_ENABLED was removed from the source. If this flips true, the regex is anchored on the wrong shape and wire (b) cannot detect a silent removal.',
  )
})

// Self-check for wire (e): add process.env.KILL_SWITCH to the routing
// file. The wire's process.env pattern MUST match this fixture.
test('self-check: wire (e) fails when process.env.KILL_SWITCH is introduced to the routing file', () => {
  const brokenSrc = [
    "// notification-routing.ts — someone promoted the kill switch to a runtime env var",
    "",
    "export const NOTIFICATION_MEDS_ROUTE_BPS_ENABLED =",
    "  process.env.KILL_SWITCH === 'true';",
    "",
    "export function routeForNotification() { return '/Home/biopsychosocial-plan' }",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  assert.match(
    stripped,
    PROCESS_ENV_PATTERN,
    'self-check: wire (e) must observe process.env in the mutated fixture. If this flips false, the pattern is broken and wire (e) cannot detect a runtime-env-var lookup that silently disables the shipped kill switch.',
  )
})

// Bonus self-check for wire (d): a fixture with ONLY a `= false`
// BPS_*_ENABLED const (mimicking BPS_INTAKE_CTA_ENABLED-only) should
// fail the "at least one true" bar. Guards against a regression where
// findBpsEnabledTrueConsts stops distinguishing true from false and
// wire (d) silently passes on an all-false module.
test('self-check: wire (d) fails when every BPS_*_ENABLED const defaults to false', () => {
  const brokenSrc = [
    "const BPS_TODAY_HERO_ENABLED = false;",
    "const BPS_AI_SUMMARY_ENABLED = false;",
    "export const BPS_MODAL_CONSOLIDATION_ENABLED = false;",
    "",
    "export function BiopsychosocialPlanScreen() { return null }",
  ].join('\n')
  const stripped = stripComments(brokenSrc)
  const found = findBpsEnabledTrueConsts(stripped)
  assert.equal(
    found.length,
    0,
    `self-check: wire (d) must find ZERO \`= true\` BPS_*_ENABLED consts in the all-false fixture. Actual: ${JSON.stringify(found)}. If this flips non-zero, the parser stopped distinguishing true from false and wire (d) cannot detect a wholesale default flip to false.`,
  )
})
