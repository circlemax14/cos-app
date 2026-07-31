/**
 * SCRUM-651 — FeatureFlagBridge.
 *
 * Subscribes to the shared `useFeatureFlags` query and pushes flag
 * values that need to be readable from *non-hook* code paths into
 * their respective module-level caches.
 *
 * Today the only such consumer is
 * `lib/health-data-sync.ts::isLabsRealtimeEnabled()`, which is called
 * imperatively from inside a `useEffect` (not at the top of a render)
 * and therefore can't consume `useFeatureFlags` directly. Once the
 * flags query resolves, we mirror the `LABS_REALTIME_ENABLED` value
 * into the cache so the next re-render of `useHealthDataSync` sees
 * the authoritative backend gate instead of the env fallback.
 *
 * MUST be mounted inside the `QueryProvider` subtree so
 * `useFeatureFlags` has a `QueryClient` in context. Renders nothing.
 */

import { useEffect } from 'react';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { setLabsRealtimeCache } from '@/lib/health-data-sync';

export function FeatureFlagBridge(): null {
  const { data } = useFeatureFlags();

  useEffect(() => {
    // Wait for the query to actually resolve — otherwise we'd
    // prematurely commit `false` during the ~200ms cold-start window
    // and stomp the env-var fallback path.
    if (data === undefined) return;
    setLabsRealtimeCache(data.LABS_REALTIME_ENABLED === true);
  }, [data]);

  return null;
}
