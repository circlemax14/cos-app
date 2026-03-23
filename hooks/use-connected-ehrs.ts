import { useCallback, useEffect, useState } from 'react';
import { ProcessedClinic } from '@/services/fasten-health-processor';
import { getNonEhrClinics } from '@/services/non-ehr-processor';

export interface ConnectedHospital {
  id: string;
  name: string;
  provider: string;
  connectedDate: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
}

/**
 * Hook to fetch clinics for the connected EHRs view.
 * WatermelonDB layer removed — data now comes from file-based processing
 * (fasten-health-processor) and the non-EHR integrative clinics endpoint.
 * TODO: replace file-based fallback with a React Query call to the clinics API endpoint.
 */
export function useConnectedEhrs() {
  const [connectedHospitals, setConnectedHospitals] = useState<ConnectedHospital[]>([]);
  const [isLoadingClinics, setIsLoadingClinics] = useState(false);

  const loadClinics = useCallback(async () => {
    setIsLoadingClinics(true);
    try {
      let processedClinics: ProcessedClinic[] = [];

      // Load from file processing (temporary fallback until clinics API endpoint is ready)
      // TODO: replace with useQuery call to the clinics API endpoint
      try {
        const { processFastenHealthDataFromFile } = await import('@/services/fasten-health-processor');
        const processedData = await processFastenHealthDataFromFile();
        processedClinics = processedData.clinics;
      } catch (fileError) {
        console.error('Error loading clinics from file:', fileError);
      }

      const providerNames = ['EPIC', 'Cerner', 'Allscripts', 'athenahealth', 'NextGen'];

      const hospitals: ConnectedHospital[] = processedClinics.map((clinic: ProcessedClinic, index) => {
        const connectionDate = new Date();
        connectionDate.setMonth(connectionDate.getMonth() - (index * 2));

        const provider = providerNames[index % providerNames.length];

        const addressParts: string[] = [];
        if (clinic.address?.line) {
          const line = Array.isArray(clinic.address.line)
            ? clinic.address.line.join(', ')
            : clinic.address.line;
          if (line) addressParts.push(line);
        }
        if (clinic.address?.city) addressParts.push(clinic.address.city);
        if (clinic.address?.state) addressParts.push(clinic.address.state);
        if (clinic.address?.zip) addressParts.push(clinic.address.zip);

        return {
          id: clinic.id,
          name: clinic.name,
          provider,
          connectedDate: connectionDate.toISOString().split('T')[0],
          address: addressParts.join(', ') || undefined,
          city: clinic.address?.city || undefined,
          state: clinic.address?.state || undefined,
          phone: clinic.phone || undefined,
          email: clinic.email || undefined,
        };
      });

      // Load integrative (non-EHR) clinics and merge in a single setState
      let integrativeHospitals: ConnectedHospital[] = [];
      try {
        const nonEhrClinics = await getNonEhrClinics();
        integrativeHospitals = nonEhrClinics.map(clinic => ({
          id: clinic.id,
          name: clinic.name,
          provider: 'Integrative',
          connectedDate: clinic.createdAt?.split('T')[0] ?? new Date().toISOString().split('T')[0],
          address: clinic.address,
          phone: clinic.phone,
          email: clinic.email,
        }));
      } catch (nonEhrError) {
        console.warn('Failed to load Integrative clinics:', nonEhrError);
      }

      setConnectedHospitals([...hospitals, ...integrativeHospitals]);
    } catch (error) {
      console.error('Error loading clinics:', error);
      setConnectedHospitals([]);
    } finally {
      setIsLoadingClinics(false);
    }
  }, []);

  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  return {
    connectedHospitals,
    isLoadingClinics,
    refreshConnectedEhrs: loadClinics,
  };
}
