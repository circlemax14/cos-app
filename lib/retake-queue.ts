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
 * Parse a request's `instrumentKey` into a scope, or null when it names a
 * single instrument (or the health-status intake, which is its own wizard and
 * never part of an assessment queue).
 */
export function parseRetakeScopeKey(key: string): RetakeScope | null {
  if (key === 'all-assessments') return { kind: 'all' }
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
  completedIds: ReadonlySet<string>
  phq9Eligible: boolean
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
  for (const it of instruments) {
    const id = it.instrumentId
    if (!id || seen.has(id)) continue
    if (completedIds.has(id)) continue
    // Visible in the catalog as a planned offering, but cannot be taken
    // (SCRUM-268). Routing into one is a dead end.
    if (it.comingSoon === true) continue
    if (id === 'phq-9' && !phq9Eligible) continue
    if (scope.kind === 'domain' && rollUpDomain(it.domain) !== scope.domain) continue
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
}): string {
  const { queueParam, instrumentId, returnHref, planHref } = args
  const queue = decodeRetakeQueue(queueParam)
  if (queue.length === 0) return returnHref

  const remaining = queue.filter((id) => id !== instrumentId)
  if (remaining.length === 0) return planHref

  const next = encodeURIComponent(remaining[0])
  const rest = encodeURIComponent(encodeRetakeQueue(remaining))
  return `/Home/assessment-stepper?instrumentId=${next}&source=retake-request&queue=${rest}`
}
