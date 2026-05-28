import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { getAllHealthKitVitalTrends } from '@/services/health'
import { getAllHealthConnectTrends, getHealthConnectStatus } from '@/services/health-android'
import type { LongitudinalTrend } from '@/services/api/types'

/**
 * Pulls longitudinal vitals from the platform's native health store and
 * exposes them in the same shape the backend /v1/patients/me/trends
 * endpoint serves, so the Result Trends screen can merge them with
 * FHIR-sourced trends without any shape juggling.
 *
 * Platform dispatch:
 *  - iOS  → Apple HealthKit via `react-native-health` (services/health.ts).
 *  - Android → Google Health Connect via `react-native-health-connect`
 *    (services/health-android.ts). Falls back to empty when Health
 *    Connect isn't installed / device is too old (SDK reports unsupported).
 *  - Web / anything else → empty.
 *
 * The hook's name is kept for source-compat with existing callers; SCRUM-272
 * generalized what it covers without renaming.
 */
export function useHealthKitTrends(daysBack: number = 90) {
  return useQuery({
    queryKey: ['health-trends', Platform.OS, daysBack],
    queryFn: async (): Promise<LongitudinalTrend[]> => {
      try {
        if (Platform.OS === 'ios') {
          return await getAllHealthKitVitalTrends(daysBack)
        }
        if (Platform.OS === 'android') {
          const status = await getHealthConnectStatus()
          if (status !== 'available') return []
          return await getAllHealthConnectTrends(daysBack)
        }
        return []
      } catch {
        return []
      }
    },
    enabled: Platform.OS === 'ios' || Platform.OS === 'android',
    staleTime: 60_000,
    retry: false,
  })
}
