import { apiClient } from '@/lib/api-client';
import type { Clinic } from './types';

export async function fetchConnectedClinics(): Promise<Clinic[]> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: Array<{
        id: string;
        name?: string;
        telecom?: Array<{ system?: string; value?: string }>;
        address?: Array<{ line?: string[]; city?: string; state?: string; postalCode?: string }>;
      }>;
    }>('/v1/patients/me/clinics');
    return res.data.data.map((org) => {
      const addr = org.address?.[0];
      return {
        id: org.id,
        name: org.name ?? 'Unknown Clinic',
        address: addr?.line?.join(', '),
        city: addr?.city,
        state: addr?.state,
        zipCode: addr?.postalCode,
        phone: org.telecom?.find((t) => t.system === 'phone')?.value,
        email: org.telecom?.find((t) => t.system === 'email')?.value,
      };
    });
  } catch {
    return [];
  }
}
