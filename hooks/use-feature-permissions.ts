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

export interface ScreenAccess {
  enabled: boolean
  reason: 'public' | 'entitlement' | 'entitlement-missing' | 'care-manager-off' | 'unknown-feature'
}

export interface FeaturePermissionsResponse {
  permissions: Record<Feature, PermissionEntry>
  /**
   * COS-856 — per-screen access derived from the ENTITLEMENT PLAN, keyed by
   * both catalog featureKey and app route name.
   *
   * Optional: a bundle pointed at an API that predates this field falls back
   * to showing everything, which is the behaviour it had anyway.
   */
  screens?: Record<string, ScreenAccess>
}

export function useFeaturePermissions() {
  return useQuery({
    queryKey: ['feature-permissions'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/patients/me/feature-permissions')
      return res.data.data as FeaturePermissionsResponse
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Can this patient see this screen?
 *
 * `route` is the app route name (`health-plan`, `index`, ...) or a catalog
 * featureKey — the backend keys the map by both.
 *
 * Defaults to VISIBLE when the answer is unknown: while the query is in
 * flight, on an older API with no `screens`, or for a route the catalog has
 * never heard of. Hiding navigation on a slow network would be a worse
 * failure than briefly showing a screen the plan does not include.
 */
export function useCanShowScreen(): (route: string) => boolean {
  const { data } = useFeaturePermissions()
  return (route: string) => data?.screens?.[route]?.enabled ?? true
}

export function useIsFeatureEnabled(feature: Feature): boolean {
  const { data } = useFeaturePermissions()
  // COS-856 — the response gained a `screens` sibling, so `permissions` is now
  // nested. Same semantics, one level deeper.
  if (data?.permissions?.[feature]) return data.permissions[feature].enabled
  // Permissions not loaded / endpoint unreachable. Use the conservative
  // default for diagnostic surfaces (false) and the open default for
  // everything else (true) so core flows keep working under flaky network.
  return !FEATURE_DEFAULT_FALSE.has(feature)
}
