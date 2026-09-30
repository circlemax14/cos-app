/**
 * COS-1174 — what a patient answers NEXT inside a requested retake.
 *
 * ─── THE COMPLAINT ───────────────────────────────────────────────────
 *
 * Vishal, 2026-09-30: "when I complete any assessment, why I'm being taken to
 * the health check-in screen where it is showing the assessments and the button
 * build my plan[?] ... Once I complete one assessment, then I should be taken
 * to the next one. Until I complete all of them and after that there should be
 * just a message that we are rebuilding your plan[.] this in between
 * middleware is not required".
 *
 * ─── WHY IT HAPPENED ─────────────────────────────────────────────────
 *
 * Two independent causes, and only one of them is routing.
 *
 * 1. The stepper picks its exit from a fixed token table
 *    (`resolveReturnHref`). A retake deep link sends `source=retake-request`,
 *    which NOTHING reads, and never sends `returnTo` — so every retake
 *    completion fell through to `default: '/Home/assessments-catalog'`.
 *
 * 2. There was no queue to advance along. A scope request stores ONE string
 *    (`domain:psychological`, `all-assessments`) and `retakeStartRoute` maps it
 *    to a SCREEN. Expanding a scope into actual instruments existed only on the
 *    backend (`listAssessmentsForScope`). The app never knew what "next" was.
 *
 * This module is the missing expansion, client-side, as a pure function so it
 * is testable under node's runner (no JSX — same reason `lib/lab-flagging.ts`
 * exists).
 *
 * ─── ORDER IS NOT OURS TO INVENT ─────────────────────────────────────
 *
 * The caller passes instruments in the order the catalog already resolved:
 * backend AI recommendation first, then `ORDER` as a backstop. We preserve it
 * exactly. A patient walking a queue should meet the instruments in the same
 * sequence the catalog would have shown them, or the two surfaces disagree
 * about what "first" means.
 *
 * ─── DOMAIN MEMBERSHIP USES THE COS-851 ORACLE ───────────────────────
 *
 * Membership is the instrument's STORED `domain`, with `spiritual` rolled into
 * `social` — the single oracle, same as the backend's scope expansion and the
 * catalog's own bucketing.
 *
 * ⚠️ DELIBERATELY NOT the catalog's four DISPLAY buckets. The catalog promotes
 * cognitive instruments into their own `cognitive` header, which "wins over the
 * seeded domain" for layout only. Using the display bucket here would silently
 * drop cognition-8 out of a `domain:biological` retake that the BACKEND counts
 * it in — the scope would never satisfy and the request would never clear.
 */

/** The three canonical domains a retake scope can name. */
export type RetakeScopeDomain = 'biological' | 'psychological' | 'social'

export type RetakeScope =
  | { kind: 'all' }
  | { kind: 'domain'; domain: RetakeScopeDomain }
  /**
   * COS-1175 — an explicit set of instruments, named by the request itself.
   *
   * The scheduled sweeper had no way to say "these three", so it created one
   * request per due check-in and each fired the plan gate separately. `set:`
   * is one ask the patient walks end to end.
   */
  | { kind: 'set'; instrumentIds: string[] }

/**
 * Parse a request's `instrumentKey` into a scope, or null when it names a
 * single instrument (or the health-status intake, which is its own wizard and
 * never part of an assessment queue).
 */
export function parseRetakeScopeKey(key: string): RetakeScope | null {
  if (key === 'all-assessments') return { kind: 'all' }
  if (key.startsWith('set:')) {
    const ids = key
      .slice('set:'.length)
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    return ids.length > 0 ? { kind: 'set', instrumentIds: ids } : null
  }
  if (!key.startsWith('domain:')) return null
  const domain = rollUpDomain(key.slice('domain:'.length))
  return domain === null ? null : { kind: 'domain', domain }
}

/**
 * An instrument's stored domain → its canonical bucket. `spiritual` folds into
 * `social`; anything unrecognised (or a pre-backfill row with no domain at all)
 * returns null and therefore belongs to no domain scope.
 */
export function rollUpDomain(domain: string | undefined | null): RetakeScopeDomain | null {
  switch (domain) {
    case 'biological':
      return 'biological'
    case 'psychological':
      return 'psychological'
    case 'social':
    case 'spiritual':
      return 'social'
    default:
      return null
  }
}

/** The shape the queue needs — a structural subset of `InstrumentSummary`. */
export interface QueueInstrument {
  instrumentId: string
  domain?: string | null
  comingSoon?: boolean
}

/**
 * PHQ-9 is hidden until PHQ-2 is completed AND positive (sum >= 3).
 *
 * Extracted here because this rule was already written out TWICE verbatim —
 * `AssessmentCatalogContent` and `InlineAssessmentCatalog` — and the queue
 * needs it a third time. Three hand-copies of a clinical skip rule is how a
 * patient gets auto-advanced into an instrument the catalog would have hidden.
 * Both original sites now call this.
 */
export function isPhq9Eligible(
  phq2Responses: Record<string, unknown> | undefined | null,
): boolean {
  const q1 = phq2Responses?.q1
  const q2 = phq2Responses?.q2
  const sum = (typeof q1 === 'number' ? q1 : 0) + (typeof q2 === 'number' ? q2 : 0)
  return sum >= 3
}

export interface BuildQueueArgs {
  scope: RetakeScope
  /** Catalog order — AI recommendation first, then `ORDER`. Preserved. */
  instruments: readonly QueueInstrument[]
  /**
   * Instruments already SATISFIED FOR THIS REQUEST — i.e. completed at or after
   * the request was raised. NOT "ever completed".
   *
   * COS-1184: this used to be ever-completed, and it is the reason "Start now"
   * still landed on the catalog after COS-1181. A retake is raised precisely
   * against a patient WITH history, so ever-completed empties the queue on the
   * very people the request is for, the card falls through to its catalog
   * fallback, and they arrive at a screen reading "1 of 1 completed".
   *
   * The backend has always used the watermark rule — completeSatisfiedScopes:
   * "every member instrument has a completion dated at or after the request was
   * created ... Not 'ever completed' either, or a request would clear itself the
   * moment it was raised against a patient with history." The app disagreed with
   * it, and the app was wrong.
   *
   * `useRetakeQueue` computes this; see `satisfiedSince`.
   */
  completedIds: ReadonlySet<string>
  phq9Eligible: boolean
}

/**
 * COS-1184 — which instruments count as done FOR A REQUEST raised at `since`.
 *
 * Takes the latest completion per instrument and keeps only those at or after
 * the watermark. Exported and pure so the rule the app walks by is the same one
 * the backend clears by, and so it can be tested without a QueryClient.
 */
export function satisfiedSince(
  completions: readonly { instrumentId: string; completedAt?: string | null }[],
  since: string | undefined | null,
): Set<string> {
  const latest = new Map<string, string>()
  for (const c of completions) {
    if (!c.instrumentId) continue
    const at = String(c.completedAt ?? '')
    const prev = latest.get(c.instrumentId)
    if (!prev || at > prev) latest.set(c.instrumentId, at)
  }
  const watermark = typeof since === 'string' ? since : ''
  const out = new Set<string>()
  for (const [id, at] of latest) {
    /*
     * No watermark → fall back to ever-completed. That is the old behaviour and
     * the safe one for a caller with no request context: it can only ever make
     * the queue SHORTER, never route someone into a check-in nobody asked for.
     */
    if (!watermark || at >= watermark) out.add(id)
  }
  return out
}

/**
 * The ordered instrument ids still owed under this scope.
 *
 * Empty means the scope is satisfied — which is the signal to stop walking and
 * show the rebuild, NOT to show the catalog.
 */
export function buildRetakeQueue(args: BuildQueueArgs): string[] {
  const { scope, instruments, completedIds, phq9Eligible } = args
  const out: string[] = []
  const seen = new Set<string>()
  /*
   * A set carries its OWN order — the sweeper sorts stalest-first — so walk it
   * in that order rather than the catalog's. Every other scope defers to the
   * catalog ordering it was handed.
   */
  const ordered =
    scope.kind === 'set'
      ? scope.instrumentIds
          .map((id) => instruments.find((i) => i.instrumentId === id))
          .filter((i): i is QueueInstrument => i !== undefined)
      : instruments
  for (const it of ordered) {
    const id = it.instrumentId
    if (!id || seen.has(id)) continue
    if (completedIds.has(id)) continue
    // Visible in the catalog as a planned offering, but cannot be taken
    // (SCRUM-268). Routing into one is a dead end.
    if (it.comingSoon === true) continue
    if (id === 'phq-9' && !phq9Eligible) continue
    if (scope.kind === 'domain' && rollUpDomain(it.domain) !== scope.domain) continue
    if (scope.kind === 'set' && !scope.instrumentIds.includes(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Serialise a queue for a deep link, and read it back.
 *
 * The queue travels in the URL rather than being recomputed at each hop. That
 * is deliberate: recomputing after every submit would race the caches the
 * completion just invalidated, and a queue that re-derives itself mid-walk can
 * silently reorder or repeat. The catalog computes it ONCE, and each hop pops
 * the head.
 */
export function encodeRetakeQueue(ids: readonly string[]): string {
  return ids.join(',')
}

export function decodeRetakeQueue(raw: string | undefined | null): string[] {
  if (typeof raw !== 'string' || raw === '') return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Where the stepper goes after a successful submit.
 *
 * The queue param carries the instruments still owed INCLUDING the one being
 * answered, so the last hop still arrives with a non-empty `queue`. That is
 * what lets this distinguish "finished a retake walk" (→ rebuild) from "was
 * never on one" (→ the caller's own destination, unchanged).
 *
 * `planHref` rather than the catalog is the whole point of COS-1174: the
 * catalog's primary action is "Build my plan", which has nothing to do with the
 * request the patient just answered, and landing there is the "in between
 * middleware" Vishal asked to remove.
 */
export function resolveCompletionHref(args: {
  /** Raw `queue` param, exactly as the route received it. */
  queueParam: string | undefined | null
  /** The instrument that was just submitted. */
  instrumentId: string
  /** Where a non-retake completion goes — the existing `returnTo` behaviour. */
  returnHref: string
  /** Where a finished walk goes; the gate renders the rebuild there. */
  planHref: string
  /**
   * COS-1177 — the route's `source` param.
   *
   * A SINGLE-instrument retake carries no queue: `retakeStartRoute('phq-9')`
   * goes straight to the stepper. Without this it fell to `returnHref` — the
   * catalog — so answering a one-instrument request landed on "Build my plan"
   * again, which is the whole complaint COS-1174 set out to fix, surviving in
   * the case the dashboard produces most often.
   *
   * `source` was previously decorative; nothing read it. This is the one thing
   * it is now good for: it says the run began as a retake, which is exactly
   * what decides whether the plan or the catalog is the right ending.
   */
  source?: string | null
}): string {
  const { queueParam, instrumentId, returnHref, planHref, source } = args
  const fromRetake = source === 'retake-request'
  const queue = decodeRetakeQueue(queueParam)
  if (queue.length === 0) return fromRetake ? planHref : returnHref

  const remaining = queue.filter((id) => id !== instrumentId)
  if (remaining.length === 0) return planHref

  const next = encodeURIComponent(remaining[0])
  const rest = encodeURIComponent(encodeRetakeQueue(remaining))
  return `/Home/assessment-stepper?instrumentId=${next}&source=retake-request&queue=${rest}`
}

/**
 * COS-1181 — the catalog's instrument ORDER, lifted so it is not the catalog's
 * private property any more.
 *
 * A backstop, not the primary sort: the backend returns an AI-recommended order
 * per patient and that leads. This covers ids the recommendation left out (an
 * agency addition, say) so a patient still meets everything their plan asks for.
 */
export const INSTRUMENT_ORDER: readonly string[] = [
  'wellbeing-5',
  'phq-2',
  'phq-9',
  'gad-7',
  'sleep-4',
  'pain-4',
  'loneliness-3',
  'alcohol-3',
  'physical-function-4',
  'adl',
  'iadl',
  'falls-12',
  'nutrition-5',
  'cognition-8',
  // Wave 2 — after the core screeners so the AI ordering still leads with
  // mood/anxiety/wellbeing.
  'pss-4',
  'du-resilience-13',
  'fica',
  'hope',
  'ohio-leisure-interest',
]

/**
 * COS-1181 — which instruments this patient can actually be asked, in order.
 *
 * ─── WHY THIS IS HERE AND NOT IN THE CATALOG ──────────────────────────
 *
 * Vishal, 2026-09-30, for the third time: "if I click on the start now it is
 * taking me to health check-ins ... why the hell I have to go to the Health
 * check-in screen again. Why can't I start the assessment directly? I told you
 * multiple times."
 *
 * He is right, and the reason it kept happening is a decision I made twice: a
 * `domain:*` or `all-assessments` request routed to the CATALOG because "only
 * the catalog knows which instruments the patient is assigned". That was true
 * only because this function lived inside the catalog component. It needs three
 * react-query results, all on shared keys — nothing about it is the catalog's
 * to own.
 *
 * Lifting it means the inbox card can resolve the queue itself and deep-link
 * straight into the first check-in, for EVERY scope kind, with no picker in
 * between.
 *
 * ─── THE RULES, IN ONE PLACE ──────────────────────────────────────────
 *
 * 1. ASSIGNED ONLY. `assignedIds` is the patient's plan battery (COS-828).
 *    Offering the whole library was the bug that scoping fixed.
 * 2. AI ORDER FIRST, then INSTRUMENT_ORDER as a backstop for ids the
 *    recommendation omitted.
 * 3. PHQ-9 obeys the PHQ-2 skip rule.
 *
 * `assignmentsKnown === false` returns EMPTY, not everything: offering the full
 * library for a beat and then removing most of it reads as a glitch, and here it
 * would mean auto-advancing someone into an instrument they were never assigned.
 */
export function orderAssignedInstruments(args: {
  all: readonly QueueInstrument[]
  assignedIds: ReadonlySet<string>
  assignmentsKnown: boolean
  phq9Eligible: boolean
}): QueueInstrument[] {
  const { all, assignedIds, assignmentsKnown, phq9Eligible } = args
  if (!assignmentsKnown) return []
  const assigned = all.filter((it) => assignedIds.has(it.instrumentId))
  const byId = new Map(assigned.map((it) => [it.instrumentId, it]))
  const ordered: QueueInstrument[] = []
  const seen = new Set<string>()
  const push = (it: QueueInstrument | undefined) => {
    if (!it || seen.has(it.instrumentId)) return
    if (it.instrumentId === 'phq-9' && !phq9Eligible) return
    seen.add(it.instrumentId)
    ordered.push(it)
  }
  for (const it of assigned) push(it)
  for (const id of INSTRUMENT_ORDER) push(byId.get(id))
  return ordered
}

/**
 * COS-1182 — which surface answers this request.
 *
 * Mirrors the backend's `retakeTrack` (cos-backend retake-scopes.ts). The two
 * tracks are answered on different screens and can be outstanding at the same
 * time, so a gate must only ever count its OWN track — otherwise a health-status
 * ask blocks the care plan, and an assessment ask blocks the health summary.
 */
export type RetakeTrackName = 'assessment' | 'health-status-intake'

export function retakeTrackOf(instrumentKey: string | undefined | null): RetakeTrackName {
  const key = String(instrumentKey ?? '').trim()
  // The same alias-tolerance the backend applies before persisting.
  const normalised = key.toLowerCase().replace(/[\s_]+/g, '-')
  return normalised === 'full-intake' || normalised === 'fullintake'
    ? 'health-status-intake'
    : 'assessment'
}
