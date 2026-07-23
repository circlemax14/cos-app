// tests/unit/pick-target-for-domain-contract.test.mjs — CHUNK 125 (2026-07-23)
//
// Source-drift trip wires for the domain-target resolver inside
// components/health-plan/BpsWellbeingScoreCard.tsx. Chunk 66 shipped the
// following contract for the wellbeing-card empty-pill CTA:
//
//   pickTargetForDomain(domain) must ALWAYS resolve to an actionable
//   instrument id when the domain has any visible member. Priority order:
//
//     1. No record at all       → return it (truly incomplete — "Take now")
//     2. Record present + expired → return it (retake overdue)
//     3. Record present + fresh   → return the OLDEST-completed one
//                                     (retake so the score refreshes)
//
//   Only when the domain has ZERO visible members (every member is
//   coming-soon or unknown to the catalog) may the function return
//   undefined — the caller then falls back to the assessments catalog.
//
//   The FALLBACK BRANCH — the return statement OUTSIDE the members-loop
//   — is the chunk-66 fix. Pre-fix the function returned undefined here
//   and the CTA dumped Ken on `/Home/assessments-catalog`, which showed
//   him the same "all completed" screen he had already complained about
//   ("same catalog" regression).
//
//   If a refactor drops the fallback branch (turns the final return into
//   `return null` / `return undefined`, or deletes it entirely so the
//   function falls off the end and implicitly returns undefined), users
//   tapping the empty-pill CTA get routed to a screen with no next
//   action — exactly the regression chunk 66 fixed.
//
// The function ALSO has to actually be CALLED from the CTA onPress
// handler. A silent refactor that inlines a different resolver into
// `onPressCta` and orphans `pickTargetForDomain` would drop the
// contract without any test-run signal — this suite defends against
// that too.
//
// WHY SOURCE-DRIFT TRIP WIRES (chunk 84 v2 / 98 v2 / 103 / 107 / 109 /
// 113 / 116 pattern, no behavioral mirror):
//   pickTargetForDomain is a React.useCallback closed over React Query
//   state (visibleInstruments, completedById). Standing up a behavioral
//   mirror would require jsdom + React Native mocks + @tanstack/react-query
//   stubs + expo-router shims — dozens of MB of devDeps to observe a
//   pure branching contract on the return statement. Instead we read the
//   .tsx source as text, strip comments via the shared helper (chunk 103),
//   and grep for the structural shape of the function + its call site.
//   Same discipline as:
//     - tests/unit/domain-label-shape-contract.test.mjs   (chunk 116)
//     - tests/unit/plan-screen-headers-contract.test.mjs  (chunk 113)
//     - tests/unit/section-card-focus-fold-contract.test.mjs (chunk 109)
//     - tests/unit/trends-band-pill-a11y-contract.test.mjs (chunk 107)
//     - tests/unit/wellbeing-card-a11y-labels.test.mjs    (chunk 103)
//     - tests/unit/notification-tap-handoff.test.mjs      (chunk 98 v2)
//
//   If a trip wire below fails, DO NOT tweak the regex to make it pass.
//   Read the diff on BpsWellbeingScoreCard.tsx, confirm the resolver
//   reshape is deliberate (Ken really wanted a new fallback semantic,
//   the CTA really moved to a different handler, the function really
//   was renamed to `resolveDomainTarget`), and only then update the
//   trip wire in lockstep with the fix.
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
const CARD_TSX_PATH = join(
  REPO_ROOT,
  'components',
  'health-plan',
  'BpsWellbeingScoreCard.tsx',
)
const CARD_TSX_SRC_RAW = readFileSync(CARD_TSX_PATH, 'utf8')
const CARD_TSX_SRC = stripComments(CARD_TSX_SRC_RAW)

// The function name established by chunk 66. If Ken ever renames it
// (e.g. to `resolveDomainTarget`), update this constant in lockstep
// with the call-site (wire (d)) — the rest of the parsing generalizes.
const RESOLVER_NAME = 'pickTargetForDomain'

// -------------------------------------------------------------------------
// Shared parser: extract the body of a function definition of one of the
// following shapes (chunk-66 shipped shape #1; the others accepted as
// resilience against a benign refactor):
//
//   #1 (shipped)  const NAME = React.useCallback((args) => { BODY }, [deps])
//   #2            const NAME = (args) => { BODY }
//   #3            function NAME(args) { BODY }
//
// The common thread is that BODY sits inside a matched pair of braces
// following either `=> {` (arrow) or `NAME(...) {` (function decl).
// Returns { body, openIdx, closeIdx } into the comment-stripped source,
// or null if the function is not defined.
// -------------------------------------------------------------------------

function extractFunctionBody(src, identifier) {
  // Look for a definition-shaped occurrence: `const NAME =` OR
  // `function NAME(`. We do NOT match bare `NAME(` — that would collide
  // with call sites.
  const defPattern = new RegExp(
    `(?:const\\s+${identifier}\\s*=|function\\s+${identifier}\\s*\\()`,
  )
  const defMatch = defPattern.exec(src)
  if (!defMatch) return null

  // Find the first `{` that opens the function body. For arrow shapes
  // this is the `{` immediately after `=> `; for `function NAME(...) {`
  // it is the `{` after the argument list.
  const searchFrom = defMatch.index + defMatch[0].length
  const bodyOpenPattern = /=>\s*\{|\)\s*\{/g
  bodyOpenPattern.lastIndex = searchFrom
  const openMatch = bodyOpenPattern.exec(src)
  if (!openMatch) return null

  const openIdx = openMatch.index + openMatch[0].length // just past `{`
  let depth = 1
  let i = openIdx
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    if (depth === 0) break
    i += 1
  }
  if (depth !== 0) return null
  return { body: src.slice(openIdx, i), openIdx, closeIdx: i }
}

// -------------------------------------------------------------------------
// Shared parser: find the LAST `return` statement in a function body.
// Returns the substring from `return` up to (but not including) the
// terminating `;` or `\n`, trimmed. Ignores `return` occurrences that
// sit inside a nested block deeper than the function body itself is
// not necessary here — we just want the textually last `return` and
// its right-hand side. Regex-based; scans for whole-word `return`.
// -------------------------------------------------------------------------

function findLastReturn(body) {
  const returnPattern = /\breturn\b([^\n;]*)/g
  let last = null
  let m
  while ((m = returnPattern.exec(body)) !== null) {
    last = { index: m.index, rhs: m[1].trim() }
  }
  return last
}

// -------------------------------------------------------------------------
// Strip TRAILING inline `// ...` comments from each line of a source
// string. The shared stripComments helper (chunk 103) is line-oriented:
// it blanks lines whose FIRST non-whitespace chars are `//` and it blanks
// block-comment lines, but it DELIBERATELY leaves trailing `//` comments
// on code lines alone (so it does not bite into string literals like
// `'https://foo'`).
//
// Wire (d) needs to reject a `pickTargetForDomain(` occurrence that sits
// inside a TRAILING inline comment on a code line ("// was:
// pickTargetForDomain(domain)"). We can afford a heuristic here because
// the call-site identifier is `pickTargetForDomain` — no URL or string
// literal in the codebase contains that token, so the URL-inside-string
// concern that motivated the shared helper's cautiousness does not apply
// to this narrow rewrite.
//
// This helper walks each line, finds the first `//` NOT inside a single-
// or double-quoted string, and truncates the line at that point. Returns
// the joined result.
// -------------------------------------------------------------------------

function stripTrailingInlineComments(src) {
  const out = []
  for (const line of src.split('\n')) {
    let quote = null
    let cutIdx = -1
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (quote) {
        if (ch === '\\') { i += 1; continue }
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
      if (ch === '/' && line[i + 1] === '/') { cutIdx = i; break }
    }
    out.push(cutIdx >= 0 ? line.slice(0, cutIdx) : line)
  }
  return out.join('\n')
}

// -------------------------------------------------------------------------
// Shared parser: does the body contain a `return` statement structurally
// AFTER the last members-loop (`for (...)` closing brace)? This is the
// "last-resort branch" matcher for wire (c): pre-fix, the function
// only returned from inside the loop and fell off the end. Chunk 66
// added the OUTSIDE-the-loop return that always resolves to something.
// -------------------------------------------------------------------------

function hasFallbackReturnAfterLoop(body) {
  // Find the last `for (` in the body.
  const forPattern = /\bfor\s*\(/g
  let lastForIdx = -1
  let m
  while ((m = forPattern.exec(body)) !== null) {
    lastForIdx = m.index
  }
  if (lastForIdx < 0) return false

  // Walk from the `for (` to find the matching close-paren, then the
  // opening `{` of the loop body, then its matching `}`. Everything
  // after that `}` is the fallback region.
  let i = lastForIdx
  // Advance past `for` to the `(`
  while (i < body.length && body[i] !== '(') i += 1
  if (i >= body.length) return false
  // Match parens
  let pDepth = 0
  do {
    const ch = body[i]
    if (ch === '(') pDepth += 1
    else if (ch === ')') pDepth -= 1
    i += 1
  } while (i < body.length && pDepth > 0)
  if (pDepth !== 0) return false
  // Skip whitespace to the opening `{`
  while (i < body.length && body[i] !== '{') i += 1
  if (i >= body.length) return false
  // Match braces
  let bDepth = 0
  do {
    const ch = body[i]
    if (ch === '{') bDepth += 1
    else if (ch === '}') bDepth -= 1
    i += 1
  } while (i < body.length && bDepth > 0)
  if (bDepth !== 0) return false
  // Now `i` is just past the loop's closing `}`. Look for `return` in
  // the tail region.
  const tail = body.slice(i)
  return /\breturn\b/.test(tail)
}

// -------------------------------------------------------------------------
// Extract the resolver's body once for the live-source wires. Self-checks
// below re-run the same parser against synthetic sources.
// -------------------------------------------------------------------------

const RESOLVER = extractFunctionBody(CARD_TSX_SRC, RESOLVER_NAME)

// =========================================================================
// (a) The resolver function is defined.
// =========================================================================

test(`(a) ${RESOLVER_NAME} is defined in BpsWellbeingScoreCard.tsx`, () => {
  assert.ok(
    RESOLVER,
    `components/health-plan/BpsWellbeingScoreCard.tsx must define a function named \`${RESOLVER_NAME}\` (chunk 66). If this fails, either the function was renamed (update RESOLVER_NAME in this suite AND every call site) or deleted (the empty-pill CTA no longer has its "always resolve to a target" resolver — see chunk 66 for the "same catalog" regression Ken flagged).`,
  )
})

// =========================================================================
// (b) The function considers ALL DOMAIN_MEMBERS for the given domain —
//     reads DOMAIN_MEMBERS keyed by an argument AND iterates the members.
// =========================================================================

test(`(b) ${RESOLVER_NAME} reads DOMAIN_MEMBERS[<domain>] and iterates the members`, () => {
  assert.ok(RESOLVER, 'wire (a) must pass before (b) can run')
  assert.match(
    RESOLVER.body,
    /DOMAIN_MEMBERS\s*\[/,
    `${RESOLVER_NAME} must access DOMAIN_MEMBERS[<domain>] to enumerate the members of the requested BPS domain. If this fails, the resolver is not source-of-truth for the domain-to-members mapping — a divergent hard-coded list would silently miss instruments Ken added via chunk 65's catalog.`,
  )
  assert.match(
    RESOLVER.body,
    /\bfor\s*\(|\.forEach\s*\(|\.map\s*\(|\.filter\s*\(|\.reduce\s*\(|\.some\s*\(|\.every\s*\(|\.find\s*\(/,
    `${RESOLVER_NAME} must iterate DOMAIN_MEMBERS[<domain>] (for-loop OR .forEach/.map/.filter/.reduce/.some/.every/.find). If this fails, the resolver only inspects a single member and cannot honor the chunk-66 priority order (no-record → expired → oldest-completed) across ALL members of the domain.`,
  )
})

// =========================================================================
// (c) The function has a fallback branch — a return statement that fires
//     AFTER the members-loop completes. Chunk 66 requirement: the
//     "last-resort" retake-oldest / equivalent branch must exist.
// =========================================================================

test(`(c) ${RESOLVER_NAME} has a fallback return AFTER the members-loop`, () => {
  assert.ok(RESOLVER, 'wire (a) must pass before (c) can run')
  assert.ok(
    hasFallbackReturnAfterLoop(RESOLVER.body),
    `${RESOLVER_NAME} must contain a return statement structurally AFTER the members-loop closing brace (chunk 66 last-resort branch — "retake-oldest as a last resort so we always route to a real take-flow instead of dumping the user on a catalog page of 'all completed' items"). If this fails, the function falls off the end of the loop and implicitly returns undefined — the CTA falls back to /Home/assessments-catalog and Ken sees the "same catalog" regression chunk 66 fixed.`,
  )
})

// =========================================================================
// (d) The function is CALLED from the wellbeing card CTA onPress handler.
//     Grep the same file for at least one `NAME(` invocation that is NOT
//     the definition. Extra credit: the invocation must sit inside the
//     `onPressCta` handler body (chunk 66 wired the CTA to this resolver).
// =========================================================================

test(`(d) ${RESOLVER_NAME} is called from the CTA onPress handler`, () => {
  // Strip trailing inline `// ...` comments FIRST so a residual
  // `// pickTargetForDomain(domain)` trailer on a code line (which the
  // shared stripComments helper leaves alone, by design, because it is
  // cautious about `//` inside string literals like `'https://foo'`)
  // cannot false-satisfy this wire. See task spec: "the call-site wire
  // actually references the function and is not satisfied by a
  // comment." The narrow rewrite is safe here because `pickTargetForDomain`
  // never appears inside a URL / string literal in this codebase.
  const codeOnly = stripTrailingInlineComments(CARD_TSX_SRC)

  // Any invocation shape `NAME(...)` — the definition is `const NAME =`
  // so it does not match `NAME(`.
  const callPattern = new RegExp(`\\b${RESOLVER_NAME}\\s*\\(`, 'g')
  const calls = codeOnly.match(callPattern) ?? []
  assert.ok(
    calls.length >= 1,
    `components/health-plan/BpsWellbeingScoreCard.tsx must contain at least one CODE invocation of ${RESOLVER_NAME}(...) (trailing \`// comment\` occurrences do not count). If this fails, the resolver is orphaned — some other code path is picking the target and the chunk-66 contract is no longer enforced at the CTA.`,
  )

  // Stronger check: the invocation must live inside the onPressCta
  // handler body. Locate `onPressCta` and walk to the matching `}` of
  // its React.useCallback arrow body, then confirm the call sits inside
  // that span. If a future refactor renames the handler (unlikely — it
  // is stable since chunk 47), update this constant in lockstep.
  const HANDLER_NAME = 'onPressCta'
  const handler = extractFunctionBody(codeOnly, HANDLER_NAME)
  assert.ok(
    handler,
    `components/health-plan/BpsWellbeingScoreCard.tsx must define an \`${HANDLER_NAME}\` handler (the empty-pill CTA onPress). If this fails, the CTA wiring has been renamed — update HANDLER_NAME in this suite in lockstep with the rename.`,
  )
  assert.match(
    handler.body,
    new RegExp(`\\b${RESOLVER_NAME}\\s*\\(`),
    `${HANDLER_NAME} must call ${RESOLVER_NAME}(...) in CODE (not just in a trailing \`// comment\`). If this fails, the CTA no longer routes through the chunk-66 resolver — either it inlined a different picker (which likely dropped the retake-oldest fallback) or it hardcoded a route.`,
  )
})

// =========================================================================
// (e) The fallback path does NOT return null or undefined. Chunk 66's
//     exact fix was to REPLACE `return undefined` with an
//     always-resolvable expression (`oldestCompleted?.id` today, but any
//     non-null/non-undefined RHS is acceptable — the wire only defends
//     against the specific regression shape).
// =========================================================================

test(`(e) ${RESOLVER_NAME}'s last return is not \`return null\` or \`return undefined\``, () => {
  assert.ok(RESOLVER, 'wire (a) must pass before (e) can run')
  const last = findLastReturn(RESOLVER.body)
  assert.ok(
    last,
    `${RESOLVER_NAME} must contain at least one return statement. If this fails, the function has no explicit return — implicit undefined re-introduces the chunk-66 "same catalog" regression.`,
  )
  const rhs = last.rhs
  assert.notEqual(
    rhs,
    '',
    `${RESOLVER_NAME}'s last return statement has an empty RHS (\`return;\`), which returns undefined and re-introduces the chunk-66 "same catalog" regression. Chunk 66 requires an always-resolvable expression (e.g. \`return oldestCompleted?.id\` or \`return members[0]\`) — the CTA depends on this to route to a real take-flow.`,
  )
  assert.notEqual(
    rhs,
    'null',
    `${RESOLVER_NAME}'s last return statement is \`return null\`, which re-introduces the chunk-66 "same catalog" regression. Chunk 66's exact fix was to REPLACE the undefined/null fallback with an always-resolvable expression. If Ken really wants null semantics back (unlikely — his verbatim complaint was the null-fallback UX), update this wire in lockstep with a chunk-66-superseding decision doc.`,
  )
  assert.notEqual(
    rhs,
    'undefined',
    `${RESOLVER_NAME}'s last return statement is \`return undefined\`, which re-introduces the chunk-66 "same catalog" regression. Chunk 66's exact fix was to REPLACE the undefined fallback with an always-resolvable expression. See chunk 66 rationale in BpsWellbeingScoreCard.tsx above ${RESOLVER_NAME}.`,
  )
})

// =========================================================================
// SELF-VERIFICATION (chunk 98 v2 / 103 / 107 / 109 / 113 / 116 discipline
// — prove the trap snaps shut).
//
// These tests do NOT read the live BpsWellbeingScoreCard.tsx. They
// exercise the exact parsers + assertions above against synthetic
// sources whose SOLE PURPOSE is to reproduce the drift shape each wire
// is meant to catch. If ANY of these self-checks flip green when the
// drift is present, the corresponding wire above is toothless.
// =========================================================================

// Synthetic baseline: the current shipped shape, minus JSX / hooks /
// TypeScript annotations that the parsers do not care about. Every
// self-check mutates ONE thing off this baseline and asserts the
// corresponding wire would fire.
const SYNTH_BASELINE = [
  "const pickTargetForDomain = React.useCallback(",
  "  (domain) => {",
  "    const members = DOMAIN_MEMBERS[domain]",
  "    const now = Date.now()",
  "    let oldestCompleted",
  "    for (const id of members) {",
  "      if (!visibleInstruments.has(id)) continue",
  "      const record = completedById.get(id)",
  "      if (!record) return id",
  "      const exp = Date.parse(record.expiresAt)",
  "      if (Number.isFinite(exp) && exp <= now) return id",
  "      const completedAt = Date.parse(record.completedAt)",
  "      if (Number.isFinite(completedAt)) {",
  "        if (!oldestCompleted || completedAt < oldestCompleted.completedAt) {",
  "          oldestCompleted = { id, completedAt }",
  "        }",
  "      }",
  "    }",
  "    return oldestCompleted?.id",
  "  },",
  "  [completedById, visibleInstruments],",
  ")",
  "",
  "const onPressCta = React.useCallback(() => {",
  "  for (const domain of emptyDomains) {",
  "    const instrumentId = pickTargetForDomain(domain)",
  "    if (instrumentId) {",
  "      router.push({ pathname: '/Home/assessment-stepper', params: { instrumentId } })",
  "      return",
  "    }",
  "  }",
  "  router.push({ pathname: '/Home/assessments-catalog' })",
  "}, [emptyDomains, pickTargetForDomain])",
].join('\n')

test('self-check: baseline synthetic source PASSES every wire', () => {
  // Sanity: if the baseline itself fails a wire, the parsers are wrong
  // and the drift self-checks below are testing the wrong thing.
  const src = stripComments(SYNTH_BASELINE)
  const resolver = extractFunctionBody(src, 'pickTargetForDomain')
  assert.ok(resolver, 'self-check baseline: resolver must parse')
  assert.match(resolver.body, /DOMAIN_MEMBERS\s*\[/)
  assert.match(resolver.body, /\bfor\s*\(/)
  assert.ok(hasFallbackReturnAfterLoop(resolver.body))
  const last = findLastReturn(resolver.body)
  assert.ok(last)
  assert.notEqual(last.rhs, 'null')
  assert.notEqual(last.rhs, 'undefined')
  assert.notEqual(last.rhs, '')
  const handler = extractFunctionBody(src, 'onPressCta')
  assert.ok(handler, 'self-check baseline: onPressCta handler must parse')
  assert.match(handler.body, /\bpickTargetForDomain\s*\(/)
})

// -------------------------------------------------------------------------
// Self-check #1 (wire (e)): mutate the fallback branch to `return null`.
// The `findLastReturn(...).rhs === 'null'` check must catch it.
// -------------------------------------------------------------------------

test('self-check: wire (e) fails when the fallback branch returns null', () => {
  const broken = SYNTH_BASELINE.replace(
    'return oldestCompleted?.id',
    'return null',
  )
  const src = stripComments(broken)
  const resolver = extractFunctionBody(src, 'pickTargetForDomain')
  assert.ok(resolver, 'self-check #1: resolver must still parse')
  const last = findLastReturn(resolver.body)
  assert.ok(last, 'self-check #1: last return must be found')
  assert.equal(
    last.rhs,
    'null',
    `self-check: wire (e) must observe \`return null\` as the last return in the mutated synthetic source. If this flips (rhs !== 'null'), the parser is broken or wire (e) cannot detect the chunk-66 regression it exists to catch.`,
  )
})

// -------------------------------------------------------------------------
// Self-check #2 (wire (d)): remove the CTA call site. The
// `handler.body` match against `pickTargetForDomain(` must fail.
// -------------------------------------------------------------------------

test('self-check: wire (d) fails when the CTA call site is removed', () => {
  const broken = SYNTH_BASELINE.replace(
    'const instrumentId = pickTargetForDomain(domain)',
    'const instrumentId = undefined',
  )
  const src = stripComments(broken)
  const handler = extractFunctionBody(src, 'onPressCta')
  assert.ok(handler, 'self-check #2: onPressCta must still parse')
  assert.doesNotMatch(
    handler.body,
    /\bpickTargetForDomain\s*\(/,
    `self-check: wire (d) must NOT observe a pickTargetForDomain(...) call inside onPressCta when the call site was inlined away. If this flips (regex still matches), the parser is broken or wire (d) cannot detect a CTA-orphan refactor.`,
  )
})

// -------------------------------------------------------------------------
// Self-check #3 (wire (a)): drop the function definition entirely. The
// `extractFunctionBody(...)` lookup must return null.
// -------------------------------------------------------------------------

test('self-check: wire (a) fails when the function definition is dropped', () => {
  // Snip out the `const pickTargetForDomain = React.useCallback(` line
  // AND its arrow body — replace the whole block with a stub comment
  // (which strip-comments will blank). We use a marker-based cut so
  // the deletion is deterministic.
  const startMarker = 'const pickTargetForDomain'
  const endMarker = ')' // matches the useCallback close
  const startIdx = SYNTH_BASELINE.indexOf(startMarker)
  assert.ok(startIdx >= 0, 'self-check #3: baseline must contain the resolver')
  // Delete from `const pickTargetForDomain` up to and including the
  // FIRST subsequent standalone `)` line (the close of useCallback).
  const afterStart = SYNTH_BASELINE.slice(startIdx)
  const closeIdx = afterStart.indexOf('\n)\n')
  assert.ok(closeIdx >= 0, 'self-check #3: baseline useCallback close must be found')
  const broken =
    SYNTH_BASELINE.slice(0, startIdx) +
    // Leave the surrounding code intact; just drop the definition block.
    SYNTH_BASELINE.slice(startIdx + closeIdx + 3 /* '\n)\n' length */)
  const src = stripComments(broken)
  const resolver = extractFunctionBody(src, 'pickTargetForDomain')
  assert.equal(
    resolver,
    null,
    `self-check: wire (a) must NOT find a pickTargetForDomain definition when it was deleted. If this flips (resolver !== null), the parser is falsely matching call sites or an unrelated identifier as a definition — wire (a) would let a silent deletion through.`,
  )
})

// -------------------------------------------------------------------------
// Self-check #4 (wire (e) — `return undefined` variant): mutate the
// fallback branch to `return undefined`. Complements self-check #1 which
// only covers `return null`. Task spec explicitly requires both variants
// (plus bare `return`) to be caught by wire (e).
// -------------------------------------------------------------------------

test('self-check: wire (e) fails when the fallback branch returns undefined', () => {
  const broken = SYNTH_BASELINE.replace(
    'return oldestCompleted?.id',
    'return undefined',
  )
  const src = stripComments(broken)
  const resolver = extractFunctionBody(src, 'pickTargetForDomain')
  assert.ok(resolver, 'self-check #4: resolver must still parse')
  const last = findLastReturn(resolver.body)
  assert.ok(last, 'self-check #4: last return must be found')
  assert.equal(
    last.rhs,
    'undefined',
    `self-check: wire (e) must observe \`return undefined\` as the last return in the mutated synthetic source. If this flips (rhs !== 'undefined'), wire (e) is missing the "same catalog" regression's undefined variant — the exact shape chunk 66 replaced with an always-resolvable expression.`,
  )
})

// -------------------------------------------------------------------------
// Self-check #5 (wire (e) — bare `return` variant): mutate the fallback
// branch to a bare `return` with no RHS. Yields implicit undefined at
// runtime — same "same catalog" regression as `return null` /
// `return undefined`. Task spec explicitly calls out this shape.
// -------------------------------------------------------------------------

test('self-check: wire (e) fails when the fallback branch is a bare `return`', () => {
  const broken = SYNTH_BASELINE.replace(
    'return oldestCompleted?.id',
    'return',
  )
  const src = stripComments(broken)
  const resolver = extractFunctionBody(src, 'pickTargetForDomain')
  assert.ok(resolver, 'self-check #5: resolver must still parse')
  const last = findLastReturn(resolver.body)
  assert.ok(last, 'self-check #5: last return must be found')
  assert.equal(
    last.rhs,
    '',
    `self-check: wire (e) must observe an EMPTY RHS on the last return statement in the mutated synthetic source (bare \`return\`). If this flips (rhs !== ''), wire (e) is missing the bare-return regression variant — which returns undefined at runtime and re-introduces the chunk-66 "same catalog" complaint just as certainly as \`return null\`.`,
  )
})

// -------------------------------------------------------------------------
// Self-check #5b: also verify \`return;\` (bare return terminated by
// semicolon) yields an empty RHS. Some refactor tools rewrite bare
// `return` into `return;` for consistency; wire (e) must catch both.
// -------------------------------------------------------------------------

test('self-check: wire (e) fails when the fallback branch is `return;`', () => {
  const broken = SYNTH_BASELINE.replace(
    'return oldestCompleted?.id',
    'return;',
  )
  const src = stripComments(broken)
  const resolver = extractFunctionBody(src, 'pickTargetForDomain')
  assert.ok(resolver, 'self-check #5b: resolver must still parse')
  const last = findLastReturn(resolver.body)
  assert.ok(last, 'self-check #5b: last return must be found')
  assert.equal(
    last.rhs,
    '',
    `self-check: wire (e) must observe an EMPTY RHS on \`return;\`. If this flips, the findLastReturn regex is grabbing text past the semicolon and wire (e) would let \`return;\` through as if it were a real expression.`,
  )
})

// -------------------------------------------------------------------------
// Self-check #6 (wire (d) — trailing-comment safety): the ONLY
// occurrence of `pickTargetForDomain(` inside onPressCta is a TRAILING
// inline `// comment` on a code line. The shared stripComments helper
// (chunk 103) leaves such trailers intact by design (URL-inside-string
// caution). Wire (d) must therefore run stripTrailingInlineComments
// FIRST, and this self-check pins that invariant: the wire's helper
// must strip the trailer so the identifier is no longer visible to the
// call-site regex.
//
// Task spec: "the call-site wire actually references the function and
// is not satisfied by a comment."
// -------------------------------------------------------------------------

test('self-check: wire (d) fails when the only call site is inside a trailing `// comment`', () => {
  // Rewrite the CTA handler so its body has no CODE call to
  // pickTargetForDomain — only a trailing-inline-comment mention.
  const broken = SYNTH_BASELINE.replace(
    'const instrumentId = pickTargetForDomain(domain)',
    'const instrumentId = undefined // was: pickTargetForDomain(domain)',
  )
  // Simulate wire (d)'s pipeline in order: stripComments (line-oriented,
  // leaves trailer alone) THEN stripTrailingInlineComments (the wire's
  // fix). After the second pass, the trailer is gone.
  const stripped = stripComments(broken)
  // Sanity: the trailer survives the shared line-oriented stripper.
  const handlerRaw = extractFunctionBody(stripped, 'onPressCta')
  assert.ok(handlerRaw, 'self-check #6: onPressCta must still parse')
  assert.match(
    handlerRaw.body,
    /\bpickTargetForDomain\s*\(/,
    'self-check #6 precondition: the trailer must survive stripComments — otherwise this self-check is verifying nothing.',
  )
  // Now apply the wire's own trailing-inline-comment stripper and
  // confirm the identifier disappears from onPressCta's body.
  const codeOnly = stripTrailingInlineComments(stripped)
  const handlerCodeOnly = extractFunctionBody(codeOnly, 'onPressCta')
  assert.ok(handlerCodeOnly, 'self-check #6: onPressCta must still parse after trailer strip')
  assert.doesNotMatch(
    handlerCodeOnly.body,
    /\bpickTargetForDomain\s*\(/,
    `self-check: wire (d)'s stripTrailingInlineComments helper must remove a trailing \`// pickTargetForDomain(domain)\` on a code line so the call-site regex cannot false-match on a comment. If this flips (regex still matches), wire (d) is satisfiable by a stale commented-out reference — exactly the failure mode the task spec calls out.`,
  )
})

// -------------------------------------------------------------------------
// Self-check #7 (stripTrailingInlineComments — string-literal safety):
// a `//` sequence sitting inside a single- or double-quoted string on a
// code line must NOT be treated as a comment. Guards against a URL like
// `'https://example.com'` being truncated mid-string.
// -------------------------------------------------------------------------

test('self-check: stripTrailingInlineComments preserves `//` inside string literals', () => {
  const src = "const url = 'https://api.example.com/v1/plan'"
  const stripped = stripTrailingInlineComments(src)
  assert.equal(
    stripped,
    src,
    'self-check: stripTrailingInlineComments must leave `//` inside a quoted string intact. If this flips (result != input), the helper truncates URLs mid-string and would corrupt the source before wire (d) scans it.',
  )
})
