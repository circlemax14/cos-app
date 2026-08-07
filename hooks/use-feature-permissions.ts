import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export type Feature =
  | 'HEALTH_CHAT'
  | 'CARE_PLAN'
  | 'PROXY_MANAGEMENT'
  | 'MEDICAL_RECORDS'
  | 'HEALTH_METRICS'
  | 'INTEGRATIVE_HEALTH'
  | 'APPOINTMENTS'
  | 'REPORTS'
  | 'INBOX'
  | 'CONNECT_CLINIC'
  // Internal / diagnostic surface. About screen exposes build / runtime /
  // OTA Update ID — useful for support but not for end users. Default OFF
  // server-side; per-user override grants access (see cos-backend
  // SCRUM-148 / feature-permissions.types.ts).
  | 'ABOUT_SCREEN'
  // SCRUM-660 (2026-08-05) — Home hero insights tiles. Default TRUE
  // server-side; care manager can opt individual patients out. Global
  // feature flag stays as kill-switch above the per-user permission.
  | 'READINESS_SCORE'
  | 'HEALTH_AGE'
  | 'DAILY_READ'

export interface PermissionEntry { enabled: boolean; source: 'role' | 'care_manager'; overriddenBy?: string; overriddenAt?: string }

/**
 * Hard-coded fallback used when permissions haven't loaded yet OR the
 * permissions endpoint is unavailable. Mirrors PATIENT_FEATURE_DEFAULTS
 * on the backend so the mobile UI degrades gracefully instead of either
 * (a) hiding everything or (b) revealing internal surfaces. Anything not
 * listed here defaults to true to avoid accidentally hiding core flows.
 */
const FEATURE_DEFAULT_FALSE: ReadonlySet<Feature> = new Set<Feature>([
  'INTEGRATIVE_HEALTH',
  'ABOUT_SCREEN',
])

export function useFeaturePermissions() {
  return useQuery({
    queryKey: ['feature-permissions'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/feature-permissions')
      return res.data.data.permissions as Record<Feature, PermissionEntry>
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useIsFeatureEnabled(feature: Feature): boolean {
  const { data } = useFeaturePermissions()
  if (data?.[feature]) return data[feature].enabled
  // Permissions not loaded / endpoint unreachable. Use the conservative
  // default for diagnostic surfaces (false) and the open default for
  // everything else (true) so core flows keep working under flaky network.
  return !FEATURE_DEFAULT_FALSE.has(feature)
}
