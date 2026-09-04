/**
 * Health Sync — read/write the ONE connected health source.
 *
 * Wraps services/health-sources.ts in the same React Query shape as
 * hooks/use-apple-health-preference.ts: a 0-stale-time query over the
 * persisted value, invalidated after every write so every surface re-reads at
 * once.
 *
 * ── Persistence: local only, and here's what I found ──────────────────────
 * Grepped for a preference endpoint to mirror this to. What exists:
 *   • /v1/patients/me/notification-prefs/{health-plan,timezone,categories}
 *     (services/api/notification-prefs.ts) — notification categories only; a
 *     fixed boolean schema with no room for an arbitrary preference.
 *   • /v1/patients/me/devices (services/api/providers.ts) — READ-only FHIR
 *     Device resources from the EHR, not a user preference.
 *   • services/apple-health-preference.ts — the boolean this feature extends,
 *     itself AsyncStorage ONLY. There is no server copy of it today.
 * So there is no endpoint to write to, and the pattern being followed is a
 * local-only one.
 *
 * ponytail: local-only, exactly like the boolean it replaces. When the backend
 * grows `PUT /v1/patients/me/health-source` (zod body `{ source: enum | null }`,
 * sendSuccess/sendError, and `source` aliased via ExpressionAttributeNames —
 * it's a DDB reserved word), push it from the two mutations below and seed the
 * query from the server on first load. Nothing else here changes.
 */

import { useCallback, useMemo } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APPLE_HEALTH_PREFERENCE_KEY } from '@/hooks/use-apple-health-preference';
import {
  availableHealthSources,
  connectHealthSource,
  describeReplacement,
  disconnectHealthSource,
  getConnectedHealthSource,
  type ConnectedHealthSource,
  type HealthSourceId,
  type HealthSourceOffer,
  type HealthSourceResult,
} from '@/services/health-sources';

export const HEALTH_SOURCE_QUERY_KEY = ['health-source'] as const;

export interface UseHealthSource {
  /** The one connected source, or null. */
  current: ConnectedHealthSource | null;
  /**
   * Sources offerable on THIS device, already platform + manufacturer
   * filtered, each with its `status` and an honest `note`.
   */
  available: HealthSourceOffer[];
  /** Never throws — reports through `{ ok, message }`. */
  connect: (id: HealthSourceId) => Promise<HealthSourceResult>;
  disconnect: () => Promise<HealthSourceResult>;
  isConnecting: boolean;
  /**
   * What connecting `id` would replace, as a sentence — null when nothing.
   * Show this before calling `connect`, so a switch is never silent.
   */
  willReplace: (id: HealthSourceId) => string | null;
  /** Initial hydrate of the stored connection. */
  isLoading: boolean;
}

export function useHealthSource(): UseHealthSource {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: HEALTH_SOURCE_QUERY_KEY,
    queryFn: getConnectedHealthSource,
    staleTime: 0,
  });
  const current = data ?? null;

  // Platform and manufacturer can't change while the app is running.
  const available = useMemo(() => availableHealthSources(), []);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: HEALTH_SOURCE_QUERY_KEY });
    // Apple Health connect/disconnect moves the legacy boolean too, so the
    // surfaces gated on it (Health Trends) must re-read as well.
    void queryClient.invalidateQueries({ queryKey: APPLE_HEALTH_PREFERENCE_KEY });
    void queryClient.invalidateQueries({ queryKey: ['healthkit-trends'] });
  }, [queryClient]);

  // onSettled, not onSuccess: even a failed connect can have moved the legacy
  // Apple Health boolean, so every path re-reads.
  const connectMutation = useMutation({
    mutationFn: connectHealthSource,
    onSettled: invalidate,
  });
  const disconnectMutation = useMutation({
    mutationFn: disconnectHealthSource,
    onSettled: invalidate,
  });

  const connect = useCallback(
    (id: HealthSourceId) => connectMutation.mutateAsync(id),
    [connectMutation],
  );
  const disconnect = useCallback(
    () => disconnectMutation.mutateAsync(),
    [disconnectMutation],
  );
  const willReplace = useCallback(
    (id: HealthSourceId) => describeReplacement(current, id),
    [current],
  );

  return {
    current,
    available,
    connect,
    disconnect,
    isConnecting: connectMutation.isPending || disconnectMutation.isPending,
    willReplace,
    isLoading,
  };
}
