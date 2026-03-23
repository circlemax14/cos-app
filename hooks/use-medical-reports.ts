/**
 * Hook to fetch medical reports — no-op until wired to backend API
 */
export function useMedicalReports(_filters?: {
  category?: string;
  patientId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return {
    reports: [] as any[],
    isLoading: false,
    createMedicalReport: async (_data: any) => { /* TODO: wire to API */ },
    updateMedicalReport: async (_data: any) => { /* TODO: wire to API */ },
    deleteMedicalReport: async (_id: string) => { /* TODO: wire to API */ },
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  };
}
