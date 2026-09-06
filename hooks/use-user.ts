import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface UserProfile {
  sub: string;
  email: string;
  role: string;
  allowedServices: string[];
  termsAccepted: boolean;
  fastenConnected: boolean;
  dataReady: boolean;
  /**
   * SCRUM-660 (2026-08-05) — modern per-user entitlements from the
   * SCRUM-600 resolver. Optional because the resolver ships DARK
   * (PLAN_TIER_ENABLED=false); when the flag is off, the backend
   * returns ['*'] (wildcard). Consumers should call `useCan(featureKey)`
   * which fails-open (treats missing entitlements OR '*' as granted)
   * so we don't break existing UX while SCRUM-600 rolls out.
   *
   * Shape: flat array of dotted feature.sub-permission strings, e.g.
   *   ['home.readiness_score', 'plan.view', 'labs.export']
   * Server field: /v1/auth/me → data.entitlements. Kept as `entitlements`
   * on the FE type to mirror the wire shape.
   */
  entitlements?: string[];
  /**
   * COS-887 — does this patient belong to an agency they actually chose?
   *
   * NOT the same question as "is agencyId set". `ensureUserProfile` stamps
   * every new PATIENT with whichever agency is flagged `isDefault: true`, so
   * the id is populated for patients who have no agency at all. Only the
   * server can see that flag, so only the server can answer this.
   *
   * Optional because an older backend does not send it; treat undefined as
   * false at every call site.
   */
  hasElectedAgency?: boolean;
}

export function useUser() {
  return useQuery<UserProfile>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: UserProfile }>('/v1/auth/me');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 401/403
      const status = (error as { response?: { status: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });
}

export function useHasService(service: string): boolean {
  const { data } = useUser();
  return data?.allowedServices?.includes(service) ?? false;
}

/**
 * SCRUM-660 (2026-08-05) — check a SCRUM-600 entitlement. Fails OPEN
 * (returns true) when the entitlements array is missing or empty so
 * we don't hide UX for accounts on the pre-entitlements code path.
 * Wildcard '*' grants everything (matches the resolver's SUPER_ADMIN
 * + PLAN_TIER_ENABLED kill-switch semantics).
 *
 * Wire tile / route / button visibility to this once SCRUM-600 flips
 * on. Today most consumers should still use
 * `useIsFeatureEnabled(featureKey)` (SCRUM-148 legacy) since it's the
 * currently active permission source.
 */
export function useCan(dottedKey: string): boolean {
  const { data } = useUser();
  const ents = data?.entitlements;
  if (!ents || ents.length === 0) return true;
  if (ents.includes('*')) return true;
  return ents.includes(dottedKey);
}
