import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface HealthSummary {
  overview: string;
  conditions: string;
  medications: string;
  recentLabs: string;
  recommendations: string;
  generatedAt: string;
  /**
   * COS-855 — a rebuild is in flight, so this content is about to be replaced.
   *
   * Optional: the field is additive on the backend, and a bundle running
   * against an older API simply never sees it and behaves as before.
   */
  rebuilding?: boolean;
}

async function fetchHealthSummary(): Promise<HealthSummary> {
  const res = await apiClient.get<{ success: boolean; data: HealthSummary }>(
    '/v1/patients/me/health-summary',
    { timeout: 90000 }, // 90s — AI summary generation can take time
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
    /*
     * COS-855 — poll only while a rebuild is in flight.
     *
     * A summary rebuild is 5.5-9.5s, so 5s picks the new content up on the
     * first or second tick and the "updating" strip disappears on its own
     * rather than waiting for the 10-minute staleTime or a manual pull.
     *
     * Returning false the rest of the time matters: this hook is mounted on
     * the Plan screen, and an unconditional interval would poll an endpoint
     * that can cost a Bedrock call for the entire time the screen is open.
     * The backend's pending marker carries a 15-minute TTL, so this cannot
     * poll forever even if a rebuild is lost.
     */
    refetchInterval: (query) => (query.state.data?.rebuilding === true ? 5000 : false),
  });
}
