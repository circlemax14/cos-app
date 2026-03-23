/**
 * Hook to fetch medications — no-op until wired to backend API
 */
export function useMedications(_filters?: {
  isActive?: boolean;
  patientId?: string;
}) {
  return {
    medications: [] as any[],
    isLoading: false,
    createMedication: async (_data: any) => { /* TODO: wire to API */ },
    updateMedication: async (_data: any) => { /* TODO: wire to API */ },
    deleteMedication: async (_id: string) => { /* TODO: wire to API */ },
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  };
}
