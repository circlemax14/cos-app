import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface HealthSummary {
  overview: string;
  conditions: string;
  medications: string;
  recentLabs: string;
  recommendations: string;
  generatedAt: string;
}

async function fetchHealthSummary(): Promise<HealthSummary> {
  const res = await apiClient.get<{ success: boolean; data: HealthSummary }>(
    '/v1/patients/me/health-summary',
  );
  return res.data.data;
}

/**
 * Fetch an AI-generated health summary for the current user.
 * Uses React Query for caching (stale after 10 minutes).
 */
export function useHealthSummary(enabled = true) {
  return useQuery({
    queryKey: ['health-summary'],
    queryFn: fetchHealthSummary,
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}
