/**
 * useRoutines (COS-475, Phase 6.4).
 *
 * React-query wrapper around `listRoutines()` — mirrors the Phase 6.2
 * BE endpoint contract. Cache-invalidated by create/update/delete
 * mutations (call sites do their own `queryClient.invalidateQueries`).
 */

import { useQuery } from '@tanstack/react-query';

import type { BpsDomain, RoutineRow } from '@/services/api/types';
import { listRoutines } from '@/services/api/ai-health-plan';

const STALE_MS = 5 * 60 * 1000;

export function routinesQueryKey(bpsDomain?: BpsDomain): readonly unknown[] {
  return bpsDomain ? (['routines', bpsDomain] as const) : (['routines'] as const);
}

export interface UseRoutinesResult {
  routines: RoutineRow[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

export function useRoutines(bpsDomain?: BpsDomain): UseRoutinesResult {
  const query = useQuery<{ routines: RoutineRow[] }>({
    queryKey: routinesQueryKey(bpsDomain),
    queryFn: () => listRoutines(bpsDomain ? { bpsDomain } : {}),
    staleTime: STALE_MS,
  });
  return {
    routines: query.data?.routines ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}
