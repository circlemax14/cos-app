import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook to fetch and manage medications.
 * Previously backed by WatermelonDB with real-time observables.
 * Stubbed until full API-backed React Query integration is complete.
 * TODO: replace stub with useQuery calls against the medications API endpoint.
 */
export function useMedications(_filters?: {
  isActive?: boolean;
  patientId?: string;
}) {
  const queryClient = useQueryClient();

  const createMedication = async (_medicationData: {
    clinicId?: string;
    patientId?: string;
    name: string;
    dosage: string;
    frequency: string;
    purpose?: string;
    startDate?: string;
    endDate?: string;
    isActive: boolean;
  }) => {
    // TODO: POST to medications API endpoint
    queryClient.invalidateQueries({ queryKey: ['medications'] });
  };

  const updateMedication = async (_updates: {
    id: string;
    name?: string;
    dosage?: string;
    frequency?: string;
    purpose?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
  }) => {
    // TODO: PATCH to medications API endpoint
    queryClient.invalidateQueries({ queryKey: ['medications'] });
  };

  const deleteMedication = async (_id: string) => {
    // TODO: DELETE to medications API endpoint
    queryClient.invalidateQueries({ queryKey: ['medications'] });
  };

  return {
    medications: [],
    isLoading: false,
    createMedication,
    updateMedication,
    deleteMedication,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  };
}
