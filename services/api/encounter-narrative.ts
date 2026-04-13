import { apiClient } from '../../lib/api-client';
import { EncounterNarrative } from './types';

export async function fetchEncounterNarrative(encounterId: string): Promise<EncounterNarrative> {
  const res = await apiClient.get(`/v1/patients/me/encounters/${encounterId}/narrative`);
  return res.data?.data?.narrative;
}
