/**
 * Stub — WatermelonDB removed. Doctor local storage is no longer supported.
 * TODO: replace with API-backed doctor/provider data via backend endpoints.
 */
import { useCallback, useState } from 'react';

export interface DoctorData {
  id: string;
  name: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  photoUrl?: string;
  providerId?: string;
  clinicId?: string;
  clinicName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useDoctor(_providerId: string) {
  const [doctor] = useState<DoctorData | null>(null);
  const [isLoading] = useState(false);
  const [error] = useState<Error | null>(null);

  const updateDoctor = useCallback(async (_updates: Partial<DoctorData>) => {
    // no-op stub
  }, [])

  const pickImage = useCallback(async () => {
    // no-op stub
  }, [])

  const refresh = useCallback(async () => {
    // no-op stub
  }, [])

  return { doctor, isLoading, error, updateDoctor, pickImage, refresh }
}
