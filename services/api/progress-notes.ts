import { apiClient } from '@/lib/api-client';

/**
 * AI-generated narrative summarizing a provider's interactions with the
 * patient. Mirrors the cos-frontend `getProviderProgressNotes` shape so
 * web + mobile consume the same backend endpoint
 * (`GET /v1/patients/me/providers/:providerId/progress-notes`).
 *
 * Backend caches in DynamoDB for 7 days; pass `?refresh=true` to bypass
 * the cache and regenerate.
 */
export interface ProviderProgressNotes {
  providerId: string;
  narrative: string;
  generatedAt: string;
  model: string;
  fromCache: boolean;
}

export async function fetchProviderProgressNotesNarrative(
  providerId: string,
  options?: { refresh?: boolean },
): Promise<ProviderProgressNotes> {
  const path = `/v1/patients/me/providers/${encodeURIComponent(providerId)}/progress-notes`;
  const url = options?.refresh ? `${path}?refresh=true` : path;
  const res = await apiClient.get<{ success: boolean; data: ProviderProgressNotes }>(url);
  return res.data.data;
}
