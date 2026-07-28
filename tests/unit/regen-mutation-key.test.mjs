// tests/unit/regen-mutation-key.test.mjs — CHUNK 94 (2026-07-23)
//
// Pins the CONTRACT for the shared bio-plan regenerate mutation key so the
// two cross-instance observers (BpsWellbeingScoreCard's CTA-loop gate from
// chunk 67 + BiopsychosocialPlanScreen's pending banner from chunk 77) keep
// wiring to the SAME `useIsMutating({ mutationKey })` handle that
// `useRegenerateBiopsychosocialPlan()` stamps onto the mutation via
// `mutationKey: [...REGENERATE_BIO_PLAN_MUTATION_KEY]`.
//
// Failure mode this defends:
//   Both observers call `useIsMutating(REGENERATE_BIO_PLAN_MUTATION_KEY)` —
//   React Query matches by structural key equality. If somebody either
//     (1) renames the exported constant (e.g. → REGEN_BIO_MUTATION_KEY) and
//         imports get regenerated automatically, or
//     (2) changes the key SHAPE from ['regen-biopsychosocial-plan']  to
//         ['regen', 'biopsychosocial-plan'] (or drops the array wrapper
//         entirely), or
//     (3) leaves the constant intact but forgets to spread it into the
//         `mutationKey` option on the mutation itself, or
//     (4) creates a parallel local const in one of the two observer files
//         with the same literal value ("harmless duplication") — the two
//         observers stop matching cross-instance and the "Regenerating…"
//         banner + Processing-state CTA silently disappear mid-run
//   … then useIsMutating() returns 0 the moment the picker unmounts,
//   BpsWellbeingScoreCard's CTA loop returns to idle, and Ken's banner
//   never renders. See chunk 67 comment in use-biopsychosocial-plan.ts.
//
// WHY A SOURCE-DRIFT TRIP WIRE (chunk 84 v2 pattern):
//   The repo runs `node --test tests/unit/*` with no TS transpiler. There
//   is no runtime we could import the .ts constant from without dragging
//   in @tanstack/react-query + jsdom + a React harness. Instead we readFile
//   the three .ts sources and assert regex shapes on the raw text — same
//   discipline as tests/unit/use-wellbeing-derivation.test.mjs (chunk 84)
//   and tests/unit/use-notifications-bps-eligible.test.mjs (chunk 91).
//
// npm test picks this file up via the `tests/unit/*.test.mjs` glob in
// package.json (unchanged since chunks 84/85/91).
//
// If any assertion below fires, DO NOT edit the regex to make it pass.
// Confirm the source diff is intentional; only then update the wire.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-biopsychosocial-plan.ts')
const CARD_PATH = join(REPO_ROOT, 'components', 'health-plan', 'BpsWellbeingScoreCard.tsx')
const SCREEN_PATH = join(REPO_ROOT, 'components', 'health-plan', 'BiopsychosocialPlanScreen.tsx')

const HOOK_SRC = readFileSync(HOOK_PATH, 'utf8')
const CARD_SRC = readFileSync(CARD_PATH, 'utf8')
const SCREEN_SRC = readFileSync(SCREEN_PATH, 'utf8')

// The canonical identifier & alias-path. If EITHER changes, every observer
// import statement must move in lockstep — that's exactly what wires (c-*)
// below enforce.
const CONST_NAME = 'REGENERATE_BIO_PLAN_MUTATION_KEY'
const IMPORT_PATH = '@/hooks/use-biopsychosocial-plan'

// =========================================================================
// (a) The exported constant name is exactly REGENERATE_BIO_PLAN_MUTATION_KEY
// =========================================================================

test('(a) hooks/use-biopsychosocial-plan.ts exports a const named REGENERATE_BIO_PLAN_MUTATION_KEY', () => {
  // The exact declaration shape at chunk 67 land time:
  //   export const REGENERATE_BIO_PLAN_MUTATION_KEY = [...] as const
  // A rename (e.g. REGEN_BIO_MUTATION_KEY) or a non-export downgrade
  // (const … not exported) both break every downstream `useIsMutating`
  // caller — this wire fires before the two consumer imports below do.
  assert.match(
    HOOK_SRC,
    new RegExp(`export\\s+const\\s+${CONST_NAME}\\s*=`),
    `hooks/use-biopsychosocial-plan.ts must export a const named ${CONST_NAME} — chunks 67 + 77 both import it by this exact identifier`,
  )
})

// =========================================================================
// (b) Value shape is an array literal (React Query mutationKey convention)
// =========================================================================

test('(b) REGENERATE_BIO_PLAN_MUTATION_KEY value is a top-level array literal (React Query key convention)', () => {
  // React Query treats mutationKey as an array (structural equality on
  // element identity). A string key (`'regen-…'`) or object key would
  // silently opt out of `useIsMutating({ mutationKey })` matching.
  //
  // Also assert the `as const` suffix — spreads at the observer sites
  // (`[...REGENERATE_BIO_PLAN_MUTATION_KEY]`) rely on the tuple-typed
  // readonly array so TS widens correctly; dropping `as const` would
  // silently change the type to `string[]` which still runs but breaks
  // downstream generic inference on `useIsMutating`.
  assert.match(
    HOOK_SRC,
    new RegExp(`export\\s+const\\s+${CONST_NAME}\\s*=\\s*\\[[^\\]]+\\]\\s*as\\s+const`),
    'REGENERATE_BIO_PLAN_MUTATION_KEY must be assigned to an array literal `as const` — a string/object key silently breaks useIsMutating matching',
  )
})

test('(b) REGENERATE_BIO_PLAN_MUTATION_KEY array is exactly the 1-tuple [\'regen-biopsychosocial-plan\'] (verbatim key literal)', () => {
  // Ken's user-visible surfaces (banner + CTA gate) match this key by
  // element identity. If someone flips it to a 2-tuple like
  // ['regen', 'biopsychosocial-plan'] the exact "silently returns 0"
  // failure documented in this chunk's rationale trips: the observers
  // still compile because they spread the same constant, but any OLD
  // in-flight mutation (or a stray hard-coded key elsewhere in the
  // codebase) stops matching.
  assert.match(
    HOOK_SRC,
    new RegExp(`export\\s+const\\s+${CONST_NAME}\\s*=\\s*\\[\\s*'regen-biopsychosocial-plan'\\s*\\]\\s*as\\s+const`),
    "REGENERATE_BIO_PLAN_MUTATION_KEY must remain the exact 1-tuple ['regen-biopsychosocial-plan'] — resegmenting the string across array slots (['regen','biopsychosocial-plan']) breaks structural match against any hard-coded key elsewhere",
  )
})

// =========================================================================
// (c) Source-drift trip wires — both observer files import the SAME
//     identifier from the SAME alias path (no parallel constant)
// =========================================================================

test('(c) BpsWellbeingScoreCard.tsx imports REGENERATE_BIO_PLAN_MUTATION_KEY from @/hooks/use-biopsychosocial-plan', () => {
  // Multi-line `import { … } from '…'` shape. Assert both the identifier
  // appears AND the exact alias path — a shadow local `const REGEN…`
  // would compile fine but wire to a different array-literal identity,
  // silently zeroing out `useIsMutating`.
  assertImportsIdentifierFromPath(CARD_SRC, CONST_NAME, IMPORT_PATH, 'BpsWellbeingScoreCard.tsx')
})

test('(c) BiopsychosocialPlanScreen.tsx imports REGENERATE_BIO_PLAN_MUTATION_KEY from @/hooks/use-biopsychosocial-plan', () => {
  assertImportsIdentifierFromPath(SCREEN_SRC, CONST_NAME, IMPORT_PATH, 'BiopsychosocialPlanScreen.tsx')
})

test('(c) neither observer file declares a PARALLEL const REGENERATE_BIO_PLAN_MUTATION_KEY (no accidental shadow)', () => {
  // A shadow declaration in either file would out-scope the import and
  // silently point observers at a different array identity. Only the
  // hook file is allowed to `const REGENERATE_BIO_PLAN_MUTATION_KEY =`.
  for (const [label, src] of [
    ['BpsWellbeingScoreCard.tsx', CARD_SRC],
    ['BiopsychosocialPlanScreen.tsx', SCREEN_SRC],
  ]) {
    assert.doesNotMatch(
      src,
      new RegExp(`\\bconst\\s+${CONST_NAME}\\s*=`),
      `${label} must NOT declare a local const named ${CONST_NAME} — that shadow would silently defeat the shared-key match with the hook`,
    )
  }
})

test('(c) both observer files pass REGENERATE_BIO_PLAN_MUTATION_KEY to useIsMutating({ mutationKey }) — the actual gate', () => {
  // The load-bearing call shape. Chunk 67 CTA-loop + chunk 77 banner
  // both spread the same tuple so type inference works; asserting the
  // spread here catches any refactor that drops the constant reference
  // (e.g. inlining `mutationKey: ['regen-biopsychosocial-plan']` in
  // one file — which would still work today but silently drift the
  // moment the exported tuple changes).
  const spreadUsage = new RegExp(
    `useIsMutating\\s*\\(\\s*\\{[^}]*mutationKey\\s*:\\s*\\[\\s*\\.\\.\\.\\s*${CONST_NAME}\\s*\\][^}]*\\}\\s*\\)`,
  )
  for (const [label, src] of [
    ['BpsWellbeingScoreCard.tsx', CARD_SRC],
    ['BiopsychosocialPlanScreen.tsx', SCREEN_SRC],
  ]) {
    assert.match(
      src,
      spreadUsage,
      `${label} must call useIsMutating({ mutationKey: [...${CONST_NAME}] }) — direct spread-of-constant is the only shape that guarantees observer↔producer key parity`,
    )
  }
})

// =========================================================================
// (d) Trip wire — the useMutation() call inside
//     useRegenerateBiopsychosocialPlan STILL passes mutationKey. Without
//     this, the observer keys match nothing (useMutation with NO mutationKey
//     doesn't join the pool useIsMutating scans).
// =========================================================================

test('(d) useRegenerateBiopsychosocialPlan()\'s useMutation call passes mutationKey: [...REGENERATE_BIO_PLAN_MUTATION_KEY]', () => {
  // Assert the exact option shape at land time:
  //   return useMutation({
  //     mutationKey: [...REGENERATE_BIO_PLAN_MUTATION_KEY],
  //     …
  //   })
  // Dropping `mutationKey` (accidental delete during a refactor) OR
  // switching to a stringly key would leave the constant intact and every
  // observer import compiling green — but `useIsMutating` would return 0
  // for the whole regen window. This is the failure this whole chunk exists
  // to prevent.
  //
  // We scope the search to the `useRegenerateBiopsychosocialPlan` block so
  // the OTHER useMutation() call in this file (the goal-edit mutation
  // added in chunk 41) can't accidentally satisfy the assertion.
  const fnBlock = extractFunctionBlock(HOOK_SRC, 'useRegenerateBiopsychosocialPlan')
  assert.ok(
    fnBlock,
    'expected to find `export function useRegenerateBiopsychosocialPlan()` in hooks/use-biopsychosocial-plan.ts',
  )
  assert.match(
    fnBlock,
    /useMutation\s*\(\s*\{[\s\S]*?mutationKey\s*:\s*\[\s*\.\.\.\s*REGENERATE_BIO_PLAN_MUTATION_KEY\s*\][\s\S]*?\}\s*\)/,
    'useRegenerateBiopsychosocialPlan must stamp `mutationKey: [...REGENERATE_BIO_PLAN_MUTATION_KEY]` onto useMutation — without it useIsMutating returns 0 for the entire regen window and the CTA loop + banner both silently vanish',
  )
})

// =========================================================================
// Helpers
// =========================================================================

// Match `import { … <name> … } from '<path>'` (multi-line-tolerant) in src.
// Also allow the ES `import type` variant — safe here because the constant
// is a runtime value; if it ever became `import type`, the value would be
// erased and useIsMutating would blow up. So we require a VALUE import,
// not a type-only one.
function assertImportsIdentifierFromPath(src, name, importPath, label) {
  // Grab every `import { … } from '<importPath>'` statement (multi-line).
  const importRe = new RegExp(
    `import\\s*(?!type\\b)\\{([^}]*)\\}\\s*from\\s*['"]${escapeRegExp(importPath)}['"]`,
    'g',
  )
  let match
  let sawIdent = false
  while ((match = importRe.exec(src)) !== null) {
    const specifiers = match[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
    if (specifiers.includes(name)) {
      sawIdent = true
      break
    }
  }
  assert.ok(
    sawIdent,
    `${label} must import { ${name} } (as a VALUE, not type-only) from '${importPath}' — chunks 67 + 77 both bind to this exact import`,
  )
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Extract the source of `export function <name>() { … }` — brace-balanced.
// Returns undefined if not found. Used by wire (d) to scope the useMutation
// assertion to the correct function body.
function extractFunctionBlock(src, name) {
  const declRe = new RegExp(`export\\s+function\\s+${escapeRegExp(name)}\\s*\\(`)
  const declMatch = declRe.exec(src)
  if (!declMatch) return undefined
  const openIdx = src.indexOf('{', declMatch.index)
  if (openIdx === -1) return undefined
  let depth = 0
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return src.slice(openIdx, i + 1)
    }
  }
  return undefined
}
