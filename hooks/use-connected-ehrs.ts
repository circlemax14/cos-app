import { useCallback, useEffect, useState } from 'react';
import { fetchConnectedClinics } from '@/services/api/clinics';
import { getNonEhrClinics } from '@/services/non-ehr-processor';
import { hasStoredSession } from '@/lib/auth-tokens';
import type { ClinicStatus } from '@/services/api/types';

export interface ConnectedHospital {
  id: string;
  name: string;
  provider: string;
  connectedDate: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  // Optional metadata for the redesigned Connected EHRs hero card.
  logoUrl?: string;
  platformType?: string;
  status?: ClinicStatus;
  lastSyncAt?: string;
}

export function useConnectedEhrs() {
  const [connectedHospitals, setConnectedHospitals] = useState<ConnectedHospital[]>([]);
  const [isLoadingClinics, setIsLoadingClinics] = useState(false);

  const loadClinics = useCallback(async () => {
    // Skip API calls if user is not authenticated (e.g., on sign-in screen)
    const hasSession = await hasStoredSession();
    if (!hasSession) return;

    setIsLoadingClinics(true);
    try {
      const clinics = await fetchConnectedClinics();
      const hospitals: ConnectedHospital[] = clinics.map((clinic) => ({
        id: clinic.id,
        name: clinic.name,
        provider: 'EHR',
        connectedDate: new Date().toISOString().split('T')[0],
        address: clinic.address,
        city: clinic.city,
        state: clinic.state,
        zipCode: clinic.zipCode,
        phone: clinic.phone,
        email: clinic.email,
        logoUrl: clinic.logoUrl,
        platformType: clinic.platformType,
        status: clinic.status,
        lastSyncAt: clinic.lastSyncAt,
      }));

      let integrativeHospitals: ConnectedHospital[] = [];
      try {
        const nonEhrClinics = await getNonEhrClinics();
        integrativeHospitals = nonEhrClinics.map((c) => ({
          id: c.id,
          name: c.name,
          provider: 'Integrative',
          connectedDate: c.createdAt?.split('T')[0] ?? new Date().toISOString().split('T')[0],
          address: c.address,
          phone: c.phone,
          email: c.email,
        }));
      } catch {
        // Non-EHR clinics are optional
      }

      setConnectedHospitals([...hospitals, ...integrativeHospitals]);
    } catch {
      setConnectedHospitals([]);
    } finally {
      setIsLoadingClinics(false);
    }
  }, []);

  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  return { connectedHospitals, isLoadingClinics, refreshConnectedEhrs: loadClinics };
}
