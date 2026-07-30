// tests/unit/scrum-651-cancel-retry-contract.test.mjs — SCRUM-651 (2026-07-30)
//
// Source-drift trip wires for the FE cancel + retry + banner-swap wiring on
// the BPS regenerate path. Mirrors the discipline of chunk 94's
// regen-mutation-key.test.mjs (readFile → regex-assert raw source) — the
// repo runs `node --test tests/unit/*` with no TS transpiler, so we can't
// import the .ts modules directly without dragging in @tanstack/react-query
// + a React harness. Instead we lock the load-bearing shapes on the
// SOURCE TEXT so a future refactor that "silently works" but wires the
// wrong constants together trips here before it ships.
//
// FAILURE MODES THIS DEFENDS
// --------------------------
// (a) Envelope fields (`estimatedSeconds`, `stuckJobThresholdSeconds`,
//     `clientBannerSwapSeconds`) get dropped from the type — component
//     `planQuery.data?.clientBannerSwapSeconds` reads compile but
//     always evaluate `undefined`, forcing the DEFAULT branch forever
//     and silently ignoring the BE's tuned threshold.
// (b) `cancelBiopsychosocialRegeneration` renames or drops the `jobId`
//     param — DELETE URL either 404s (path `/jobs/undefined`) or hits
//     the wrong endpoint.
// (c) `useCancelBiopsychosocialRegeneration` mutation key drifts from
//     `CANCEL_BIO_PLAN_MUTATION_KEY` — the screen's
//     `useIsMutating({ mutationKey: [...CANCEL_BIO_PLAN_MUTATION_KEY] })`
//     observer returns 0 for the whole cancel window and the CTA
//     re-enables mid-DELETE.
// (d) `useBioRegenerationStatus` loses the live tick (setInterval
//     removed / dependency array drops `jobStartedAtIso`) — the >5min
//     banner swap never fires because `nowMs` freezes at initial render.
// (e) The banner render loses its `isPast5MinBannerSwap` branch — the
//     >5min copy swap silently disappears.
// (f) `use-notifications.ts` drops the FAILED / CANCELLED mirror branch —
//     terminal server states never invalidate the plan cache and the
//     Cancel button pins in "in flight" state until staleTime elapses.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

const SERVICE_PATH = join(REPO_ROOT, 'services', 'api', 'biopsychosocial-plan.ts')
const HOOK_PATH = join(REPO_ROOT, 'hooks', 'use-biopsychosocial-plan.ts')
const SCREEN_PATH = join(REPO_ROOT, 'components', 'health-plan', 'BiopsychosocialPlanScreen.tsx')
const NOTIFS_PATH = join(REPO_ROOT, 'hooks', 'use-notifications.ts')
// SCRUM-651: the pure helpers (constants + formatter + threshold resolver)
// live in `lib/bio-regeneration.ts` so a node:test unit file can import
// them without dragging React into the require graph. This trip-wire
// suite reads BOTH modules so a refactor that moves the constants BACK
// into the hook file (or elsewhere) trips here first.
const LIB_PATH = join(REPO_ROOT, 'lib', 'bio-regeneration.ts')

const SERVICE_SRC = readFileSync(SERVICE_PATH, 'utf8')
const HOOK_SRC = readFileSync(HOOK_PATH, 'utf8')
const SCREEN_SRC = readFileSync(SCREEN_PATH, 'utf8')
const NOTIFS_SRC = readFileSync(NOTIFS_PATH, 'utf8')
const LIB_SRC = readFileSync(LIB_PATH, 'utf8')

// =========================================================================
// (a) Envelope fields must exist on BiopsychosocialPlanResponse AND flow
//     through the fetch mapper. If either wire drops, the FE silently
//     falls back to the client defaults forever.
// =========================================================================

test('(a) BiopsychosocialPlanResponse declares the SCRUM-651 envelope fields as optional', () => {
  for (const field of ['estimatedSeconds', 'stuckJobThresholdSeconds', 'clientBannerSwapSeconds']) {
    // Optional (`?:`) is REQUIRED — the fields are additive during rollout
    // and the FE must accept BE responses that omit them. A required
    // declaration would silently break during the BE deploy window.
    assert.match(
      SERVICE_SRC,
      new RegExp(`\\b${field}\\?\\s*:\\s*number`),
      `BiopsychosocialPlanResponse must declare \`${field}?: number\` (optional) for backward-compat during the SCRUM-651 rollout`,
    )
  }
})

test('(a) fetchBiopsychosocialPlan mapper forwards all three envelope fields onto the returned object', () => {
  // The mapper block builds the { plan, staleness, ... } literal returned to
  // callers. Each envelope field must appear as a `field: res.data.data.field`
  // assignment — a missing forward silently strips the value from every caller.
  for (const field of ['estimatedSeconds', 'stuckJobThresholdSeconds', 'clientBannerSwapSeconds']) {
    assert.match(
      SERVICE_SRC,
      new RegExp(`${field}\\s*:\\s*res\\.data\\.data\\.${field}\\b`),
      `fetchBiopsychosocialPlan mapper must forward \`${field}\` from the HTTP response — otherwise the field is silently dropped`,
    )
  }
})

// =========================================================================
// (b) cancelBiopsychosocialRegeneration(jobId) — DELETE endpoint contract
// =========================================================================

test('(b) cancelBiopsychosocialRegeneration exports and takes a jobId: string', () => {
  assert.match(
    SERVICE_SRC,
    /export\s+async\s+function\s+cancelBiopsychosocialRegeneration\s*\(\s*jobId\s*:\s*string\s*\)/,
    'services/api/biopsychosocial-plan.ts must export `cancelBiopsychosocialRegeneration(jobId: string)` — the hook + tests both import by this exact signature',
  )
})

test('(b) cancelBiopsychosocialRegeneration hits DELETE /v1/health-plan/biopsychosocial/regenerate/jobs/{jobId}', () => {
  // encodeURIComponent guards against a caller passing a jobId with a slash.
  // If the URL template drifts the DELETE 404s and the CANCEL push never fires.
  assert.match(
    SERVICE_SRC,
    /apiClient\.delete\s*\(\s*`\/v1\/health-plan\/biopsychosocial\/regenerate\/jobs\/\$\{safeId\}`/,
    'cancelBiopsychosocialRegeneration must DELETE /v1/health-plan/biopsychosocial/regenerate/jobs/{jobId} with encodeURIComponent-safe interpolation',
  )
  assert.match(
    SERVICE_SRC,
    /const\s+safeId\s*=\s*encodeURIComponent\s*\(\s*jobId\s*\)/,
    'cancelBiopsychosocialRegeneration must encodeURIComponent the jobId before interpolation',
  )
})

// =========================================================================
// (c) Cancel mutation key parity — same chunk-94 discipline
// =========================================================================

test('(c) CANCEL_BIO_PLAN_MUTATION_KEY is an exported const array-literal `as const`', () => {
  assert.match(
    HOOK_SRC,
    /export\s+const\s+CANCEL_BIO_PLAN_MUTATION_KEY\s*=\s*\[\s*'cancel-biopsychosocial-plan'\s*\]\s*as\s+const/,
    "CANCEL_BIO_PLAN_MUTATION_KEY must remain the exact 1-tuple ['cancel-biopsychosocial-plan'] as const — the screen's useIsMutating observer matches by structural equality",
  )
})

test('(c) useCancelBiopsychosocialRegeneration stamps mutationKey: [...CANCEL_BIO_PLAN_MUTATION_KEY]', () => {
  const fnBlock = extractFunctionBlock(HOOK_SRC, 'useCancelBiopsychosocialRegeneration')
  assert.ok(fnBlock, 'expected to find `export function useCancelBiopsychosocialRegeneration()`')
  assert.match(
    fnBlock,
    /mutationKey\s*:\s*\[\s*\.\.\.\s*CANCEL_BIO_PLAN_MUTATION_KEY\s*\]/,
    'useCancelBiopsychosocialRegeneration must pass `mutationKey: [...CANCEL_BIO_PLAN_MUTATION_KEY]` — without it useIsMutating returns 0 and the CTA re-enables mid-DELETE',
  )
})

test('(c) BiopsychosocialPlanScreen imports CANCEL_BIO_PLAN_MUTATION_KEY from the hook module', () => {
  assertImportsIdentifierFromPath(
    SCREEN_SRC,
    'CANCEL_BIO_PLAN_MUTATION_KEY',
    '@/hooks/use-biopsychosocial-plan',
    'BiopsychosocialPlanScreen.tsx',
  )
})

test('(c) BiopsychosocialPlanScreen calls useIsMutating({ mutationKey: [...CANCEL_BIO_PLAN_MUTATION_KEY] })', () => {
  const spreadUsage = new RegExp(
    'useIsMutating\\s*\\(\\s*\\{[^}]*mutationKey\\s*:\\s*\\[\\s*\\.\\.\\.\\s*CANCEL_BIO_PLAN_MUTATION_KEY\\s*\\][^}]*\\}\\s*\\)',
  )
  assert.match(
    SCREEN_SRC,
    spreadUsage,
    'BiopsychosocialPlanScreen must observe cancel-mutation pending state via useIsMutating({ mutationKey: [...CANCEL_BIO_PLAN_MUTATION_KEY] })',
  )
})

// =========================================================================
// (d) useBioRegenerationStatus — live-ticker mechanics
// =========================================================================

test('(d) useBioRegenerationStatus is exported and accepts (jobStartedAtIso, overrides)', () => {
  assert.match(
    HOOK_SRC,
    /export\s+function\s+useBioRegenerationStatus\s*\(\s*jobStartedAtIso\s*:\s*string\s*\|\s*undefined/,
    'useBioRegenerationStatus must accept `jobStartedAtIso: string | undefined` as its first arg — the screen passes `planQuery.data?.jobStartedAt` which is optional',
  )
})

test('(d) useBioRegenerationStatus registers a setInterval with a 1s cadence keyed on jobStartedAtIso', () => {
  const fnBlock = extractFunctionBlock(HOOK_SRC, 'useBioRegenerationStatus')
  assert.ok(fnBlock, 'expected to find `export function useBioRegenerationStatus`')
  // The interval is THE mechanism that makes the >5min banner swap
  // reachable. If someone removes it (or bumps the cadence to something
  // like 60_000 in a "perf optimization" without updating the spec) the
  // ticker degrades and the swap silently misses the 5min mark by up to
  // 59 seconds.
  assert.match(
    fnBlock,
    /setInterval\s*\(\s*\(\s*\)\s*=>\s*setNowMs\s*\(\s*Date\.now\s*\(\s*\)\s*\)\s*,\s*1000\s*\)/,
    'useBioRegenerationStatus must tick via setInterval(..., 1000) — otherwise the >5min banner swap and stuck-threshold gates never fire',
  )
  // Effect dependency array MUST include jobStartedAtIso so cancel /
  // restart cycles clear + re-register the interval. Dropping the dep
  // freezes the ticker on the FIRST jobStartedAt the hook ever sees.
  assert.match(
    fnBlock,
    /\},\s*\[\s*jobStartedAtIso\s*\]\s*\)/,
    "useBioRegenerationStatus's tick effect must depend on [jobStartedAtIso] — dropping the dep freezes the ticker across job restarts",
  )
})

test('(d) useBioRegenerationStatus returns isPast5MinBanner and isPastStuckThreshold booleans', () => {
  const fnBlock = extractFunctionBlock(HOOK_SRC, 'useBioRegenerationStatus')
  for (const key of ['isPast5MinBanner', 'isPastStuckThreshold']) {
    assert.match(
      fnBlock,
      new RegExp(`${key}\\s*:`),
      `useBioRegenerationStatus return object must include \`${key}\` — the screen reads this key by name`,
    )
  }
})

test('(d) Default thresholds match SCRUM-651 spec (300s / 2700s) and live in lib/', () => {
  // Constants moved to `lib/bio-regeneration.ts` so the runtime unit test
  // (hooks/__tests__/use-biopsychosocial-plan.test.ts) can import them
  // without a React harness. Assert the values here and re-check the
  // re-export from the hook module below.
  assert.match(
    LIB_SRC,
    /export\s+const\s+DEFAULT_CLIENT_BANNER_SWAP_SECONDS\s*=\s*300\s+as\s+const/,
    'DEFAULT_CLIENT_BANNER_SWAP_SECONDS must remain 300s (5min) per SCRUM-651 spec',
  )
  assert.match(
    LIB_SRC,
    /export\s+const\s+DEFAULT_STUCK_JOB_THRESHOLD_SECONDS\s*=\s*2700\s+as\s+const/,
    'DEFAULT_STUCK_JOB_THRESHOLD_SECONDS must remain 2700s (45min) per SCRUM-651 spec',
  )
  // Hook still re-exports so external callers importing from
  // `@/hooks/use-biopsychosocial-plan` don't break.
  assert.match(
    HOOK_SRC,
    /export\s*\{[^}]*DEFAULT_CLIENT_BANNER_SWAP_SECONDS[^}]*\}\s*from\s*['"]@\/lib\/bio-regeneration['"]/,
    'hooks/use-biopsychosocial-plan.ts must re-export DEFAULT_CLIENT_BANNER_SWAP_SECONDS from @/lib/bio-regeneration',
  )
  assert.match(
    HOOK_SRC,
    /export\s*\{[^}]*DEFAULT_STUCK_JOB_THRESHOLD_SECONDS[^}]*\}\s*from\s*['"]@\/lib\/bio-regeneration['"]/,
    'hooks/use-biopsychosocial-plan.ts must re-export DEFAULT_STUCK_JOB_THRESHOLD_SECONDS from @/lib/bio-regeneration',
  )
})

// =========================================================================
// (e) Banner + Cancel button render — SCRUM-651 UI wiring
// =========================================================================

test('(e) The static formatRelativeStartedAt snapshot function was removed', () => {
  // A future refactor that re-adds a `function formatRelativeStartedAt(iso)`
  // to this file is a strong signal that someone reinstated the snapshot
  // pattern (bypassing the live ticker). The block comment explicitly
  // rejects this — trip the wire.
  assert.doesNotMatch(
    SCREEN_SRC,
    /function\s+formatRelativeStartedAt\s*\(/,
    'formatRelativeStartedAt was removed in SCRUM-651 — do not reintroduce; use the live-ticker formatRegenerationElapsed(elapsedSec) instead',
  )
})

test('(e) BiopsychosocialPlanScreen derives isPast5MinBannerSwap from the live regenStatus selector', () => {
  assert.match(
    SCREEN_SRC,
    /const\s+isPast5MinBannerSwap\s*=\s*isGeneratingFromAnySource\s*&&\s*regenStatus\.isPast5MinBanner/,
    'BiopsychosocialPlanScreen must derive isPast5MinBannerSwap from regenStatus.isPast5MinBanner AND the in-flight guard — otherwise a stale jobStartedAt could flip the banner without a running job',
  )
})

test('(e) BiopsychosocialPlanScreen renders BOTH banner variants (active pre-5min, passive post-5min)', () => {
  // Passive banner copy must appear verbatim so the a11y label + visible
  // text stay in lockstep with what SCRUM-651 acceptance criteria specify.
  assert.match(
    SCREEN_SRC,
    /Still working on your plan/,
    'BiopsychosocialPlanScreen must render the passive "Still working on your plan" copy when isPast5MinBannerSwap is true',
  )
  // Active banner copy remnant — "A generation is already in progress" —
  // must survive so the pre-5min path still lands the same message the
  // COS-421 shipped user is used to.
  assert.match(
    SCREEN_SRC,
    /A generation is already in progress/,
    'BiopsychosocialPlanScreen must retain the active "A generation is already in progress" copy for the pre-5min branch',
  )
})

test('(e) BiopsychosocialPlanScreen renders a Cancel Pressable gated on showCancelButton', () => {
  assert.match(
    SCREEN_SRC,
    /const\s+showCancelButton\s*=\s*isGeneratingFromAnySource\s*&&\s*!cancelMutation\.isPending/,
    'showCancelButton must be derived from isGeneratingFromAnySource AND !cancelMutation.isPending — otherwise the button flickers out mid-tap',
  )
  assert.match(
    SCREEN_SRC,
    /\{showCancelButton\s*&&/,
    'BiopsychosocialPlanScreen must gate the Cancel button JSX on showCancelButton',
  )
  assert.match(
    SCREEN_SRC,
    /accessibilityLabel="Cancel plan generation"/,
    'The Cancel Pressable must expose accessibilityLabel="Cancel plan generation" — verbatim so screen-reader QA can match on the label',
  )
})

test('(e) The CTA row contains NO ActivityIndicator (chunk 40 turbomodule hardening)', () => {
  // Not a full-file scan — the file may reference ActivityIndicator in
  // OTHER trees. Instead assert that neither the primary CTA text nor
  // the Cancel Pressable body reintroduces an import of ActivityIndicator.
  assert.doesNotMatch(
    SCREEN_SRC,
    /from\s+['"]react-native['"][^;]*\bActivityIndicator\b/,
    'BiopsychosocialPlanScreen must NOT import ActivityIndicator — chunk 40 hardening bans continuously-animating native primitives on this surface',
  )
})

test('(e) onRegenerate has the REGENERATION_IN_FLIGHT idempotency guard', () => {
  // Extract the onRegenerate useCallback body (bounded scan — this file
  // has multiple useCallbacks, so we scope by the arrow-fn body between
  // `const onRegenerate = React.useCallback(() => {` and the closing
  // `}, [regenerateMutation, regenerateDisabled])`.
  const cbMatch = SCREEN_SRC.match(
    /const\s+onRegenerate\s*=\s*React\.useCallback\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[regenerateMutation,\s*regenerateDisabled\]\s*\)/,
  )
  assert.ok(cbMatch, 'expected to find the onRegenerate useCallback with [regenerateMutation, regenerateDisabled] deps')
  assert.match(
    cbMatch[1],
    /if\s*\(\s*regenerateDisabled\s*\)\s*return/,
    'onRegenerate must early-return when regenerateDisabled — the idempotency guard against REGENERATION_IN_FLIGHT double-taps',
  )
})

// =========================================================================
// (f) use-notifications.ts mirror branches for FAILED / CANCELLED
// =========================================================================

test('(f) use-notifications.ts invalidates on BIOPSYCHOSOCIAL_PLAN_REGENERATE_FAILED', () => {
  assert.match(
    NOTIFS_SRC,
    /'BIOPSYCHOSOCIAL_PLAN_REGENERATE_FAILED'/,
    'use-notifications.ts must reference the FAILED push type so the FE invalidates the plan cache when a job errors out server-side',
  )
})

test('(f) use-notifications.ts invalidates on BIOPSYCHOSOCIAL_PLAN_REGENERATE_CANCELLED', () => {
  assert.match(
    NOTIFS_SRC,
    /'BIOPSYCHOSOCIAL_PLAN_REGENERATE_CANCELLED'/,
    'use-notifications.ts must reference the CANCELLED push type so a Cancel tap closes the loop even without a foreground refetch',
  )
})

test('(f) Both mirror branches invalidate the SAME key legacy READY branch uses', () => {
  // The three types share one invalidateQueries call in each of the two
  // listeners (foreground + tap). Count `'biopsychosocial-plan'` keyed
  // invalidations — must be at least 2 (one per listener) to prove the
  // types didn't get split across separate helpers that skipped the invalidate.
  const invalidateCount = (
    NOTIFS_SRC.match(/invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*'biopsychosocial-plan'\s*\]\s*\}\s*\)/g) ?? []
  ).length
  assert.ok(
    invalidateCount >= 2,
    `expected >=2 invalidateQueries(['biopsychosocial-plan']) calls in use-notifications.ts (one per listener); found ${invalidateCount}`,
  )
})

// =========================================================================
// Helpers (identical shape to regen-mutation-key.test.mjs — chunk 94)
// =========================================================================

function assertImportsIdentifierFromPath(src, name, importPath, label) {
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
    `${label} must import { ${name} } (as a VALUE, not type-only) from '${importPath}'`,
  )
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractFunctionBlock(src, name) {
  const declRe = new RegExp(`export\\s+function\\s+${escapeRegExp(name)}\\s*\\(`)
  const declMatch = declRe.exec(src)
  if (!declMatch) return undefined
  // The declMatch ends right after the `(`. Walk the paren-nesting to find
  // the matching `)` — the argument list can contain `{`/`}` inside inline
  // type literals (`overrides?: { ... }`) which would otherwise fool the
  // naive `indexOf('{')` into anchoring on the wrong brace.
  let i = declMatch.index + declMatch[0].length
  let parenDepth = 1
  while (i < src.length && parenDepth > 0) {
    const ch = src[i]
    if (ch === '(') parenDepth += 1
    else if (ch === ')') parenDepth -= 1
    i += 1
  }
  // Now `i` sits just past the closing `)` of the arg list. Skip the
  // (optional) return-type annotation and find the body-opening `{`.
  const openIdx = src.indexOf('{', i)
  if (openIdx === -1) return undefined
  let depth = 0
  for (let j = openIdx; j < src.length; j += 1) {
    const ch = src[j]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return src.slice(openIdx, j + 1)
    }
  }
  return undefined
}
