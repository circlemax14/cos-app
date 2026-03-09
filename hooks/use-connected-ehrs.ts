import { useDatabaseSafe, useDatabaseReady } from '@/database/DatabaseProvider';
import { useCallback, useEffect, useState } from 'react';
import { Clinic } from '@/database/models';
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
 * Hook to fetch clinics from database for connected EHRs view
 * Data comes from API and is synced to WatermelonDB daily
 * Returns empty array if database is not ready or no data available
 */
export function useConnectedEhrs() {
  const isDatabaseReady = useDatabaseReady();
  const database = useDatabaseSafe(); // Safe version that returns null if not ready
  const [connectedHospitals, setConnectedHospitals] = useState<ConnectedHospital[]>([]);
  const [isLoadingClinics, setIsLoadingClinics] = useState(false);

  const loadClinics = useCallback(async () => {
    setIsLoadingClinics(true);
    try {
      console.log('🔄 Starting to load clinics...');
      console.log(`📊 Database ready: ${isDatabaseReady}, Database available: ${!!database}`);

      let clinics: Clinic[] = [];

      // Try to load from database first (if database is ready)
      if (isDatabaseReady && database) {
        try {
          clinics = await database.get<Clinic>('clinics').query().fetch();
          console.log(`📊 Found ${clinics.length} clinics in database`);
        } catch (dbError) {
          console.warn('⚠️ Database query failed:', dbError);
        }
      } else {
        console.log('📊 Database not ready or not available, will use file fallback');
      }

      // Temporary fallback: If database is empty or not ready, load from file processing
      // TODO: Remove this fallback once API sync is implemented
      let processedClinics: ProcessedClinic[] = [];
      if (clinics.length === 0) {
        console.log('📂 Database empty or not ready, loading clinics from file processing (temporary fallback)...');
        try {
          const { processFastenHealthDataFromFile } = await import('@/services/fasten-health-processor');
          console.log('📦 Imported processFastenHealthDataFromFile, processing data...');
          const processedData = await processFastenHealthDataFromFile();
          console.log(`✅ Processed data: ${processedData.clinics.length} clinics found`);
          processedClinics = processedData.clinics;

          if (processedClinics.length === 0) {
            console.warn('⚠️ No clinics found in processed data!');
          } else {
            console.log(`📋 Clinic names from file: ${processedClinics.map(c => c.name).join(', ')}`);
          }

          // Try to sync to database for future use (if database is ready)
          if (isDatabaseReady && database) {
            try {
              const { syncClinicsAndLabsToDatabase } = await import('@/services/clinic-lab-sync');
              await syncClinicsAndLabsToDatabase(processedData.clinics, processedData.labs, database);
              console.log('✅ Synced clinics to database for future use');
            } catch (syncError) {
              console.warn('⚠️ Failed to sync to database:', syncError);
            }
          }
        } catch (fileError) {
          console.error('❌ Error loading from file:', fileError);
          console.error('❌ Error stack:', fileError instanceof Error ? fileError.stack : 'No stack trace');
        }
      }

      // Transform clinics to ConnectedHospital format
      // Use database clinics if available, otherwise use processed clinics
      const clinicsToUse = clinics.length > 0 ? clinics : processedClinics;

      console.log(`🔄 Transforming ${clinicsToUse.length} clinics to ConnectedHospital format...`);

      if (clinicsToUse.length === 0) {
        console.warn('⚠️ No clinics available to transform!');
        console.warn(`   - Database clinics: ${clinics.length}`);
        console.warn(`   - Processed clinics: ${processedClinics.length}`);
      }

      const hospitals: ConnectedHospital[] = clinicsToUse.map((clinic: Clinic | ProcessedClinic, index) => {
        const connectionDate = new Date();
        connectionDate.setMonth(connectionDate.getMonth() - (index * 2));

        const providerNames = ['EPIC', 'Cerner', 'Allscripts', 'athenahealth', 'NextGen'];
        const provider = providerNames[index % providerNames.length];

        // Handle both database Clinic model and ProcessedClinic format
        const isDatabaseModel = 'addressLine' in clinic;
        const addressParts = [];

        if (isDatabaseModel) {
          // Database Clinic model
          const dbClinic = clinic as Clinic;
          if (dbClinic.addressLine) {
            addressParts.push(dbClinic.addressLine);
          }
          if (dbClinic.city) {
            addressParts.push(dbClinic.city);
          }
          if (dbClinic.state) {
            addressParts.push(dbClinic.state);
          }
          if (dbClinic.zip) {
            addressParts.push(dbClinic.zip);
          }
        } else {
          // ProcessedClinic format
          const procClinic = clinic as ProcessedClinic;
          if (procClinic.address?.line) {
            const line = Array.isArray(procClinic.address.line)
              ? procClinic.address.line.join(', ')
              : procClinic.address.line;
            if (line) addressParts.push(line);
          }
          if (procClinic.address?.city) {
            addressParts.push(procClinic.address.city);
          }
          if (procClinic.address?.state) {
            addressParts.push(procClinic.address.state);
          }
          if (procClinic.address?.zip) {
            addressParts.push(procClinic.address.zip);
          }
        }

        const fullAddress = addressParts.join(', ');

        return {
          id: clinic.id,
          name: clinic.name,
          provider: provider,
          connectedDate: connectionDate.toISOString().split('T')[0],
          address: fullAddress || undefined,
          city: isDatabaseModel
            ? (clinic as Clinic).city || undefined
            : (clinic as ProcessedClinic).address?.city || undefined,
          state: isDatabaseModel
            ? (clinic as Clinic).state || undefined
            : (clinic as ProcessedClinic).address?.state || undefined,
          phone: clinic.phone || undefined,
          email: clinic.email || undefined,
        };
      });

      // ── Load integrative (non-EHR) clinics in parallel, set state ONCE ────
      // Using a single setState avoids duplicate-append bugs when loadClinics
      // fires more than once (e.g. DB becomes ready after initial mount).
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
        console.log(`📋 Found ${nonEhrClinics.length} Integrative clinic(s)`);
      } catch (nonEhrError) {
        console.warn('⚠️ Failed to load Integrative clinics:', nonEhrError);
      }

      // Single setState — no stale-prev race condition
      const combined = [...hospitals, ...integrativeHospitals];
      setConnectedHospitals(combined);
      console.log(`✅ Total clinics set: ${combined.length} (${hospitals.length} EHR + ${integrativeHospitals.length} Integrative)`);
    } catch (error) {
      console.error('Error loading clinics:', error);
      setConnectedHospitals([]);
    } finally {
      setIsLoadingClinics(false);
    }
  }, [isDatabaseReady, database]);

  // Initial load and reload when database becomes ready
  useEffect(() => {
    loadClinics();
  }, [loadClinics, isDatabaseReady]);

  return {
    connectedHospitals,
    isLoadingClinics,
    refreshConnectedEhrs: loadClinics,
  };
}
