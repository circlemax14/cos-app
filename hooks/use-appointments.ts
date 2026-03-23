/**
 * Hook to fetch appointments — no-op until wired to backend API
 */
export function useAppointments(_filters?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return {
    appointments: [] as any[],
    isLoading: false,
    createAppointment: async (_data: any) => { /* TODO: wire to API */ },
    updateAppointment: async (_data: any) => { /* TODO: wire to API */ },
    deleteAppointment: async (_id: string) => { /* TODO: wire to API */ },
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  };
}

/**
 * Hook to fetch a single appointment by ID — no-op until wired to backend API
 */
export function useAppointment(_id: string) {
  return {
    appointment: null,
    isLoading: false,
  };
}
