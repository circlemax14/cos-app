// ADR-0004 P1 — PURE helpers backing hooks/use-health-data-sync.ts.
//
// Split out from the hook module for the same reason `lib/bio-
// regeneration.ts` is split out from `use-biopsychosocial-plan.ts`:
// the hook transitively imports `react`, `react-native`, and
// `@/lib/auth-tokens` (which itself pulls in expo-secure-store), none
// of which resolve under `node --test`. Keeping the pure logic in a
// dependency-free file lets the runtime unit tests import it directly
// while the hook file continues to consume it via a simple re-export.
//
// EVERY function in this file MUST stay free of React / React Native /
// Expo / axios imports. If you find yourself adding one, ask whether
// the helper belongs in the hook file instead.
//
// The hook re-exports these symbols so callers (and existing imports)
// continue to see them at their canonical location.

import type { QueryClient } from '@tanstack/react-query';

// SCRUM-651 — module-level cache populated by
// `components/FeatureFlagBridge.tsx` from the backend registry
// (`GET /v1/feature-flags`, key `LABS_REALTIME_ENABLED`). `null`
// means "bridge has not yet reported" — in that window we fall back
// to the build-time env var below so the cold-start ~200ms doesn't
// silently disable a warm bundle that was explicitly baked ON.
//
// Kept module-level (not React state) because `isLabsRealtimeEnabled`
// is called imperatively from inside `useEffect` in
// `hooks/use-health-data-sync.ts` — not at the top of a render — so
// it can't consume `useFeatureFlags` directly. The bridge component
// bridges the hook world to this pure predicate world.
let cachedLabsRealtime: boolean | null = null;

/**
 * Push a fresh value from the FeatureFlagBridge into the module-level
 * cache. Once called with any boolean, `isLabsRealtimeEnabled()` stops
 * consulting the env fallback and returns exactly what the backend
 * reports.
 */
export function setLabsRealtimeCache(v: boolean): void {
  cachedLabsRealtime = v;
}

// STRICT truthiness for the env fallback — must be the literal string
// 'true' after lowercase+trim. `String(undefined)` → 'undefined' (not
// 'true'), and any other value ('1', 'yes', 'on', ' true ') is treated
// as OFF. Keeps the flag semantics identical to
// EXPO_PUBLIC_ENTITLEMENTS_SYNC_ENABLED so ops can toggle both with
// the same mental model. Consulted only until the bridge lands the
// first backend value.
export const isLabsRealtimeEnabled = (): boolean => {
  if (cachedLabsRealtime !== null) return cachedLabsRealtime;
  return (
    String(process.env.EXPO_PUBLIC_LABS_REALTIME_ENABLED ?? '')
      .toLowerCase()
      .trim() === 'true'
  );
};

// Query keys invalidated on HEALTH_DATA_CHANGED. Kept as a module-level
// constant so the long-poll fallback, the AppState-active refetch, and
// the WSS onmessage handler all agree on the exact same surface — a
// drift here (someone adds 'lab-reports' to one but forgets another)
// would silently leave one code path serving stale data.
//
// Note: React Query's `invalidateQueries({queryKey})` matches by prefix,
// so nested keys like ['lab-reports', patientId] are covered by the
// bare ['lab-reports'] entry.
export const HEALTH_DATA_QUERY_KEYS: readonly (readonly string[])[] = [
  ['lab-reports'],
  ['trends'],
  ['health-summary'],
  ['plan'],
  ['lab-panels'],
];

export interface HealthDataChangedPayload {
  type: 'HEALTH_DATA_CHANGED';
  kinds: string[];
}

/**
 * Type guard for the WSS `HEALTH_DATA_CHANGED` frame. Rejects the
 * frame when `kinds` is missing, non-array, or contains any non-string
 * element — a rogue null/number in `kinds` would slip past a bare
 * `Array.isArray` check and later crash any consumer that iterated
 * `kinds` assuming strings.
 */
export function isHealthDataChanged(
  raw: unknown,
): raw is HealthDataChangedPayload {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'HEALTH_DATA_CHANGED') return false;
  if (!Array.isArray(obj.kinds)) return false;
  return obj.kinds.every((k) => typeof k === 'string');
}

/**
 * Invalidate every cache tied to health data. Extracted so the WSS
 * handler, the long-poll timer, and the AppState-active handler share
 * exactly one implementation. Accepts a QueryClient-shaped object so
 * unit tests can pass a fake without importing @tanstack/react-query
 * (which pulls in a React runtime under node:test).
 */
export function invalidateHealthDataQueries(
  qc: Pick<QueryClient, 'invalidateQueries'>,
): void {
  for (const key of HEALTH_DATA_QUERY_KEYS) {
    void qc.invalidateQueries({ queryKey: key });
  }
}
