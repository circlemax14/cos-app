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
  /*
   * COS-1059 — a failed load is NOT an empty list.
   *
   * The catch below used to `setConnectedHospitals([])`, so a timeout, a 500,
   * or the 404 this endpoint returns when a patient has no fhirPatientId all
   * rendered as "No connected clinics yet" — a confident claim about the
   * patient, made from an error.
   *
   * Ken hit exactly that: he connected successfully, saw "No connected clinics
   * yet", and reasonably concluded it had failed. He then tried twice more.
   */
  const [loadFailed, setLoadFailed] = useState(false);

  const loadClinics = useCallback(async () => {
    // Skip API calls if user is not authenticated (e.g., on sign-in screen)
    const hasSession = await hasStoredSession();
    if (!hasSession) return;

    setIsLoadingClinics(true);
    setLoadFailed(false);
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
      /*
       * Keep whatever was already on screen rather than blanking it. A patient
       * whose list vanishes on a flaky refresh thinks their clinic
       * disconnected; the caller renders `loadFailed` instead.
       */
      setLoadFailed(true);
    } finally {
      setIsLoadingClinics(false);
    }
  }, []);

  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  /*
   * COS-1059 — a connection exists but its records are still importing.
   *
   * The backend already returns one entry PER CONNECTION the moment a patient
   * authorises a portal, with status 'syncing' and a 'Connected Clinic'
   * fallback name, because the Organizations are extracted minutes later when
   * the EHI export lands. The screen had no notion of that state, so the gap
   * between "Fasten says success" and "the clinic appears" read as failure.
   */
  const isImporting = connectedHospitals.some((h) => h.status === 'syncing');

  return {
    connectedHospitals,
    isLoadingClinics,
    loadFailed,
    isImporting,
    refreshConnectedEhrs: loadClinics,
  };
}
