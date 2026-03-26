import { apiClient } from '@/lib/api-client';

export interface DataShare {
  patientId: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  status: 'active' | 'revoked';
  grantedAt: string;
  revokedAt?: string;
}

/**
 * Fetch active data shares for the current patient.
 */
export async function fetchDataShares(): Promise<DataShare[]> {
  const { data } = await apiClient.get('/v1/patients/me/data-sharing');
  return data.data?.shares ?? [];
}

/**
 * Grant data sharing access to a provider.
 * Triggers an email notification to the provider.
 */
export async function grantDataShare(
  providerId: string,
  providerName: string,
  providerEmail: string,
  patientName: string,
): Promise<DataShare> {
  const { data } = await apiClient.post('/v1/patients/me/data-sharing/grant', {
    providerId,
    providerName,
    providerEmail,
    patientName,
  });
  return data.data?.share;
}

/**
 * Revoke data sharing access from a provider.
 */
export async function revokeDataShare(providerId: string): Promise<void> {
  await apiClient.post('/v1/patients/me/data-sharing/revoke', { providerId });
}
