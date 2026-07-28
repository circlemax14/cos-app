import { useQuery, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { apiClient } from '@/lib/api-client'

interface FeatureFlags {
  sign_in_with_apple: boolean
  sign_in_with_google: boolean
  [key: string]: boolean
}

// CHUNK 29.1 (2026-07-21) — shrink the rollback window BEFORE chunk 30's
// tab-default DDB flag flip. Old staleTime was 10 min AND the global
// QueryProvider disables refetchOnWindowFocus, so a bad prod flag flip
// couldn't reach active-but-suspended clients until cold-start (could
// be days on iOS). New behavior:
//   - staleTime: 60s (down from 10 min) — flags are cheap and small
//   - AppState 'active' listener invalidates the cache so the very next
//     render after foregrounding refetches
// Combined effect: rollback recovery time = one background→foreground
// cycle, typically seconds. No new dependency, no native module.
const STALE_MS = 60 * 1000

export function useFeatureFlags() {
  const qc = useQueryClient()

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void qc.invalidateQueries({ queryKey: ['feature-flags'] })
      }
    })
    return () => sub.remove()
  }, [qc])

  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const res = await apiClient.get('/v1/feature-flags')
      return res.data.data.flags as FeatureFlags
    },
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
  })
}

export function useIsFeatureFlagEnabled(flag: keyof FeatureFlags): boolean {
  const { data } = useFeatureFlags()
  return data?.[flag] ?? true // default to enabled while loading
}
