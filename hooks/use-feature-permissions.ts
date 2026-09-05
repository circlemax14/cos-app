import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter } from 'expo-router'
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

/**
 * COS-859 — block ACCESS to a screen the plan does not include, not just its
 * tab.
 *
 * The navigator gates `<Tabs.Screen>` entries, which covers the five screens
 * actually in the tab bar. The other 55 carry `href: null` — they are reached
 * with router.push() from inside the app, so removing one from a plan hid
 * nothing and it stayed fully reachable. Vishal removed calendar-settings and
 * could still open it.
 *
 * One guard for every route, mounted once in app/Home/_layout.tsx, rather than
 * a check pasted into sixty screens — the pasted version is the one that is
 * missing from the sixty-first.
 *
 * Redirects rather than rendering a locked page: the route sits inside the tab
 * navigator, so leaving it mounted keeps its data hooks running and its
 * queries firing for a screen the patient may not have. Sending them home is
 * unambiguous and cheap. A "not part of your plan" upsell screen is a
 * deliberate design decision, not a default.
 */
export function useEnforceScreenAccess(): void {
  const canShow = useCanShowScreen()
  const { data } = useFeaturePermissions()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    // Nothing to enforce until the map has actually loaded. `canShow` defaults
    // to true while in flight, so acting early would be acting on a default
    // rather than on an answer.
    if (!data?.screens) return

    const route = pathname.split('/').filter(Boolean).pop()
    if (!route) return
    // The tab root itself is never blocked — bouncing off Home would loop.
    if (route === 'Home' || route === 'index') return
    /*
     * COS-917 — and neither is the screen that EXPLAINS the block, for the
     * same reason. Its route name is deliberately absent from the catalog and
     * from ROUTE_ALIASES so canShow() falls through to true, but skipping it
     * by name means a catalog entry added later cannot create the loop.
     */
    if (route === 'plan-feature-unavailable') return
    if (canShow(route)) return

    /*
     * COS-917 — say why, instead of teleporting them Home.
     *
     * This was `router.replace('/Home')`. The guard is right and stays; where
     * it sent people was not. From the patient's side a redirect with no
     * message is a button that does nothing — Vishal hit it three times in one
     * session (the plan pill, "view progress", "Choose a different plan") and
     * reported it three times as "nothing is happening" and "it is taking me
     * to the home screen, I don't know what is happening".
     *
     * A scan found 33 navigation targets this can bounce. Patching 33 call
     * sites would be the wrong altitude and would miss the 34th; one
     * destination that explains itself covers every one, including those added
     * later. The route name rides along so the screen can name the feature.
     */
    router.replace({
      pathname: '/Home/plan-feature-unavailable',
      params: { route },
    } as never)
  }, [pathname, data, canShow, router])
}
