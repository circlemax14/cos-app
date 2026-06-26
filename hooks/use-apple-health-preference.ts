import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { getAppleHealthEnabled } from '@/services/apple-health-preference'

export const APPLE_HEALTH_PREFERENCE_KEY = ['apple-health-preference'] as const

/**
 * Reactive read of the persisted Apple Health app-preference (COS-397 /
 * SCRUM-535). Backs the data-source gate in useHealthKitTrends and the
 * "turned off" UI on the Health Trends screen.
 *
 * iOS only — on Android the preference is irrelevant (Apple Health doesn't
 * exist there), so we short-circuit to `false` and never read storage.
 *
 * 0 stale time so screens that invalidate this key after the user toggles
 * the preference (or refetch it on focus) always see the latest choice.
 */
export function useAppleHealthPreference() {
  return useQuery({
    queryKey: APPLE_HEALTH_PREFERENCE_KEY,
    queryFn: getAppleHealthEnabled,
    enabled: Platform.OS === 'ios',
    staleTime: 0,
  })
}
