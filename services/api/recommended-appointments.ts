import { apiClient } from '../../lib/api-client';
import { RecommendedAppointment } from './types';

export async function fetchRecommendedAppointments(
  filters?: { status?: string; urgency?: string },
): Promise<RecommendedAppointment[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.urgency) params.set('urgency', filters.urgency);
  const query = params.toString();
  const url = `/v1/patients/me/recommended-appointments${query ? `?${query}` : ''}`;
  const res = await apiClient.get(url);
  return res.data?.data?.recommendedAppointments || [];
}

export async function updateRecommendedAppointmentStatus(
  id: string,
  status: 'scheduled' | 'dismissed',
  dismissedReason?: string,
): Promise<void> {
  await apiClient.patch(`/v1/patients/me/recommended-appointments/${id}`, { status, dismissedReason });
}
