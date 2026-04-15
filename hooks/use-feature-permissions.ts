import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export type Feature = 'HEALTH_CHAT' | 'CARE_PLAN' | 'PROXY_MANAGEMENT' | 'MEDICAL_RECORDS' | 'HEALTH_METRICS' | 'INTEGRATIVE_HEALTH' | 'APPOINTMENTS' | 'REPORTS' | 'INBOX' | 'CONNECT_CLINIC'

export interface PermissionEntry { enabled: boolean; source: 'role' | 'care_manager'; overriddenBy?: string; overriddenAt?: string }

export function useFeaturePermissions() {
  return useQuery({
    queryKey: ['feature-permissions'],
    queryFn: async () => {
      const res = await apiClient.get('/patients/me/feature-permissions')
      return res.data.data.permissions as Record<Feature, PermissionEntry>
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useIsFeatureEnabled(feature: Feature): boolean {
  const { data } = useFeaturePermissions()
  return data?.[feature]?.enabled ?? true // default to enabled while loading
}
