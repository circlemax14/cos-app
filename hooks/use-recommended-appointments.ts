import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRecommendedAppointments, updateRecommendedAppointmentStatus } from '../services/api/recommended-appointments';

export function useRecommendedAppointments(filters?: { status?: string; urgency?: string }) {
  return useQuery({
    queryKey: ['recommended-appointments', filters],
    queryFn: () => fetchRecommendedAppointments(filters),
    staleTime: 30_000,
  });
}

export function useUpdateRecommendedAppointmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: 'scheduled' | 'dismissed'; reason?: string }) =>
      updateRecommendedAppointmentStatus(id, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommended-appointments'] });
    },
  });
}
