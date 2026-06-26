import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { getAllHealthKitVitalTrends } from '@/services/health'
import type { LongitudinalTrend } from '@/services/api/types'
import { useAppleHealthPreference } from '@/hooks/use-apple-health-preference'
import { shouldFetchAppleHealthTrends } from '@/lib/apple-health-gate'

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
 * COS-397 / SCRUM-535: the user-facing Apple Health preference is the
 * authoritative switch. When the user has turned Apple Health OFF (even if
 * iOS still has a lingering read grant — which it can't reliably revoke),
 * we MUST NOT fetch or surface HealthKit data. Gating here, at the single
 * data source, means every consumer (Health Trends, and any future home /
 * today-schedule surface) respects the preference consistently. The hook
 * exposes `disabled` so a screen can show a clear "turned off" state instead
 * of stale Apple Health trends.
 */
export function useHealthKitTrends(daysBack: number = 90) {
  const preferenceQuery = useAppleHealthPreference()
  const isIos = Platform.OS === 'ios'
  // Treat the preference as ON only once it has explicitly resolved to true.
  // While it loads we leave the gate closed, so we never momentarily fetch
  // HealthKit for a user who has it turned off.
  const preferenceEnabled = preferenceQuery.data === true
  const enabled = shouldFetchAppleHealthTrends(isIos, preferenceEnabled)

  const query = useQuery({
    // Key includes the resolved preference so flipping it re-evaluates
    // (and a disabled run never serves a cached enabled snapshot).
    queryKey: ['healthkit-trends', daysBack, preferenceEnabled],
    queryFn: async (): Promise<LongitudinalTrend[]> => {
      try {
        return await getAllHealthKitVitalTrends(daysBack)
      } catch {
        return []
      }
    },
    enabled,
    staleTime: 60_000,
    // HealthKit is local + permission-gated — a failure means the user
    // declined or has no data, not something to retry blindly.
    retry: false,
  })

  // When the preference is disabled (iOS) or the platform isn't iOS, the
  // underlying query is disabled and `data` is undefined. Force an empty
  // array so consumers reading `data` never see stale Apple Health trends.
  const disabled = isIos && !preferenceEnabled && !preferenceQuery.isLoading

  return {
    ...query,
    data: enabled ? query.data : [],
    /** True when Apple Health is turned off in the app preference (iOS only). */
    disabled,
  }
}
