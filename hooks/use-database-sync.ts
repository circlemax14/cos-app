/**
 * No-op hook — local database sync has been removed.
 * Data now flows directly from the backend API.
 */
export function useDatabaseSync() {
  return {
    syncAppointments: async (_appointments: any[]) => { /* no-op */ },
    syncMedications: async (_medications: any[]) => { /* no-op */ },
    syncMedicalReports: async (_reports: any[]) => { /* no-op */ },
    isSyncingAppointments: false,
    isSyncingMedications: false,
    isSyncingReports: false,
  };
}
