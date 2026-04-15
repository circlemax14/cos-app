import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface FeatureFlags {
  sign_in_with_apple: boolean
  sign_in_with_google: boolean
  [key: string]: boolean
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const res = await apiClient.get('/feature-flags')
      return res.data.data.flags as FeatureFlags
    },
    staleTime: 10 * 60 * 1000, // cache 10 min — these change rarely
  })
}

export function useIsFeatureFlagEnabled(flag: keyof FeatureFlags): boolean {
  const { data } = useFeatureFlags()
  return data?.[flag] ?? true // default to enabled while loading
}
