/**
 * COS-1181 — resolve a pending retake into the ordered check-ins it still owes.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────
 *
 * Vishal, 2026-09-30, for the third time: "if I click on the start now it is
 * taking me to health check-ins ... why the hell I have to go to the Health
 * check-in screen again. Why can't I start the assessment directly? I told you
 * multiple times. When I click on start, assessments should start one by one."
 *
 * He is right, and the cause was a decision I defended twice. A `domain:*` or
 * `all-assessments` request routed to the CATALOG because "only the catalog
 * knows which instruments the patient is assigned" — which was true only
 * because the resolution logic lived inside the catalog component. It is three
 * react-query results on SHARED keys plus a pure ordering function. Nothing
 * about it belongs to the catalog.
 *
 * With this hook the inbox card resolves the queue itself and deep-links
 * straight into the first check-in, for EVERY scope kind. No picker, ever.
 *
 * ─── COST ─────────────────────────────────────────────────────────────
 *
 * Three queries, all on keys the app already uses: ['instruments-recommended'],
 * ['assessments'] and the plan-assignments key. On Home and the plan tab they
 * are typically already warm, so this adds no network in the common case. Same
 * staleTimes as the catalog, deliberately — two surfaces disagreeing about how
 * fresh this data is would show two different queues.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  fetchInstruments,
  fetchRecommendedInstruments,
} from '@/services/api/instruments'
import { fetchAssessments } from '@/services/api/assessments'
import { useHealthPlanAssignments } from '@/hooks/use-health-plan-assignments'
import {
  buildRetakeQueue,
  isPhq9Eligible,
  orderAssignedInstruments,
  satisfiedSince,
  parseRetakeScopeKey,
  type QueueInstrument,
} from '@/lib/retake-queue'

export interface RetakeQueueResult {
  /** Ordered instrument ids still owed. Empty when nothing is owed. */
  ids: string[]
  /**
   * False while any input is still loading. Callers MUST NOT treat an empty
   * queue as "nothing to do" until this is true, or a tap during load silently
   * falls back to the picker.
   *
   * COS-1185: also true once the inputs have ERRORED. A button that waits
   * forever on a failed query is a dead button, which is the same "nothing
   * happens" this whole change set has been chasing. `resolved` is what
   * distinguishes the two.
   */
  ready: boolean
  /**
   * COS-1185 — true only when the queue was actually COMPUTED from loaded data.
   *
   * `ready && !resolved` means "we gave up". An empty queue then means nothing,
   * so the caller must fall back rather than conclude the request is satisfied.
   */
  resolved: boolean
}

const EMPTY: RetakeQueueResult = { ids: [], ready: false, resolved: false }

/**
 * @param instrumentKey the pending request's key, or null when there is none.
 *   A single-instrument key parses to no scope and returns an empty queue —
 *   there is nothing to walk, and `retakeStartRoute` already opens it directly.
 */
export function useRetakeQueue(
  request: { instrumentKey: string; createdAt?: string } | null,
): RetakeQueueResult {
  const instrumentKey = request?.instrumentKey ?? null
  /*
   * COS-1184 — the watermark. Only completions at or after the request was
   * raised satisfy it.
   */
  const since = request?.createdAt
  const scope = useMemo(
    () => (instrumentKey ? parseRetakeScopeKey(instrumentKey) : null),
    [instrumentKey],
  )
  // A scope is the only thing worth resolving. `enabled` keeps a
  // single-instrument or full-intake request from paying for three queries.
  const enabled = scope !== null

  const instrumentsQuery = useQuery({
    queryKey: ['instruments-recommended'],
    queryFn: async () => {
      try {
        return await fetchRecommendedInstruments()
      } catch {
        const fallback = await fetchInstruments()
        return { instruments: fallback, rationale: {}, cached: false }
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  })
  const assessmentsQuery = useQuery({
    queryKey: ['assessments'],
    queryFn: fetchAssessments,
    staleTime: 30 * 1000,
    enabled,
  })
  const assignmentsQuery = useHealthPlanAssignments()

  return useMemo<RetakeQueueResult>(() => {
    if (!scope) return { ids: [], ready: true, resolved: true }

    /*
     * COS-1185 — give up rather than hang.
     *
     * React Query retries before it errors, so this is a persistent failure. The
     * caller falls back to retakeStartRoute on `ready && !resolved`: a worse
     * destination than the walk, but the tap does SOMETHING, which a disabled
     * button never does.
     */
    if (instrumentsQuery.isError || assessmentsQuery.isError || assignmentsQuery.isError) {
      return { ids: [], ready: true, resolved: false }
    }

    const assignmentsKnown = assignmentsQuery.data !== undefined
    if (!instrumentsQuery.data || !assessmentsQuery.data || !assignmentsKnown) {
      return EMPTY
    }

    /*
     * COS-1184 — SATISFIED FOR THIS REQUEST, not ever-completed.
     *
     * This is the bug that survived COS-1181. A retake is raised precisely
     * against someone WITH history, so ever-completed emptied the queue for
     * exactly the patients the request is for, the card fell through to its
     * catalog fallback, and they landed on "1 of 1 completed / Build my plan".
     *
     * Measured on dev before fixing: the pending all-assessments request was
     * created 11:50:56 and ALL TWELVE of the patient's completions predate it.
     * Every one was filtered out; the queue was empty every time.
     *
     * Matches completeSatisfiedScopes on the backend, which has always used the
     * watermark — so the walk now ends exactly when the request clears.
     */
    const completedIds = satisfiedSince(assessmentsQuery.data, since)

    // PHQ-9 eligibility reads the LATEST phq-2 regardless of the watermark: it
    // is a clinical skip rule about the patient, not about this request.
    let phq2Responses: Record<string, unknown> | undefined
    let phq2At = ''
    for (const r of assessmentsQuery.data) {
      if (r.instrumentId !== 'phq-2') continue
      const at = String(r.completedAt ?? '')
      if (at >= phq2At) {
        phq2At = at
        phq2Responses = r.responses as Record<string, unknown> | undefined
      }
    }
    const phq9Eligible = isPhq9Eligible(phq2Responses)

    const all = (instrumentsQuery.data.instruments ?? []) as unknown as QueueInstrument[]

    /*
     * COS-1191 — a `set:` is NOT narrowed by the assignment.
     *
     * The sweeper built that key from what was DUE FOR THIS PATIENT, so it is
     * already patient-scoped. Narrowing it again against
     * `assignedInstrumentIds` is a second filter on an already-filtered list —
     * and when the two have drifted it removes every member.
     *
     * That is exactly what stranded Vishal: his pending
     * `set:cognition-8,dsq-nci,fas` met an assigned list still reading
     * ['phq-2','wellbeing','goals'], so all three members were filtered out,
     * the queue came back EMPTY, and "Start now" pushed him to the screen he
     * was already on — a silent no-op.
     *
     * The BACKEND already makes this exact carve-out, with this exact
     * reasoning, in scopeMemberIds. The app did not, so the two disagreed
     * about what a set means — the mirror image of the ever-completed-vs-
     * watermark split in COS-1184.
     */
    const ordered =
      scope.kind === 'set'
        ? all
        : orderAssignedInstruments({
            all,
            assignedIds: new Set(assignmentsQuery.data.assignedInstrumentIds ?? []),
            assignmentsKnown,
            phq9Eligible,
          })

    return {
      ids: buildRetakeQueue({ scope, instruments: ordered, completedIds, phq9Eligible }),
      ready: true,
      resolved: true,
    }
  }, [
    scope,
    since,
    instrumentsQuery.data,
    instrumentsQuery.isError,
    assessmentsQuery.data,
    assessmentsQuery.isError,
    assignmentsQuery.data,
    assignmentsQuery.isError,
  ])
}
