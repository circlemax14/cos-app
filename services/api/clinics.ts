import { apiClient } from '@/lib/api-client';
import type { Clinic, ClinicStatus } from './types';

interface OrgExtension {
  url: string;
  valueString?: string;
}

interface OrgWire {
  id: string;
  name?: string;
  telecom?: Array<{ system?: string; value?: string }>;
  address?: Array<{ line?: string[]; city?: string; state?: string; postalCode?: string }>;
  extension?: OrgExtension[];
}

const VALID_STATUSES: ClinicStatus[] = ['active', 'syncing', 'failed', 'pending'];

function findExtension(extensions: OrgExtension[] | undefined, url: string): string | undefined {
  return extensions?.find((e) => e.url === url)?.valueString;
}

function parseStatus(value: string | undefined): ClinicStatus | undefined {
  if (!value) return undefined;
  return VALID_STATUSES.includes(value as ClinicStatus) ? (value as ClinicStatus) : undefined;
}

export async function fetchConnectedClinics(): Promise<Clinic[]> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: OrgWire[];
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
        logoUrl: findExtension(org.extension, 'logoUrl'),
        platformType: findExtension(org.extension, 'platformType'),
        status: parseStatus(findExtension(org.extension, 'status')),
        lastSyncAt: findExtension(org.extension, 'lastSyncAt'),
      };
    });
  } catch {
    return [];
  }
}
