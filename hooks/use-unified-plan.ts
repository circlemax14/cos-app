/**
 * useUnifiedPlan (COS-467, Phase 2 FE).
 *
 * React-query wrapper around GET /v1/plan. Two behaviours worth calling
 * out:
 *
 * 1) Feature flag off (BE returns 404 FEATURE_DISABLED) is NOT surfaced as
 *    an error. `fetchUnifiedPlan` folds that 404 into a sentinel that
 *    react-query stores as `data`, and we expose `disabled: true` +
 *    `data: null` to callers. The retry gate below also refuses to retry
 *    if the queryFn does re-throw for any reason with `code:'FEATURE_
 *    DISABLED'`. Net effect: banner + route render an inert "unavailable"
 *    state, no error banner, no telemetry noise.
 *
 * 2) refreshInFlight → 60s poll. When the BE reports it is regenerating
 *    the unified view, `refetchInterval` returns POLL_MS so the client
 *    catches up automatically; once `refreshInFlight` clears, polling
 *    stops.
 */

import { useQuery } from '@tanstack/react-query';

import {
  fetchUnifiedPlan,
  isFeatureDisabled,
  type UnifiedPlanFetchResult,
  type UnifiedPlanView,
} from '@/services/api/unified-plan';

const STALE_MS = 5 * 60 * 1000;
const POLL_MS = 60 * 1000;

export interface UseUnifiedPlanResult {
  data: UnifiedPlanView | null;
  /** True when BE returned 404 FEATURE_DISABLED — inert state, no error. */
  disabled: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  lastUpdated: string | null;
}

export function useUnifiedPlan(): UseUnifiedPlanResult {
  const query = useQuery<UnifiedPlanFetchResult>({
    queryKey: ['unified-plan'],
    queryFn: fetchUnifiedPlan,
    staleTime: STALE_MS,
    retry: (failureCount, err) => {
      const code = (err as { code?: string } | undefined)?.code;
      if (code === 'FEATURE_DISABLED') return false;
      return failureCount < 2;
    },
    refetchInterval: (q) => {
      const d = q.state.data as UnifiedPlanFetchResult | undefined;
      if (!d || isFeatureDisabled(d)) return false;
      return d.meta?.refreshInFlight ? POLL_MS : false;
    },
  });

  const disabled = isFeatureDisabled(query.data);
  const data = disabled ? null : ((query.data as UnifiedPlanView | undefined) ?? null);

  return {
    data,
    disabled,
    isLoading: query.isLoading,
    isRefetching: query.isFetching && !query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    lastUpdated: data?.meta?.generatedAt ?? null,
  };
}
