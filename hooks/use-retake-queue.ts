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
   */
  ready: boolean
}

const EMPTY: RetakeQueueResult = { ids: [], ready: false }

/**
 * @param instrumentKey the pending request's key, or null when there is none.
 *   A single-instrument key parses to no scope and returns an empty queue —
 *   there is nothing to walk, and `retakeStartRoute` already opens it directly.
 */
export function useRetakeQueue(instrumentKey: string | null): RetakeQueueResult {
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
    if (!scope) return { ids: [], ready: true }

    const assignmentsKnown = assignmentsQuery.data !== undefined
    if (!instrumentsQuery.data || !assessmentsQuery.data || !assignmentsKnown) {
      return EMPTY
    }

    const completedIds = new Set<string>()
    let phq2Responses: Record<string, unknown> | undefined
    for (const r of assessmentsQuery.data) {
      completedIds.add(r.instrumentId)
      if (r.instrumentId === 'phq-2') {
        phq2Responses = r.responses as Record<string, unknown> | undefined
      }
    }
    const phq9Eligible = isPhq9Eligible(phq2Responses)

    const ordered = orderAssignedInstruments({
      all: (instrumentsQuery.data.instruments ?? []) as unknown as QueueInstrument[],
      assignedIds: new Set(assignmentsQuery.data.assignedInstrumentIds ?? []),
      assignmentsKnown,
      phq9Eligible,
    })

    return {
      ids: buildRetakeQueue({ scope, instruments: ordered, completedIds, phq9Eligible }),
      ready: true,
    }
  }, [scope, instrumentsQuery.data, assessmentsQuery.data, assignmentsQuery.data])
}
