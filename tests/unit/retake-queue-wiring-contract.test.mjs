// tests/unit/retake-queue-wiring-contract.test.mjs — COS-1174 (2026-09-30)
//
// Source-drift trip wires for the retake WALK, wired across three files:
//   - lib/retake-queue.ts                              — pure queue + resolver
//   - components/health-plan/AssessmentCatalogContent  — ORIGINATES the queue
//   - app/Home/assessment-stepper.tsx                  — CONSUMES it on submit
//
// Why a source contract and not a render test: the behaviour is two deep-link
// params crossing a screen boundary. The pure halves are covered by
// retake-queue.test.ts; what cannot be unit-tested is that the wiring is
// actually attached. Both halves are individually harmless-looking to delete —
// the catalog still navigates, the stepper still exits — and the feature
// silently stops working, which is exactly how it reached Vishal the first time.
//
// If an assertion fires, DO NOT edit the regex. Read the diff, confirm the
// change is deliberate, then update the wire in lockstep.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { stripComments } from './strip-comments.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

const read = (...p) => stripComments(readFileSync(join(REPO_ROOT, ...p), 'utf8'))

const stepperSrc = read('app', 'Home', 'assessment-stepper.tsx')
const catalogSrc = read('components', 'health-plan', 'AssessmentCatalogContent.tsx')
const inlineSrc = read('components', 'unified-plan', 'v2', 'InlineAssessmentCatalog.tsx')

test('the stepper reads the queue param', () => {
  assert.match(
    stepperSrc,
    /useLocalSearchParams<\{[^}]*queue\?: string[^}]*\}>/,
    'assessment-stepper must declare the `queue` param or it arrives undefined and every walk ends at the catalog',
  )
})

test('THE POINT: the completion exit routes to completionHref, not returnHref', () => {
  // The celebration timer is the ONLY exit that advances a walk.
  const effect = stepperSrc.match(
    /if \(!celebrating\) return[\s\S]{0,300}?\}, \[celebrating[^\]]*\]\)/,
  )
  assert.ok(effect, 'could not find the celebration exit effect — it was restructured')
  assert.match(
    effect[0],
    /router\.replace\(completionHref as never\)/,
    'the completion exit must use completionHref; reverting it to returnHref restores the "in between middleware"',
  )
})

test('completionHref is built by the shared resolver, with the plan as the walk-end', () => {
  assert.match(stepperSrc, /resolveCompletionHref\(\{/)
  assert.match(
    stepperSrc,
    /planHref: '\/Home\/health-plan'/,
    'a finished walk must end on the plan — that is where RetakeRequiredGate renders the rebuild',
  )
  assert.match(stepperSrc, /from '@\/lib\/retake-queue'/)
})

test('Close and Back still abandon to returnHref, not into the walk', () => {
  // Abandoning part-way must NOT dump the patient on the plan they were asked
  // to reassess; they need the remaining check-ins still in front of them.
  const replaces = stepperSrc.match(/router\.replace\((returnHref|completionHref) as never\)/g) ?? []
  assert.equal(
    replaces.filter((r) => r.includes('completionHref')).length,
    1,
    'exactly ONE exit advances the walk',
  )
  assert.ok(
    replaces.filter((r) => r.includes('returnHref')).length >= 2,
    'Close and Back-from-first-step must keep using returnHref',
  )
})

test('the catalog originates the queue from a pending scope', () => {
  assert.match(catalogSrc, /usePendingRetakeRequests\(\)/)
  assert.match(catalogSrc, /parseRetakeScopeKey\(/)
  assert.match(catalogSrc, /buildRetakeQueue\(\{/)
  assert.match(catalogSrc, /encodeRetakeQueue\(/)
})

test('THE OTHER HALF: the catalog tap actually carries the queue param', () => {
  const tap = catalogSrc.match(
    /pathname: '\/Home\/assessment-stepper' as never,[\s\S]{0,400}?\}\)/,
  )
  assert.ok(tap, 'could not find the catalog tap navigation')
  assert.match(
    tap[0],
    /queue: queueParam/,
    'without this the stepper never receives a queue and auto-advance is dead code',
  )
})

test('the queue is only attached when a scope retake is actually pending', () => {
  // A queue on every tap would make ordinary browsing auto-advance, which is
  // the OPPOSITE of what Ken asked for on 2026-07-23 (he wants the picker
  // back between self-directed check-ins).
  assert.match(
    catalogSrc,
    /queueParam\s*\n?\s*\?\s*\{ instrumentId: item\.instrumentId, source: 'retake-request', queue: queueParam \}\s*\n?\s*:\s*\{ instrumentId: item\.instrumentId \}/,
    'the tap must fall back to the bare instrumentId when no walk is pending',
  )
})

test('the PHQ-9 skip rule has exactly ONE definition', () => {
  // It was hand-copied verbatim in two components before COS-1174; the queue
  // needed it a third time. A drifting clinical skip rule auto-advances a
  // patient into an instrument the catalog deliberately hides.
  for (const [name, src] of [['catalog', catalogSrc], ['inline catalog', inlineSrc]]) {
    assert.match(src, /isPhq9Eligible\(/, `${name} must call the shared helper`)
    assert.doesNotMatch(
      src,
      /const phq2Sum\s*=/,
      `${name} must not recompute the PHQ-2 sum locally`,
    )
  }
})

// ─── COS-1175 ──────────────────────────────────────────────────────────────

const cardSrc = read('components', 'health-plan', 'retake-request', 'RetakeRequestInboxCard.tsx')
const routesSrc = read('lib', 'retake-routes.ts')

test('COS-1175: a set: request skips the picker entirely', () => {
  // Vishal: "this in between middleware is not required". The sweeper's
  // requests are now the common case, and a set names its own members, so
  // there is nothing for a picker to resolve.
  assert.match(routesSrc, /instrumentKey\.startsWith\('set:'\)/)
  assert.match(
    routesSrc,
    /\/Home\/assessment-stepper\?instrumentId=\$\{first\}&source=retake-request&queue=\$\{queue\}/,
  )
})

test('COS-1175: a malformed set falls back to the catalog, never an empty stepper', () => {
  const block = routesSrc.match(/if \(instrumentKey\.startsWith\('set:'\)\)[\s\S]{0,700}?\n  \}/)
  assert.ok(block, 'set branch not found')
  assert.match(block[0], /assessments-catalog/)
})

test('COS-1175: the inbox card shows rebuild status instead of a stale ask', () => {
  // He finished every check-in, returned to Home, and the card still read
  // "time to reassess" — the app asking for work he had just done.
  assert.match(cardSrc, /if \(!first\) \{/, 'the nothing-pending branch must be a block, not a bare return null')
  assert.match(cardSrc, /return rebuilding \?/)
  assert.match(cardSrc, /Rebuilding your plan/)
  assert.match(cardSrc, /useBiopsychosocialPlan\(\)/)
})

test('COS-1175: the rebuild notice carries NO actions', () => {
  // It replaces the ask; a second thing to tap during a rebuild is the loop
  // he was stuck in.
  const branch = cardSrc.match(/if \(!first\) \{[\s\S]*?\n  \}/)
  assert.ok(branch, 'nothing-pending branch not found')
  assert.doesNotMatch(branch[0], /<Pressable/)
  assert.doesNotMatch(branch[0], /onPress/)
})

test('COS-1175: still silent-drops when there is nothing pending and no rebuild', () => {
  const branch = cardSrc.match(/if \(!first\) \{[\s\S]*?\n  \}/)
  assert.match(branch[0], /: null/)
})

// ─── COS-1176 ──────────────────────────────────────────────────────────────

const hookSrc = read('hooks', 'use-retake-requests.ts')
const notifSrc = read('hooks', 'use-notifications.ts')

test('COS-1176: a new request reaches the patient without a push', () => {
  /*
   * Vishal: "if I am on the plan screen and if I re-initiate a retake
   * assessment ... ideally it should automatically change."
   *
   * It did, but by exactly one route — the foregrounded push invalidating the
   * key. With notifications denied or a dropped push, nothing else ever looked
   * again, and the gate is BLOCKING.
   */
  assert.match(hookSrc, /refetchInterval:\s*60_000/)
  assert.match(hookSrc, /refetchOnMount:\s*true/)
})

test('COS-1176: the push stays the fast path', () => {
  // Polling is the floor under it, not a replacement — the invalidation is
  // immediate and must not be removed in favour of the interval.
  assert.match(notifSrc, /ASSESSMENT_RETAKE_REQUESTED/)
  assert.match(
    notifSrc,
    /invalidateQueries\(\{\s*queryKey:\s*\['retake-requests',\s*'me'\]\s*\}\)/,
  )
})

test('COS-1176: the interval is not so tight it becomes a live feed', () => {
  // This query mounts on Home, the plan screen and the gate at once.
  const m = hookSrc.match(/refetchInterval:\s*([0-9_]+)/)
  assert.ok(m)
  assert.ok(Number(m[1].replace(/_/g, '')) >= 30_000, 'polling faster than 30s is a battery bug')
})
