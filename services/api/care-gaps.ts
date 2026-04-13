import { apiClient } from '../../lib/api-client';
import { CareGap, CareGapExplanation } from './types';

export async function fetchCareGaps(
  filters?: { status?: string; priority?: string },
): Promise<CareGap[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  const query = params.toString();
  const url = `/v1/patients/me/care-gaps${query ? `?${query}` : ''}`;
  const res = await apiClient.get(url);
  return res.data?.data?.careGaps || [];
}

export async function updateCareGapStatus(
  id: string,
  status: 'open' | 'addressed' | 'deferred' | 'resolved',
  notes?: string,
  deferredReason?: string,
  deferredUntil?: string,
): Promise<void> {
  await apiClient.patch(`/v1/patients/me/care-gaps/${id}`, {
    status,
    notes,
    deferredReason,
    deferredUntil,
  });
}

export async function fetchCareGapExplanation(id: string): Promise<CareGapExplanation> {
  const res = await apiClient.get(`/v1/patients/me/care-gaps/${id}/explain`);
  return res.data?.data;
}
