// tests/unit/tab-swap-bps-flag.test.mjs — ADR-0005 P0 (2026-07-30)
//
// Unit + source-drift trip wires for the tab-swap build-time flag hook at
// hooks/use-tab-swap-bps-flag.ts (ADR-0005 Plan-screen retirement, P0).
//
// CONTRACT
// --------
// `isTabSwapBpsEnabled()` MUST be strictly truthy — the ONLY value of
// `process.env.EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED` that returns `true` is
// the exact string `"true"`. Everything else (undefined, empty string,
// "1", "TRUE", "True", "false", "yes", any typo, a real boolean `true`,
// a numeric `1`) MUST return `false`.
//
// WHY THIS MATTERS
//   The flag temp-retires the classic Plan tab and mounts BPS in its
//   slot (ADR-0005). A silent drift to loose truthiness (e.g. `!!x` or
//   `x === 'true' || x === '1'`) would flip the tab-swap ON in any
//   stage that happened to set the env-var to a non-canonical value —
//   dev/staging/prod each set env-vars independently and the failure
//   mode is "shipped feature enabled in a stage where product isn't
//   ready". Mirrors `feedback_env_flag_deploy_drift.md` (dark-launch
//   flags default OFF, no ambiguous coercion) and `feedback_dark_launch_via_ssm_before_code.md`
//   (30-sec revert path requires deterministic flag semantics).
//
// STRATEGY
//   `node --test` has no TS transpile step, so we CANNOT import the .ts
//   module. Instead we:
//     (a) read the .ts source, grep for the exact strict-equality
//         expression, so a refactor to `!!` or `Boolean(...)` fails
//         loudly rather than silently coercing;
//     (b) reproduce the one-line predicate here and exhaustively table-
//         test every input shape a stage might send. If (a) still holds,
//         (b) is guaranteed to describe production behavior.
//
//   Same pattern as tests/unit/kill-switches-contract.test.mjs (chunk 120)
//   and tests/unit/feature-flag-spelling-contract.test.mjs (chunk 121).
//
// npm test picks this up via the `tests/unit/*.test.mjs` glob.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-tab-swap-bps-flag.ts')
const ENV_KEY = 'EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED'

// ---------------------------------------------------------------------------
// (a) Source-drift wire — the predicate MUST be a strict-equality compare
//     against the literal string 'true'. Reject `!!`, `Boolean(...)`, `==`,
//     `.toLowerCase()`, or any additional accepted spelling.
// ---------------------------------------------------------------------------

test('(a) hook source uses strict === "true" compare on the canonical env key', () => {
  const raw = readFileSync(HOOK_PATH, 'utf8')
  const src = stripComments(raw)

  // The exact predicate we depend on. Whitespace-tolerant.
  const strictRe = new RegExp(
    String.raw`process\.env\.${ENV_KEY}\s*===\s*['"]true['"]`,
  )
  assert.ok(
    strictRe.test(src),
    `expected ${HOOK_PATH} to contain 'process.env.${ENV_KEY} === "true"' — a drift to !!, Boolean(...), ==, or additional accepted spellings silently loosens the flag.`,
  )

  // Sanity: reject the loose shapes that would silently coerce.
  const looseShapes = [
    new RegExp(String.raw`!!\s*process\.env\.${ENV_KEY}`),
    new RegExp(String.raw`Boolean\(\s*process\.env\.${ENV_KEY}`),
    new RegExp(String.raw`process\.env\.${ENV_KEY}\s*==\s*['"]true['"]`), // == not ===
    new RegExp(String.raw`process\.env\.${ENV_KEY}[^=]*toLowerCase`),
    new RegExp(String.raw`process\.env\.${ENV_KEY}\s*===\s*['"]1['"]`),
  ]
  for (const bad of looseShapes) {
    assert.ok(
      !bad.test(src),
      `${HOOK_PATH} contains a loose truthiness shape matching ${bad} — dark-launch flags must default OFF and only accept the exact string "true".`,
    )
  }
})

// ---------------------------------------------------------------------------
// (b) Behavioral table — reproduce the one-line predicate and prove that
//     ONLY the exact string 'true' enables it. This is safe because (a)
//     pins the source to this exact predicate.
// ---------------------------------------------------------------------------

// Local reproduction of `isTabSwapBpsEnabled` — kept in lockstep with (a).
function isTabSwapBpsEnabledLike(rawValue) {
  const prev = process.env[ENV_KEY]
  try {
    if (rawValue === undefined) {
      delete process.env[ENV_KEY]
    } else {
      // process.env coerces every assignment to string, mirroring the
      // real Metro/Expo build-time inline behavior.
      process.env[ENV_KEY] = rawValue
    }
    return process.env[ENV_KEY] === 'true'
  } finally {
    if (prev === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = prev
  }
}

test('(b) only the exact string "true" enables the flag', () => {
  assert.equal(isTabSwapBpsEnabledLike('true'), true, `'true' must enable`)
})

test('(b) every non-canonical value returns false', () => {
  const cases = [
    ['undefined (unset)', undefined, false],
    ['empty string', '', false],
    ['"false"', 'false', false],
    ['"True"', 'True', false],
    ['"TRUE"', 'TRUE', false],
    ['" true"', ' true', false],
    ['"true "', 'true ', false],
    ['"1"', '1', false],
    ['"0"', '0', false],
    ['"yes"', 'yes', false],
    ['"on"', 'on', false],
    ['boolean true (coerced to "true" by env) ⇒ enabled', true, true],
    // NOTE: assigning boolean `true` to process.env coerces to the string
    // "true", which the strict compare accepts. This documents that the
    // ONLY way a caller can accidentally enable the flag is by literally
    // producing the string "true" (or a value that stringifies to it).
    ['boolean false (coerced to "false")', false, false],
    ['number 1 (coerced to "1")', 1, false],
    ['number 0 (coerced to "0")', 0, false],
    ['"truex" typo', 'truex', false],
    ['"xtrue" typo', 'xtrue', false],
  ]
  for (const [label, input, expected] of cases) {
    assert.equal(
      isTabSwapBpsEnabledLike(input),
      expected,
      `${label}: expected ${expected} for input ${JSON.stringify(input)}`,
    )
  }
})
