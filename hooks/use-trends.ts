import { useQuery } from '@tanstack/react-query';
import { fetchTrends, fetchTrend, fetchTrendExplanation } from '../services/api/trends';
import type { LongitudinalTrend } from '../services/api/types';

export function useTrends(category?: LongitudinalTrend['category']) {
  return useQuery({
    queryKey: ['trends', category],
    queryFn: () => fetchTrends(category),
    staleTime: 60_000,
  });
}

export function useTrend(metricCode: string | undefined) {
  return useQuery({
    queryKey: ['trend', metricCode],
    queryFn: () => fetchTrend(metricCode!),
    enabled: !!metricCode,
    staleTime: 60_000,
  });
}

export function useTrendExplanation(metricCode: string | undefined) {
  return useQuery({
    queryKey: ['trend-explanation', metricCode],
    queryFn: () => fetchTrendExplanation(metricCode!),
    enabled: !!metricCode,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
