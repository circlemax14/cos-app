import { apiClient } from '@/lib/api-client';
import type { ProviderDetail } from '@/lib/provider-detail-model';

export * from '@/lib/provider-detail-model';

/**
 * COS-1013 — the provider detail endpoint the app never called.
 *
 * `GET /v1/patients/me/providers/:id/detail` has existed for some time,
 * returning a provider's conditions, procedures, reports, medications and
 * encounters from ONE request, joined to the provider BY ID.
 *
 * The screen instead made four or five separate calls and filtered each by
 * comparing display names — which is why its tabs disagreed with each other,
 * and why 3 of 76 reports and 1 of 19 encounter participants ever matched.
 *
 * Nothing here is new capability. It wires the screen to the answer the server
 * was already computing correctly.
 */
export async function fetchProviderDetail(providerId: string): Promise<ProviderDetail | null> {
  try {
    const res = await apiClient.get<{ success: boolean; data: ProviderDetail }>(
      `/v1/patients/me/providers/${encodeURIComponent(providerId)}/detail`,
    );
    return res.data.data ?? null;
  } catch (err) {
    // 403 means this provider is not the patient's to read; anything else is
    // transient. Either way the caller renders its own empty state rather than
    // a raw transport error.
    console.warn('provider detail unavailable', err);
    return null;
  }
}
