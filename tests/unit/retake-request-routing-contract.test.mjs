// tests/unit/retake-request-routing-contract.test.mjs — COS-482 Phase 1 (2026-07-24)
//
// Source-drift trip wires for the ASSESSMENT_RETAKE_REQUESTED push routing
// wired across TWO files:
//   - lib/notification-routing.ts               — pure route mapper
//   - hooks/use-notifications.ts                — invalidates the inbox
//     list on both the WARM listener + the WARM/COLD tap handler.
//
// Follows the chunk 84/94 pattern (see feature-flag-spelling-contract.test.mjs
// header for the discipline). If any assertion fires, DO NOT edit the
// regex — read the diff, confirm it is deliberate, then update the wire
// in lockstep with the source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const ROUTING_PATH = join(REPO_ROOT, 'lib', 'notification-routing.ts')
const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-notifications.ts')

const routingSrc = stripComments(readFileSync(ROUTING_PATH, 'utf8'))
const hookSrc = stripComments(readFileSync(HOOK_PATH, 'utf8'))

// ── Routing surface ─────────────────────────────────────────────────────

test('notification-routing exports the retake kill switch (default ON — sourced in tests)', () => {
  assert.match(routingSrc, /export\s+const\s+NOTIFICATION_RETAKE_ROUTE_ENABLED\s*=/)
  // The token itself does not embed the value here (we assert the value
  // in tests/unit/notification-routing.test.ts which imports the module),
  // but we can pin the shape: the const must be a boolean literal.
  assert.match(routingSrc, /NOTIFICATION_RETAKE_ROUTE_ENABLED\s*=\s*(true|false)/)
})

test('routeForNotificationData handles ASSESSMENT_RETAKE_REQUESTED as a NAMED case (not the default fall-through)', () => {
  // The case must appear as a literal case label so a future diff that
  // removes / renames it fails loudly rather than silently collapsing
  // into the default → Home branch (which would *also* return null and
  // hide the regression).
  assert.match(routingSrc, /case\s+['"]ASSESSMENT_RETAKE_REQUESTED['"]\s*:/)
})

// ── Push handler invalidations ──────────────────────────────────────────

test('warm-notification listener invalidates the retake-requests query key on ASSESSMENT_RETAKE_REQUESTED', () => {
  // Two things must appear near each other for the invalidation to fire:
  // the type-string check AND the exact query-key literal. We regex both.
  assert.match(hookSrc, /['"]ASSESSMENT_RETAKE_REQUESTED['"]/)
  assert.match(hookSrc, /queryKey:\s*\[\s*['"]retake-requests['"]\s*,\s*['"]me['"]\s*\]/)
})

test('warm/cold tap navigator ALSO invalidates the retake-requests query on tap', () => {
  // The listener + the tap path each have their own invalidateQueries
  // call — the tap path pre-invalidates so the destination screen (Home
  // → RetakeRequestInboxCard) renders fresh data instead of a stale row
  // that races with the CM's revoke.
  const hits =
    (hookSrc.match(/queryKey:\s*\[\s*['"]retake-requests['"]\s*,\s*['"]me['"]\s*\]/g) ?? [])
      .length
  assert.ok(
    hits >= 2,
    `expected the retake-requests query key to be invalidated in BOTH the listener and the tap path (found ${hits})`,
  )
})
