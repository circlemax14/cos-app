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
  // COS-1180 — the GATED tab, via the shared constant. '/Home/health-plan' is
  // retired from the tab bar and can render PlanScreenRedesignedV2, which has
  // no retake card and no gate, so a finished walk would land somewhere that
  // cannot show the rebuild at all.
  assert.match(
    stepperSrc,
    /planHref: RETAKE_GATE_ROUTE/,
    'a finished walk must end on the gated plan tab, where the rebuild renders',
  )
  assert.doesNotMatch(stepperSrc, /planHref: '\/Home\/health-plan'/)
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
const gateSrc = read('components', 'health-plan', 'retake-request', 'RetakeRequiredGate.tsx')
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

// ─── COS-1179 ──────────────────────────────────────────────────────────────

const apiTypeSrc = read('services', 'api', 'retake-requests.ts')

test('COS-1179: the card does not offer "Not now" on a MANDATORY request', () => {
  /*
   * Vishal, 2026-09-30, on a mandatory all-assessments request: "when I clicked
   * on not now it took me to a screen that when would you like to be reminded
   * ... But I'm not able to click on any[,] so what is the use of this screen if
   * I cannot click on anything".
   *
   * The server has refused snooze AND dismiss on mandatory rows since #10b
   * (MandatoryRequestError → 409). Every option on that sheet was guaranteed to
   * fail. The card kept offering a door the server keeps locked.
   */
  assert.match(cardSrc, /first\.mandatory === true \?/)
  const branch = cardSrc.match(/first\.mandatory === true \?[\s\S]{0,600}?\) : \(/)
  assert.ok(branch, 'the mandatory branch is gone')
  // Replaced by a label, not another tappable dead end.
  assert.doesNotMatch(branch[0], /onPress/)
  assert.match(branch[0], /can't be postponed|can&apos;t be postponed/)
})

test('COS-1179: the non-mandatory path still offers it', () => {
  // Mandatory is the exception; an ordinary request must stay deferrable, or the
  // gate becomes a hard block on the patient's own care plan.
  assert.match(cardSrc, /onPress=\{onNotNow\}/)
})

test('COS-1179: the app type declares mandatory, or nothing can read it', () => {
  // The root cause: the backend has written this since #10b and the DASHBOARD
  // type declared it, but the APP type did not — so no app surface could.
  assert.match(apiTypeSrc, /mandatory\?: boolean/)
})

// ─── COS-1181 ──────────────────────────────────────────────────────────────

const queueHookSrc = read('hooks', 'use-retake-queue.ts')

test('COS-1181 THE FIX: "Start now" deep-links into the stepper, never the picker', () => {
  /*
   * Vishal, third report: "if I click on the start now it is taking me to health
   * check-ins ... Why can't I start the assessment directly? I told you multiple
   * times."
   *
   * The card must resolve the scope ITSELF and navigate to the first owed
   * check-in. retakeStartRoute stays only as the fallback for things with
   * nothing to walk.
   */
  // COS-1184 passes the whole request, not just the key — the queue needs its
  // createdAt as the watermark.
  assert.match(cardSrc, /useRetakeQueue\(first \?\? null\)/)
  const handler = cardSrc.match(/const onStartNow = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\)/)
  assert.ok(handler, 'onStartNow not found')
  assert.match(
    handler[0],
    /\/Home\/assessment-stepper\?instrumentId=\$\{next\}&source=retake-request&queue=\$\{rest\}/,
  )
  // The queue must be carried, or the stepper cannot walk past the first one.
  assert.match(handler[0], /queue\.ids\.join\(','\)/)
})

test('COS-1181: a tap before the queue resolves cannot fall through to the picker', () => {
  const handler = cardSrc.match(/const onStartNow = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\)/)
  assert.match(handler[0], /if \(!queue\.ready\) return/)
  // And the button says so rather than silently ignoring the tap.
  assert.match(cardSrc, /disabled=\{!queue\.ready\}/)
})

test('COS-1181: retakeStartRoute survives as the fallback, not the default', () => {
  // Single instruments open directly, full-intake has its own wizard, and an
  // already-satisfied scope has no instrument to open.
  const handler = cardSrc.match(/const onStartNow = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\)/)
  const stepperAt = handler[0].indexOf('assessment-stepper')
  const fallbackAt = handler[0].indexOf('retakeStartRoute')
  assert.ok(stepperAt > -1 && fallbackAt > stepperAt, 'the walk must be tried FIRST')
})

test('COS-1181: the hook reuses the shared query keys, adding no new fetch surface', () => {
  // Same keys and same staleTimes as the catalog — two surfaces disagreeing
  // about freshness would show two different queues.
  assert.match(queueHookSrc, /queryKey: \['instruments-recommended'\]/)
  assert.match(queueHookSrc, /queryKey: \['assessments'\]/)
  assert.match(queueHookSrc, /useHealthPlanAssignments\(\)/)
})

test('COS-1181: the hook does not fetch for a non-scope request', () => {
  // A single instrument or full-intake has nothing to resolve.
  assert.match(queueHookSrc, /const enabled = scope !== null/)
  assert.match(queueHookSrc, /enabled,/)
})

test('COS-1181: the catalog no longer owns the scoping logic', () => {
  assert.match(catalogSrc, /orderAssignedInstruments\(\{/)
  assert.doesNotMatch(catalogSrc, /const ORDER: readonly string\[\]/)
})

// ─── COS-1182 / COS-1183 — the health-status workflow ──────────────────────

const intakeGateSrc = read('components', 'health-summary', 'IntakeRequiredGate.tsx')
const healthStatusSrc = read('app', 'Home', 'plan.tsx')
const wizardSrc = read('components', 'health-plan', 'patient-intake', 'IntakeWizardScreen.tsx')
const intakeHookSrc = read('hooks', 'use-patient-intake.ts')
const sheetSrc = read('app', 'Home', 'retake-snooze-sheet.tsx')

test('COS-1182: the plan gate counts ONLY assessment requests', () => {
  // It used to count every track, so a "redo your Health Status" ask blocked the
  // CARE PLAN under assessment copy.
  assert.match(gateSrc, /retakeTrackOf\(r\.instrumentKey\) === 'assessment'/)
})

test('COS-1182: the Health Status screen has its own gate, on its own track', () => {
  assert.match(intakeGateSrc, /retakeTrackOf\(r\.instrumentKey\) === 'health-status-intake'/)
  assert.match(healthStatusSrc, /<IntakeRequiredGate rebuilding=\{summaryData\?\.rebuilding === true\}>/)
  assert.match(healthStatusSrc, /<\/IntakeRequiredGate>/)
})

test('COS-1182: the gate is INSIDE AppWrapper, so it keeps a way out', () => {
  // The snooze sheet's own bug was a gated body with no chrome and no exit.
  const i = healthStatusSrc.indexOf('<AppWrapper>')
  const j = healthStatusSrc.indexOf('<IntakeRequiredGate')
  assert.ok(i > -1 && j > i, 'the gate must be nested inside AppWrapper')
})

test('COS-1182 THE ORDERING: rebuild is checked BEFORE pending', () => {
  // Completing the intake both clears the request AND starts the rebuild;
  // pending-first would flash the OLD health status in the gap.
  const reb = intakeGateSrc.indexOf('if (rebuilding === true)')
  const pend = intakeGateSrc.indexOf('if (pendingCount <= 0)')
  assert.ok(reb > -1 && pend > -1 && reb < pend)
})

test('COS-1182: the card can be asked for one track, so the wrong ask cannot show', () => {
  assert.match(cardSrc, /track \? rows\.find\(\(r\) => retakeTrackOf\(r\.instrumentKey\) === track\) : rows\[0\]/)
  assert.match(intakeGateSrc, /<RetakeRequestInboxCard track="health-status-intake" \/>/)
})

test('COS-1182: completing the intake invalidates the summary and the pending list', () => {
  const block = intakeHookSrc.match(/export function useCompleteIntake\(\)[\s\S]*?\n\}/)
  assert.ok(block)
  assert.match(block[0], /queryKey: \['health-summary'\]/)
  assert.match(block[0], /queryKey: \['retake-requests', 'me'\]/)
})

test('COS-1182: Skip is visible, and only where skipping is real', () => {
  // Not one intake question sets required:true, so every one was already
  // skippable via Next-on-blank — undiscoverable, not impossible.
  assert.match(wizardSrc, /Skip this question/)
  // Never on the last step ("Skip" beside "Finish" reads as finish-without-saving),
  // and never on a required question if one ever appears.
  assert.match(wizardSrc, /current && !current\.required && stepIdx < total - 1/)
})

test('COS-1183: a gated snooze sheet can explain itself and be closed', () => {
  // Everything, including the error banner, used to sit inside {canView && …} on
  // a route with headerShown:false — a blank page with no exit.
  assert.match(sheetSrc, /\{!canView \? \(/)
  const denied = sheetSrc.match(/\{!canView \? \([\s\S]{0,900}?\) : \(/)
  assert.ok(denied)
  assert.match(denied[0], /Close/)
  assert.match(denied[0], /closeAndReturn/)
})

test('COS-1183: the sheet scrolls, so the dismiss row cannot fall off-screen', () => {
  assert.match(sheetSrc, /<ScrollView/)
  assert.match(sheetSrc, /import \{ ActivityIndicator, Pressable, ScrollView/)
})

test('COS-1183: an in-flight tap is visible, not a 15% dim for 30 seconds', () => {
  assert.match(sheetSrc, /busy \? \(\s*\n?\s*<ActivityIndicator/)
})

// ─── COS-1184 ──────────────────────────────────────────────────────────────

test('COS-1184: the hook uses the request WATERMARK, not ever-completed', () => {
  /*
   * The bug that survived COS-1181. A retake is raised against someone WITH
   * history, so ever-completed emptied the queue for exactly the patients the
   * request is for — and the card then fell through to the catalog.
   */
  assert.match(queueHookSrc, /satisfiedSince\(assessmentsQuery\.data, since\)/)
  assert.match(queueHookSrc, /const since = request\?\.createdAt/)
  // The card must hand over the whole request, not just the key.
  assert.match(cardSrc, /useRetakeQueue\(first \?\? null\)/)
})

test('COS-1184: the watermark is part of the memo deps', () => {
  // Otherwise a new request with the same key reuses the previous queue.
  // COS-1185 reformatted the deps to multiline when it added the error flags;
  // assert membership rather than the exact single-line shape.
  assert.match(queueHookSrc, /^\s*since,$/m)
  assert.match(queueHookSrc, /^\s*scope,$/m)
})

test('COS-1184 THE POINT: a satisfied SCOPE goes to the gate, never the catalog', () => {
  const handler = cardSrc.match(/const onStartNow = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\)/)
  assert.ok(handler)
  // COS-1185 additionally requires the queue to have RESOLVED — an empty queue
  // from a failed read means nothing and must not read as "satisfied".
  assert.match(handler[0], /if \(queue\.resolved && parseRetakeScopeKey\(first\.instrumentKey\)\) \{/)
  assert.match(handler[0], /router\.push\(RETAKE_GATE_ROUTE as never\)/)
  // retakeStartRoute survives only for keys with nowhere to walk.
  const scopeAt = handler[0].indexOf('parseRetakeScopeKey')
  const fallbackAt = handler[0].lastIndexOf('retakeStartRoute')
  assert.ok(scopeAt < fallbackAt, 'the scope branch must precede the fallback')
})

test('COS-1184: PHQ-9 eligibility reads the LATEST phq-2, watermark or not', () => {
  // It is a clinical skip rule about the patient, not about this request.
  assert.match(queueHookSrc, /if \(at >= phq2At\)/)
})

// ─── COS-1185 ──────────────────────────────────────────────────────────────

test('COS-1185: a failed query gives up rather than disabling the button forever', () => {
  /*
   * `ready` gates the button. Without this the three queries erroring leaves it
   * disabled permanently — a dead button, which is the same "nothing happens"
   * this whole change set has been chasing.
   */
  assert.match(
    queueHookSrc,
    /if \(instrumentsQuery\.isError \|\| assessmentsQuery\.isError \|\| assignmentsQuery\.isError\) \{/,
  )
  assert.match(queueHookSrc, /return \{ ids: \[\], ready: true, resolved: false \}/)
})

test('COS-1185: an empty queue only means "satisfied" when it was RESOLVED', () => {
  // ready && !resolved means we gave up; an empty queue then means nothing.
  const handler = cardSrc.match(/const onStartNow = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\)/)
  assert.ok(handler)
  assert.match(handler[0], /if \(queue\.resolved && parseRetakeScopeKey\(first\.instrumentKey\)\)/)
  // …and the fallback is still reachable below it.
  assert.match(handler[0], /retakeStartRoute\(first\.instrumentKey\)/)
})

test('COS-1185: the error flags are in the memo deps', () => {
  // Otherwise a recovered query never recomputes the queue.
  assert.match(queueHookSrc, /instrumentsQuery\.isError,/)
  assert.match(queueHookSrc, /assignmentsQuery\.isError,/)
})
