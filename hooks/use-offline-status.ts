/**
 * useOfflineStatus (COS-475, Phase 6.4).
 *
 * Lightweight network reachability check. Uses RN's built-in `fetch` with
 * an AbortController — NO new native deps (expo-network / netinfo would
 * bump the runtime fingerprint and force a binary cut, violating the OTA
 * constraint on this branch).
 *
 * Polls every 15s while mounted; also re-runs on AppState 'active'.
 * Never queues mutations — offline=true is a UX gate on swipe gestures
 * only; API calls still fail through the normal error path.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const POLL_MS = 15_000;
const PROBE_TIMEOUT_MS = 4_000;

// Fall back to a stable, low-cost 204 endpoint. Using the app's own API
// base is preferable when available so a corp firewall that blocks the
// public probe URL doesn't force the UI into "offline" mode.
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const PROBE_URL = API_BASE
  ? `${API_BASE.replace(/\/$/, '')}/v1/health`
  : 'https://clients3.google.com/generate_204';

async function probeOnline(): Promise<boolean> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(PROBE_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    // Any 2xx/3xx counts as online — even 404 from the probe endpoint
    // proves DNS + TCP + TLS worked. Only outright fetch failure (no
    // response) means we're actually offline.
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export interface UseOfflineStatusResult {
  offline: boolean;
  /** Manual re-check — resolves with the fresh reachability state. */
  refresh: () => Promise<boolean>;
}

export function useOfflineStatus(): UseOfflineStatusResult {
  const [offline, setOffline] = useState(false);
  const mounted = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    const online = await probeOnline();
    if (!mounted.current) return online;
    setOffline((prev) => (prev === !online ? prev : !online));
    return online;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void check();

    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        await check();
        if (mounted.current) schedule();
      }, POLL_MS);
    };
    schedule();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void check();
    });

    return () => {
      mounted.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
    };
  }, [check]);

  return { offline, refresh: check };
}
