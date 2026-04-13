import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchCareGaps, updateCareGapStatus, fetchCareGapExplanation } from '../services/api/care-gaps';
import type { CareGap } from '../services/api/types';

export function useCareGaps(filters?: { status?: string; priority?: string }) {
  return useQuery({
    queryKey: ['care-gaps', filters],
    queryFn: () => fetchCareGaps(filters),
    staleTime: 30_000,
  });
}

export function useUpdateCareGapStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
      deferredReason,
      deferredUntil,
    }: {
      id: string;
      status: CareGap['status'];
      notes?: string;
      deferredReason?: string;
      deferredUntil?: string;
    }) => updateCareGapStatus(id, status, notes, deferredReason, deferredUntil),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['care-gaps'] });
    },
  });
}

export function useCareGapExplanation(id: string | undefined) {
  return useQuery({
    queryKey: ['care-gap-explanation', id],
    queryFn: () => fetchCareGapExplanation(id!),
    enabled: !!id,
    staleTime: 60_000 * 60,
    retry: 1,
  });
}
