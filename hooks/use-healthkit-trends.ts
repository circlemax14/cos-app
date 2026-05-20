import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { getAllHealthKitVitalTrends } from '@/services/health'
import type { LongitudinalTrend } from '@/services/api/types'

/**
 * Pulls longitudinal vitals from Apple HealthKit and exposes them in the
 * same shape the backend /v1/patients/me/trends endpoint serves, so the
 * Result Trends screen can merge them with FHIR-sourced trends without
 * any shape juggling.
 *
 * iOS only. On Android the query short-circuits to an empty array — the
 * Health Connect counterpart is tracked separately (SCRUM-241) and needs
 * a native binary cut before it can ship.
 *
 * The query is enabled only on iOS, so it never fires on Android (no
 * spurious HealthKit-not-available errors in logs).
 */
export function useHealthKitTrends(daysBack: number = 90) {
  return useQuery({
    queryKey: ['healthkit-trends', daysBack],
    queryFn: async (): Promise<LongitudinalTrend[]> => {
      try {
        return await getAllHealthKitVitalTrends(daysBack)
      } catch {
        return []
      }
    },
    enabled: Platform.OS === 'ios',
    staleTime: 60_000,
    // HealthKit is local + permission-gated — a failure means the user
    // declined or has no data, not something to retry blindly.
    retry: false,
  })
}
