/**
 * SCRUM-640 — Habit Journal data hooks.
 *
 * React Query wrappers around the habit-journal API. Fetches are
 * gated on `useHabitJournalFlag()` so the queries never fire while
 * the backend flag is OFF (dark-launch discipline; matches
 * app/Home/nudges.tsx pattern).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useHabitJournalFlag } from './use-habit-journal-flag'
import {
  fetchHabitCatalog,
  fetchHabitCorrelation,
  fetchHabitEntriesToday,
  upsertHabitEntries,
  type HabitCatalogItem,
  type HabitCorrelationResponse,
  type HabitEntriesTodayResponse,
  type HabitEntryUpsert,
  type HabitUpsertResponse,
} from '@/services/api/habit-journal'

export const HABIT_QUERY_KEYS = {
  catalog: ['habit-catalog'] as const,
  entriesToday: ['habit-entries-today'] as const,
  correlation: (windowDays: number) => ['habit-correlation', windowDays] as const,
}

export function useHabitCatalog(enabledOverride?: boolean) {
  const flagEnabled = useHabitJournalFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<HabitCatalogItem[]>({
    queryKey: HABIT_QUERY_KEYS.catalog,
    queryFn: fetchHabitCatalog,
    enabled,
    // Catalog is small and changes infrequently — cache for 10 min.
    staleTime: 10 * 60 * 1000,
  })
}

export function useHabitEntriesToday(enabledOverride?: boolean) {
  const flagEnabled = useHabitJournalFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<HabitEntriesTodayResponse>({
    queryKey: HABIT_QUERY_KEYS.entriesToday,
    queryFn: fetchHabitEntriesToday,
    enabled,
    staleTime: 30 * 1000,
  })
}

export function useHabitCorrelation(windowDays: number = 30, enabledOverride?: boolean) {
  const flagEnabled = useHabitJournalFlag()
  const enabled = enabledOverride ?? flagEnabled
  return useQuery<HabitCorrelationResponse>({
    queryKey: HABIT_QUERY_KEYS.correlation(windowDays),
    queryFn: () => fetchHabitCorrelation(windowDays),
    enabled,
    // Correlation is a display-only rollup — 5 min is plenty.
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpsertHabitEntries() {
  const qc = useQueryClient()
  return useMutation<HabitUpsertResponse, unknown, HabitEntryUpsert[]>({
    mutationFn: (entries) => upsertHabitEntries(entries),
    onSuccess: () => {
      // Both "today" and "correlation" reflect the new write; catalog is stable.
      void qc.invalidateQueries({ queryKey: HABIT_QUERY_KEYS.entriesToday })
      void qc.invalidateQueries({ queryKey: ['habit-correlation'] })
    },
  })
}
