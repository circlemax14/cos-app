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
 * Hook to fetch clinics for connected EHRs view
 * Loads from file processing and non-EHR sources (no local database)
 */
export function useConnectedEhrs() {
  const [connectedHospitals, setConnectedHospitals] = useState<ConnectedHospital[]>([]);
  const [isLoadingClinics, setIsLoadingClinics] = useState(false);

  const loadClinics = useCallback(async () => {
    setIsLoadingClinics(true);
    try {
      console.log('Starting to load clinics...');

      let processedClinics: ProcessedClinic[] = [];
      try {
        const { processFastenHealthDataFromFile } = await import('@/services/fasten-health-processor');
        const processedData = await processFastenHealthDataFromFile();
        processedClinics = processedData.clinics;
        console.log(`Processed data: ${processedClinics.length} clinics found`);
      } catch (fileError) {
        console.error('Error loading from file:', fileError);
      }

      // Transform clinics to ConnectedHospital format
      const hospitals: ConnectedHospital[] = processedClinics.map((clinic: ProcessedClinic, index) => {
        const connectionDate = new Date();
        connectionDate.setMonth(connectionDate.getMonth() - (index * 2));

        const providerNames = ['EPIC', 'Cerner', 'Allscripts', 'athenahealth', 'NextGen'];
        const provider = providerNames[index % providerNames.length];

        const addressParts: string[] = [];
        if (clinic.address?.line) {
          const line = Array.isArray(clinic.address.line)
            ? clinic.address.line.join(', ')
            : clinic.address.line;
          if (line) addressParts.push(line);
        }
        if (clinic.address?.city) {
          addressParts.push(clinic.address.city);
        }
        if (clinic.address?.state) {
          addressParts.push(clinic.address.state);
        }
        if (clinic.address?.zip) {
          addressParts.push(clinic.address.zip);
        }

        const fullAddress = addressParts.join(', ');

        return {
          id: clinic.id,
          name: clinic.name,
          provider: provider,
          connectedDate: connectionDate.toISOString().split('T')[0],
          address: fullAddress || undefined,
          city: clinic.address?.city || undefined,
          state: clinic.address?.state || undefined,
          phone: clinic.phone || undefined,
          email: clinic.email || undefined,
        };
      });

      // Load integrative (non-EHR) clinics
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
        console.log(`Found ${nonEhrClinics.length} Integrative clinic(s)`);
      } catch (nonEhrError) {
        console.warn('Failed to load Integrative clinics:', nonEhrError);
      }

      const combined = [...hospitals, ...integrativeHospitals];
      setConnectedHospitals(combined);
      console.log(`Total clinics set: ${combined.length} (${hospitals.length} EHR + ${integrativeHospitals.length} Integrative)`);
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
