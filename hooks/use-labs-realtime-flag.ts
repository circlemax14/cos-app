import { useFeatureFlags } from './use-feature-flags';

/**
 * SCRUM-651 — backend-driven registry gate for the ADR-0004 P1
 * labs-realtime WSS sync. Strict `=== true` default-OFF while flags
 * load, so the WSS lifecycle stays inert until we positively know the
 * backend has flipped the flag on.
 *
 * FLAG_KEY matches the backend registry symbol `LABS_REALTIME_ENABLED`.
 *
 * Note: `lib/health-data-sync.ts::isLabsRealtimeEnabled()` is a plain
 * sync predicate called imperatively (inside `useEffect`, not at the
 * top of a component body), so it can't consume this hook directly.
 * `components/FeatureFlagBridge.tsx` subscribes to this hook and pushes
 * the value into the module-level cache read by that predicate.
 */
const LABS_REALTIME_FLAG = 'LABS_REALTIME_ENABLED';

export function useLabsRealtimeFlag(): boolean {
  const { data } = useFeatureFlags();
  return data?.[LABS_REALTIME_FLAG] === true;
}
