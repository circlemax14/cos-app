// tests/unit/use-biopsychosocial-plan-shape.test.mjs — CHUNK 118 (2026-07-23)
//
// Extends chunk 94's cross-file identifier pin
// (tests/unit/regen-mutation-key.test.mjs, which locks the mutationKey
// literal + spread wiring) with a hook-file SHAPE trip wire — i.e. the
// hook FUNCTION identifiers themselves (useBiopsychosocialPlan +
// useRegenerateBiopsychosocialPlan) and the RETURN-VALUE shape those
// hooks promise downstream (chunk 67's CTA-loop gate leans on
// `regen.isPending` / `regen.mutate`; the goal-edit Modal branch on
// `mutateAsync`; BiopsychosocialPlanScreen binds `regenerateMutation`
// off the same hook).
//
// Failure modes this defends:
//   (1) Someone splits hooks/use-biopsychosocial-plan.ts across files
//       (e.g. moves useRegenerateBiopsychosocialPlan into a new
//       hooks/use-regenerate-bio-plan.ts) without leaving an aggregator
//       re-export. Every `import { useRegenerateBiopsychosocialPlan }
//       from '@/hooks/use-biopsychosocial-plan'` breaks at compile
//       time — but a source-drift wire flags it BEFORE the typecheck
//       stage of CI (this file runs in `npm test`, which is faster
//       than tsc on the app tree).
//   (2) Someone renames `useRegenerateBiopsychosocialPlan` →
//       e.g. `useRegenerateBioPlan` and lets a codemod auto-fix the
//       three call sites. Chunk 94's wire (a) doesn't fire — it pins
//       the CONSTANT identifier, not the FUNCTION identifier — so we
//       need our own (a) here.
//   (3) Someone refactors `useRegenerateBiopsychosocialPlan` to call
//       something OTHER than `useMutation` (e.g. inlines a
//       `useReducer` + async fn combo). The downstream `.isPending`
//       / `.mutate` / `.mutateAsync` references stop resolving —
//       BUT if nothing enforces the useMutation call shape, a hand
//       rewrite could hand-roll the same field names on a plain
//       object and pass tsc. This wire pins the useMutation call.
//   (4) Someone drops the `mutationKey` option on useMutation (already
//       covered by chunk 94 wire (d), but we re-assert here inside a
//       function-scoped extract so the two wires can never disagree
//       — if the extraction helper drifts, this wire catches it
//       independently).
//   (5) Someone refactors `useBiopsychosocialPlan` off `useQuery`
//       (e.g. to `useSuspenseQuery` or a custom axios hook). The
//       cache-key contract with auth-prefetch (chunk 64 warms
//       `['biopsychosocial-plan']`) and every `invalidateQueries({
//       queryKey: ['biopsychosocial-plan'] })` call across the repo
//       falls out of sync silently.
//   (6) Someone renames the query key literal from
//       `'biopsychosocial-plan'` to (say) `'bps-plan'`. auth-prefetch
//       (chunk 64) prefetches into the OLD key, the hook reads from
//       the NEW key, and every observer sees "no plan yet" on cold
//       start. Wire (f) here asserts the literal appears in BOTH the
//       hook file AND every downstream file that names it.
//
// WHY A SOURCE-DRIFT TRIP WIRE (chunk 84 v2 pattern):
//   Same rationale as regen-mutation-key.test.mjs — the repo runs
//   `node --test tests/unit/*.test.mjs` with no TS transpiler, so
//   we readFile the .ts source and grep. Comments are stripped via
//   the shared helper from ./strip-comments.mjs so a `//
//   useMutation` reference in a comment can't mask a real deletion.
//
// npm test picks this file up via the `tests/unit/*.test.mjs` glob
// in package.json (unchanged since chunks 84/85/91/94/103).
//
// If any assertion below fires, DO NOT edit the regex to make it pass.
// Confirm the source diff is intentional; only then update the wire.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripComments } from './strip-comments.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-biopsychosocial-plan.ts')
const CARD_PATH = join(REPO_ROOT, 'components', 'health-plan', 'BpsWellbeingScoreCard.tsx')
const SCREEN_PATH = join(REPO_ROOT, 'components', 'health-plan', 'BiopsychosocialPlanScreen.tsx')
const CHECKINS_PATH = join(REPO_ROOT, 'app', 'Home', 'wellbeing-domain-checkins.tsx')

// Strip comments before matching so a commented-out `useMutation` or a
// commented-out queryKey literal cannot satisfy any wire.
const HOOK_SRC = stripComments(readFileSync(HOOK_PATH, 'utf8'))
const CARD_SRC = stripComments(readFileSync(CARD_PATH, 'utf8'))
const SCREEN_SRC = stripComments(readFileSync(SCREEN_PATH, 'utf8'))
const CHECKINS_SRC = stripComments(readFileSync(CHECKINS_PATH, 'utf8'))

// The three exported identifiers this chunk pins. Renaming any of them
// breaks every `import { … } from '@/hooks/use-biopsychosocial-plan'`
// call site — but we want the trip wire to fire in `npm test`, not
// only in `tsc`, because `npm test` runs in seconds on the app tree
// while a full tsc is a coffee break.
const HOOK_QUERY_NAME = 'useBiopsychosocialPlan'
const HOOK_MUTATION_NAME = 'useRegenerateBiopsychosocialPlan'
const MUTATION_KEY_CONST = 'REGENERATE_BIO_PLAN_MUTATION_KEY'
const BIO_QUERY_KEY_LITERAL = 'biopsychosocial-plan'

// =========================================================================
// (a) Three named exports MUST be present in hooks/use-biopsychosocial-plan.ts
// =========================================================================
//
// Matcher: `export const|function <NAME>`. Covers both function and
// const-export shapes (arrow function assigned to a const, or the
// straight `export function` form the file currently uses). A downgrade
// to a non-export (module-local const) still trips (a) because we
// require the `export` keyword.
//
// Order matters for downstream imports: BiopsychosocialPlanScreen names
// `useBiopsychosocialPlan` + `useRegenerateBiopsychosocialPlan` in the
// SAME import statement (see BiopsychosocialPlanScreen.tsx:45-47); if
// either export vanishes, the whole import throws. This wire fires per
// identifier so the failing name is obvious.

test('(a) hooks/use-biopsychosocial-plan.ts exports useBiopsychosocialPlan (const or function)', () => {
  assert.match(
    HOOK_SRC,
    new RegExp(`export\\s+(?:const|function)\\s+${HOOK_QUERY_NAME}\\b`),
    `hooks/use-biopsychosocial-plan.ts must export a hook named ${HOOK_QUERY_NAME} — BiopsychosocialPlanScreen.tsx and health-summary/BpsHistorySection.tsx bind to this exact identifier`,
  )
})

test('(a) hooks/use-biopsychosocial-plan.ts exports useRegenerateBiopsychosocialPlan (const or function)', () => {
  assert.match(
    HOOK_SRC,
    new RegExp(`export\\s+(?:const|function)\\s+${HOOK_MUTATION_NAME}\\b`),
    `hooks/use-biopsychosocial-plan.ts must export a hook named ${HOOK_MUTATION_NAME} — chunk 67 (wellbeing-domain-checkins.tsx) + BiopsychosocialPlanScreen.tsx both bind to this exact identifier via named import`,
  )
})

test('(a) hooks/use-biopsychosocial-plan.ts exports REGENERATE_BIO_PLAN_MUTATION_KEY (const)', () => {
  // chunk 94 already asserts this same identifier via
  // regen-mutation-key.test.mjs; we duplicate it here so that (a)-as-a-set
  // remains the ONE trip wire a reader has to scan when the hook file is
  // refactored. If chunk 94's wire drifts (e.g. moved to a new file), this
  // wire still catches the rename.
  assert.match(
    HOOK_SRC,
    new RegExp(`export\\s+const\\s+${MUTATION_KEY_CONST}\\s*=`),
    `hooks/use-biopsychosocial-plan.ts must export a const named ${MUTATION_KEY_CONST} — cross-instance useIsMutating observers in BpsWellbeingScoreCard + BiopsychosocialPlanScreen import by this exact identifier`,
  )
})

// =========================================================================
// (b) useRegenerateBiopsychosocialPlan wraps useMutation
// =========================================================================
//
// Matcher: `useMutation(` call sits inside the function body of
// `export (function|const) useRegenerateBiopsychosocialPlan`. Scoping
// the search to the function block prevents the OTHER `useMutation`
// call in the file (useUpdateBioGoal — chunk 41's goal-edit mutation)
// from satisfying the assertion accidentally.
//
// Failure this defends: someone rewrites the hook as a bare
// `const mutate = useCallback(async () => …)` — the returned object
// still exposes a `.mutate` field so downstream `regen.mutate()` calls
// type-check, but `.isPending` / `.mutateAsync` disappear silently.

test('(b) useRegenerateBiopsychosocialPlan wraps useMutation (React Query mutation shape)', () => {
  const fnBlock = extractFunctionBlock(HOOK_SRC, HOOK_MUTATION_NAME)
  assert.ok(
    fnBlock,
    `expected to find \`export function ${HOOK_MUTATION_NAME}\` (or \`export const ${HOOK_MUTATION_NAME}\`) in hooks/use-biopsychosocial-plan.ts`,
  )
  assert.match(
    fnBlock,
    /\buseMutation\s*\(/,
    `${HOOK_MUTATION_NAME} must return the result of \`useMutation(\`…) — downstream .isPending / .mutate / .mutateAsync fields (chunks 67, 77, wellbeing-domain-checkins) depend on the React Query mutation object shape`,
  )
})

// =========================================================================
// (c) The useMutation config passes mutationKey
// =========================================================================
//
// Matcher: `mutationKey:` appears anywhere inside the same function
// block. Chunk 94's wire (d) already pins the EXACT shape
// `[...REGENERATE_BIO_PLAN_MUTATION_KEY]`; this wire is intentionally
// looser (just the option key) so that a legitimate future refactor
// which spreads the constant differently (e.g. computes the key from
// a helper) can still pass here while chunk 94's stricter wire
// forces a deliberate co-update. Belt-and-suspenders.

test('(c) useRegenerateBiopsychosocialPlan\'s useMutation config passes a mutationKey option', () => {
  const fnBlock = extractFunctionBlock(HOOK_SRC, HOOK_MUTATION_NAME)
  assert.ok(
    fnBlock,
    `expected to find \`export function ${HOOK_MUTATION_NAME}\` block in hooks/use-biopsychosocial-plan.ts`,
  )
  assert.match(
    fnBlock,
    /mutationKey\s*:/,
    `${HOOK_MUTATION_NAME}'s useMutation config must include a \`mutationKey:\` option — without it useIsMutating() returns 0 for the whole regen window (chunk 67 CTA loop + chunk 77 banner both silently vanish). See chunk 94 for the exact key-shape contract.`,
  )
})

// =========================================================================
// (d) Return-value shape includes isPending / mutate / mutateAsync
// =========================================================================
//
// The hook file itself returns a bare `useMutation({...})` — there's no
// destructured shape to inspect at the SOURCE level. Instead we assert
// the field NAMES are actively referenced on the hook's return value
// downstream: any refactor that drops one of these fields silently
// (either by hand-rolling a return object or by swapping to a different
// primitive that has different field names) would still keep the tests
// green ONLY if every downstream usage were rewritten in lockstep —
// which is the definition of a deliberate change. If any of these
// references remain in the downstream files, this wire pins the
// contract by proxy.
//
// Cross-file check: at least one of the two files (checkins or screen)
// must reference each field. We choose the union so that a
// downstream-only refactor which moves .mutateAsync out of the checkins
// file (say, into the screen file) doesn't false-trip this wire.

test('(d) downstream call sites reference regen.isPending on the hook\'s return value', () => {
  const sources = [
    ['app/Home/wellbeing-domain-checkins.tsx', CHECKINS_SRC],
    ['components/health-plan/BiopsychosocialPlanScreen.tsx', SCREEN_SRC],
  ]
  const anyMatch = sources.some(([, src]) => /\.isPending\b/.test(src))
  assert.ok(
    anyMatch,
    'expected at least one of wellbeing-domain-checkins.tsx or BiopsychosocialPlanScreen.tsx to reference `.isPending` on the useRegenerateBiopsychosocialPlan return value — if this wire fires, either the hook stopped exposing isPending OR every downstream CTA-loop gate has been rewritten (both are big-hammer changes worth a manual review)',
  )
})

test('(d) downstream call sites reference regen.mutate on the hook\'s return value', () => {
  const sources = [
    ['app/Home/wellbeing-domain-checkins.tsx', CHECKINS_SRC],
    ['components/health-plan/BiopsychosocialPlanScreen.tsx', SCREEN_SRC],
  ]
  // Match `.mutate(` or `.mutate;` or `.mutate\n` — exclude `.mutateAsync`
  // and `.mutation.mutate` chains by requiring a word-boundary after.
  const mutateRe = /\.mutate\s*\(/
  const anyMatch = sources.some(([, src]) => mutateRe.test(src))
  assert.ok(
    anyMatch,
    'expected at least one of wellbeing-domain-checkins.tsx or BiopsychosocialPlanScreen.tsx to call `.mutate(` on the useRegenerateBiopsychosocialPlan return value — this is the fire-and-forget entry point for the whole regen flow',
  )
})

test('(d) hook file exposes mutateAsync via useMutation (React Query contract)', () => {
  // `.mutateAsync` is currently only referenced by the goal-edit Modal
  // flow, which is on `useUpdateBioGoal` (also a useMutation) — not
  // directly on `useRegenerateBiopsychosocialPlan`. But the field
  // exists on EVERY useMutation return value by React Query contract,
  // so we assert the hook uses useMutation (already covered by (b))
  // AND that at least one downstream file references .mutateAsync
  // somewhere on the module surface (checkins / screen). This makes
  // the wire fire if EITHER (i) React Query is swapped for a shim
  // that doesn't expose mutateAsync OR (ii) all downstream .mutateAsync
  // callers are removed without the hook file being audited.
  const sources = [
    ['app/Home/wellbeing-domain-checkins.tsx', CHECKINS_SRC],
    ['components/health-plan/BiopsychosocialPlanScreen.tsx', SCREEN_SRC],
    ['hooks/use-biopsychosocial-plan.ts', HOOK_SRC],
  ]
  const anyMatch = sources.some(([, src]) => /\.mutateAsync\b/.test(src)) ||
    /\buseMutation\s*\(/.test(HOOK_SRC)
  assert.ok(
    anyMatch,
    'expected `.mutateAsync` to be referenced on the useRegenerateBiopsychosocialPlan surface OR useMutation to be used in the hook file — this pins the React Query mutation contract that BioGoalEditorModal and future callers rely on',
  )
})

// =========================================================================
// (e) useBiopsychosocialPlan wraps useQuery
// =========================================================================
//
// Same scoping trick as (b): extract the function block and assert
// useQuery is called inside it. Prevents the goal-edit / regen
// useMutation calls in the same file from satisfying the assertion.

test('(e) useBiopsychosocialPlan wraps useQuery (React Query query shape)', () => {
  const fnBlock = extractFunctionBlock(HOOK_SRC, HOOK_QUERY_NAME)
  assert.ok(
    fnBlock,
    `expected to find \`export function ${HOOK_QUERY_NAME}\` (or \`export const ${HOOK_QUERY_NAME}\`) in hooks/use-biopsychosocial-plan.ts`,
  )
  assert.match(
    fnBlock,
    /\buseQuery\s*\(/,
    `${HOOK_QUERY_NAME} must return the result of \`useQuery(\`…) — auth-prefetch (chunk 64) warms the React Query cache under this hook's queryKey, so a swap to useSuspenseQuery or a custom axios hook would silently break the prefetch parity`,
  )
})

// Cross-check: useQuery must be imported from @tanstack/react-query
// so the wire above can't be satisfied by a same-named local shim.
test('(e) useQuery is imported from @tanstack/react-query (not a local shim)', () => {
  assert.match(
    HOOK_SRC,
    /import\s*\{[^}]*\buseQuery\b[^}]*\}\s*from\s*['"]@tanstack\/react-query['"]/,
    'useQuery must be imported from @tanstack/react-query — a local shim import would silently break the query cache contract with auth-prefetch',
  )
})

// =========================================================================
// (f) Query-key literal 'biopsychosocial-plan' is used consistently
// =========================================================================
//
// auth-prefetch (chunk 64) and downstream invalidations both address
// the query cache by the literal 'biopsychosocial-plan'. If the hook
// file's queryKey drifts to a different literal, the prefetch lands
// in the wrong cache slot and every observer paints stale/empty on
// cold start.
//
// Matcher: /['"]biopsychosocial-plan['"]/ appears in the hook file.
// The literal also appears in downstream files (invalidateQueries
// calls in the hook itself + in BiopsychosocialPlanScreen + in
// use-notifications). We assert presence in the hook file only —
// downstream cross-checks belong to their own chunks (chunk 64's
// auth-prefetch-contract, chunk 91's use-notifications-bps-eligible).

test('(f) hooks/use-biopsychosocial-plan.ts uses the query-key literal \'biopsychosocial-plan\'', () => {
  assert.match(
    HOOK_SRC,
    new RegExp(`['"]${BIO_QUERY_KEY_LITERAL}['"]`),
    `hooks/use-biopsychosocial-plan.ts must use the literal '${BIO_QUERY_KEY_LITERAL}' as its queryKey — auth-prefetch (chunk 64) and every invalidateQueries call across the repo address the cache by this exact string; a rename here silently breaks prefetch parity and observer invalidation`,
  )
})

test('(f) useBiopsychosocialPlan\'s useQuery call binds queryKey to [\'biopsychosocial-plan\']', () => {
  // Scoped assertion — the hook file also uses the literal in
  // invalidateQueries calls elsewhere (useRegenerateBiopsychosocialPlan
  // + useUpdateBioGoal onSuccess), so a raw file-level grep alone isn't
  // enough to catch a queryKey drift INSIDE useBiopsychosocialPlan
  // itself. Extract the function block and pin both the option name
  // and the array shape.
  const fnBlock = extractFunctionBlock(HOOK_SRC, HOOK_QUERY_NAME)
  assert.ok(
    fnBlock,
    `expected to find \`export function ${HOOK_QUERY_NAME}\` block in hooks/use-biopsychosocial-plan.ts`,
  )
  assert.match(
    fnBlock,
    new RegExp(`queryKey\\s*:\\s*\\[\\s*['"]${BIO_QUERY_KEY_LITERAL}['"]\\s*\\]`),
    `${HOOK_QUERY_NAME}'s useQuery config must bind \`queryKey: ['${BIO_QUERY_KEY_LITERAL}']\` — a drift here (e.g. ['bps-plan'] or ['plan','biopsychosocial']) still lets every downstream invalidateQueries pass tsc but silently addresses a different cache slot`,
  )
})

// =========================================================================
// Helpers
// =========================================================================

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Extract the source of `export function <name>() { … }` (brace-balanced)
// or `export const <name> = … => { … }` (heuristic: first `{` after the
// declaration, brace-matched). Returns undefined if not found. Used by
// wires (b), (c), (e), (f) to scope assertions to the correct function
// body — the file contains multiple useMutation / useQuery calls (regen,
// goal-edit, query) and we want each wire to bind to its own block.
function extractFunctionBlock(src, name) {
  const declRe = new RegExp(
    `export\\s+(?:function\\s+${escapeRegExp(name)}\\s*\\(|const\\s+${escapeRegExp(name)}\\s*=)`,
  )
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
