import { useCallback, useEffect, useState } from 'react';
import { processFastenHealthDataFromFile } from '@/services/fasten-health-processor';

export interface HealthDetailsData {
  height?: string;
  weight?: string;
  bloodType?: string;
  bloodPressureSystolic?: string;
  bloodPressureDiastolic?: string;
  usesCpap: boolean;
  chronicConditions: string[];
}

export function useHealthDetails() {
  const [healthDetails, setHealthDetails] = useState<HealthDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadHealthDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load from file processing
      const processedData = await processFastenHealthDataFromFile();
      if (processedData.healthDetails) {
        setHealthDetails({
          height: processedData.healthDetails.height,
          weight: processedData.healthDetails.weight,
          bloodType: processedData.healthDetails.bloodType,
          bloodPressureSystolic: processedData.healthDetails.bloodPressureSystolic,
          bloodPressureDiastolic: processedData.healthDetails.bloodPressureDiastolic,
          usesCpap: processedData.healthDetails.usesCpap,
          chronicConditions: processedData.healthDetails.chronicConditions || [],
        });
      }
    } catch (err) {
      console.error('Error loading health details:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateHealthDetails = useCallback(async (_updates: Partial<HealthDetailsData>) => {
    // TODO: Wire to backend API
    console.warn('updateHealthDetails is a no-op until backend API is wired up');
  }, [healthDetails, loadHealthDetails]);

  useEffect(() => {
    loadHealthDetails();
  }, [loadHealthDetails]);

  return {
    healthDetails,
    isLoading,
    error,
    updateHealthDetails,
    refresh: loadHealthDetails,
  };
}
