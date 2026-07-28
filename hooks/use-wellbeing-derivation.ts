/**
 * hooks/use-wellbeing-derivation.ts — CHUNK 60 (2026-07-22)
 *
 * Hoisted react-query wiring + historyById merge + deriveWellbeing() call
 * that previously lived INSIDE BpsWellbeingScoreCard. Extracted so the
 * BPS screen can compute focus ONCE at the parent level and pass the
 * value DOWN into (a) BpsWellbeingScoreCard (which drops its own
 * internal derivation when props are supplied) and (b) the new
 * BpsPlanFocusBanner + each SectionCard's `isFocus` gate — without
 * running deriveWellbeing() twice per render.
 *
 * ZERO NEW BE CALLS: the query keys used here
 * (`['assessments-trends']` and `['assessment-history', instrumentId]`)
 * are IDENTICAL to the ones BpsWellbeingScoreCard and SelfAssessmentTrends
 * already subscribe to. React Query dedupes on cache key, so mounting
 * this hook at the parent AND leaving the card's fallback branch
 * intact still incurs exactly one round-trip per instrument across the
 * whole surface.
 *
 * SCOPE: pure wiring + defensive merge. All formula logic still lives in
 * lib/wellbeing-score.ts (pure, testable) — this hook contains no
 * business rules.
 *
 * iOS 26.5 safe: no native primitives touched here; this is pure JS
 * data-flow. The consuming components own their own render safety.
 */
import React from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'

import {
  fetchAssessmentHistory,
  fetchAssessments,
  type AssessmentRecord,
} from '@/services/api/assessments'
import {
  ALL_TRACKED_INSTRUMENTS,
  deriveWellbeing,
  type WellbeingDerivation,
} from '@/lib/wellbeing-score'

export interface UseWellbeingDerivationResult {
  derivation: WellbeingDerivation
  /**
   * True while the summary query is still loading with no cached data,
   * OR any per-instrument history query is loading with no cached data
   * AND the composite has not yet resolved. Mirrors the loading gate
   * BpsWellbeingScoreCard uses internally so a parent consumer can make
   * the same cold-mount / warm-mount call the card would.
   */
  isLoading: boolean
  /**
   * True when the summary query has resolved (or is cached) AND the
   * composite is still undefined AND we're not in a loading state — i.e.
   * the patient has no assessments backing the score at all. Callers
   * should suppress the wellbeing card / banner in this state.
   */
  isEmpty: boolean
}

/**
 * One-call hook returning everything the wellbeing card and its
 * downstream consumers (BpsPlanFocusBanner, SectionCard isFocus)
 * need. Keeping the merge inside a single useMemo (rather than
 * duplicating it in every consumer) is the "compute once" guarantee
 * the chunk 60 brief requires.
 */
export function useWellbeingDerivation(): UseWellbeingDerivationResult {
  const summaryQuery = useQuery({
    queryKey: ['assessments-trends'],
    queryFn: fetchAssessments,
    staleTime: 60 * 1000,
  })

  const historyQueries = useQueries({
    queries: ALL_TRACKED_INSTRUMENTS.map((id) => ({
      queryKey: ['assessment-history', id] as const,
      queryFn: () => fetchAssessmentHistory(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  // Build historyById using the SAME defensive-merge shape the card
  // used pre-hoist (BpsWellbeingScoreCard.tsx CHUNK 59). Byte-for-byte
  // identical logic so the hoist is a pure refactor — the composite,
  // trend, and focus values are unchanged when this hook is the
  // derivation source.
  const historyById = React.useMemo(() => {
    const map = new Map<string, AssessmentRecord[]>()
    ALL_TRACKED_INSTRUMENTS.forEach((id, i) => {
      const data = historyQueries[i]?.data ?? []
      const sorted = [...data]
        .filter((rec) => !!rec?.completedAt)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      map.set(String(id), sorted)
    })
    const summary = summaryQuery.data ?? []
    summary
      .filter((r) => !!r.completedAt)
      .forEach((r) => {
        const key = String(r.instrumentId)
        const existing = map.get(key) ?? []
        const newest = existing[0]?.completedAt ?? ''
        if ((r.completedAt ?? '') > newest) {
          map.set(key, [r, ...existing])
        }
      })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQueries.map((q) => q.dataUpdatedAt).join('|'), summaryQuery.data])

  const derivation = React.useMemo(() => deriveWellbeing(historyById), [historyById])

  const anyHistoryLoading = historyQueries.some((q) => q.isLoading && !q.data)
  const isLoading =
    (summaryQuery.isLoading && !summaryQuery.data) ||
    (anyHistoryLoading && typeof derivation.composite !== 'number')

  const summaryReady = !summaryQuery.isLoading || !!summaryQuery.data
  const isEmpty = summaryReady && typeof derivation.composite !== 'number' && !isLoading

  return { derivation, isLoading, isEmpty }
}
