// tests/unit/classic-view-link.test.mjs — ADR-0005 P0 (2026-07-30)
//
// Smoke / source-drift trip wires for the ADR-0005 P0 "Classic view"
// bottom-anchored escape-hatch link at components/plan/ClassicViewLink.tsx.
//
// CONTRACT (Ken's Q1 DECIDED)
//   The link's user-visible label is literally "Classic view" — no
//   variant ("Classic View", "classic view", "Switch to classic view",
//   "Old view", "Legacy view"). The same string is also the VoiceOver
//   accessibility label. If either drifts, sighted users see one word
//   and VoiceOver users hear a different one, which fails the a11y
//   invariance bar (`feedback_headless_browser_for_audits.md` companion
//   discipline: labels are the contract, not decoration).
//
// STRATEGY
//   `node --test` has no TS/TSX transpile step, so we cannot render the
//   component. Same source-drift pattern as
//   tests/unit/refresh-button-a11y-contract.test.mjs (chunk 114) and
//   tests/unit/kill-switches-contract.test.mjs (chunk 120): read the
//   .tsx as text, strip comments via the shared helper, and grep for
//   the exact literals that make the label observable to sighted +
//   assistive users.
//
// Wires:
//   (a) rendered <Text> child contains the exact string "Classic view".
//   (b) accessibilityLabel="Classic view" — matches the visible label.
//   (c) self-gates on the ADR-0005 P0 flag (isTabSwapBpsEnabled) so no
//       dead affordance ever appears on the flag-off legacy render path.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const LINK_PATH = join(REPO_ROOT, 'components', 'plan', 'ClassicViewLink.tsx')

const raw = readFileSync(LINK_PATH, 'utf8')
const src = stripComments(raw)

// ---------------------------------------------------------------------------
// (a) The visible label is exactly "Classic view".
//
// The label is emitted as a <Text> child — we assert the literal appears
// in the stripped source. We ALSO reject the case-drifted variants that
// a well-meaning refactor might introduce.
// ---------------------------------------------------------------------------

test('(a) visible label is exactly "Classic view"', () => {
  assert.ok(
    src.includes('Classic view'),
    `expected ${LINK_PATH} to render the exact label 'Classic view' (Q1 DECIDED default).`,
  )

  // Reject drifted casings / phrasings that would silently pass a
  // human eyeball QA but break the sighted↔a11y label parity in (b).
  const badLabels = [
    'Classic View',
    'classic view',
    'CLASSIC VIEW',
    'Switch to classic view',
    'Old view',
    'Legacy view',
    'Old plan',
    'Classic plan',
  ]
  for (const bad of badLabels) {
    assert.ok(
      !src.includes(bad),
      `${LINK_PATH} contains drifted label '${bad}' — Q1 DECIDED default is exactly 'Classic view'.`,
    )
  }
})

// ---------------------------------------------------------------------------
// (b) accessibilityLabel matches the visible label exactly.
// ---------------------------------------------------------------------------

test('(b) accessibilityLabel is exactly "Classic view"', () => {
  const a11yRe = /accessibilityLabel\s*=\s*["']Classic view["']/
  assert.ok(
    a11yRe.test(src),
    `expected ${LINK_PATH} to declare accessibilityLabel="Classic view" so VoiceOver reads the same string sighted users see.`,
  )
})

// ---------------------------------------------------------------------------
// (c) Self-gates on the ADR-0005 P0 tab-swap flag so the escape hatch is
//     inert when the flag is OFF (rollback path stays byte-identical).
// ---------------------------------------------------------------------------

test('(c) component self-gates on isTabSwapBpsEnabled and returns null when off', () => {
  assert.ok(
    /from\s+['"]@\/hooks\/use-tab-swap-bps-flag['"]/.test(src),
    `expected ${LINK_PATH} to import the ADR-0005 P0 tab-swap flag hook.`,
  )
  assert.ok(
    /if\s*\(\s*!\s*isTabSwapBpsEnabled\s*\(\s*\)\s*\)\s*return\s+null/.test(src),
    `expected ${LINK_PATH} to short-circuit to 'return null' when isTabSwapBpsEnabled() is false — otherwise a dead affordance renders on the legacy path.`,
  )
})
