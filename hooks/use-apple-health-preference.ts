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
    /*
     * COS-933 — NOT gated on iOS.
     *
     * This is the single line that made every Android health surface empty
     * while the Health Sync screen said "Samsung Health connected". With the
     * query disabled, `data` stays undefined forever, so `data === true` is
     * false, so the trends gate never opens — and the vitals section renders
     * "turn on Samsung Health in Health Sync", to a patient who just did.
     *
     * The preference is a plain AsyncStorage boolean and applies to BOTH
     * platforms by design: to the patient it is one setting called Health
     * Sync, and services/health-source.ts deliberately governs Health Connect
     * with the same key. Gating the READ on iOS was left over from when
     * HealthKit was the only source.
     */
    staleTime: 0,
  })
}
