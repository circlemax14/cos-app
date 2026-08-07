// ADR-0004 P1 — iOS health-data-changed sync hook.
//
// Full WSS lifecycle for the mobile app (cos-app), mirroring the contract
// established in `use-entitlements-sync.ts`. Runs alongside it (mounted at
// the app root, see `app/_layout.tsx`).
//
//   1. On app active + user authenticated + flag ON:
//      a. Open WebSocket to WSS_ENDPOINT + '?token=' + accessToken
//      b. Listen for {type:"HEALTH_DATA_CHANGED", kinds:[...]} messages
//      c. On receive: invalidate the React Query caches for lab reports,
//         trends, health summary, plan, and lab panels so downstream
//         useLabReports() / useTrends() / useHealthSummary() / usePlan() /
//         useLabPanels() consumers refetch → fresh clinical data
//         propagates without a manual pull-to-refresh.
//   2. Long-poll fallback: 60s setInterval that invalidates the same set
//      of caches. Runs alongside the WSS so a dropped push doesn't
//      strand the client on stale clinical data.
//   3. Close socket on AppState background; reopen on active. Refetch
//      immediately on foreground so a user returning to the app never
//      sees results older than the moment they tapped the icon.
//   4. Reconnect on socket close/error with capped exponential backoff
//      (base 1s, cap 30s, ±30% jitter).
//
// iOS can pass the JWT directly (unlike cos-frontend web which has
// HTTP-only cookies) because cos-app stores the access token in Expo
// SecureStore and exposes it via lib/auth-tokens::getAccessToken().
//
// SEPARATION FROM use-entitlements-sync
// -------------------------------------
// Even though the two hooks share a WSS endpoint (single API GW $connect
// route), each keeps its own WebSocket lifecycle. The rationale is
// deliberate:
//   - Independently flag-gated (entitlements vs labs realtime can flip
//     on separate schedules per stage without a coordinated rollout).
//   - Independently backoff/reconnect (a bad labs push shouldn't stall
//     entitlements sync and vice-versa).
//   - Message-type dispatch stays local — each hook parses only the
//     shape it owns, so a schema change on one side can't accidentally
//     invalidate the other's caches.
// If the two ever want to share a single socket, do it via an explicit
// multiplexer at the connect layer — don't reach across hooks.
//
// PHI POSTURE
// -----------
// The WSS payload is intentionally PHI-free: only {type, kinds[]} where
// `kinds` are opaque taxonomy strings ('lab', 'vaccine', 'summary',
// etc.). The client responds by invalidating caches and letting the
// authenticated HTTP fetches (which already scrub via the Sentry
// beforeSend contract in lib/sentry-install.ts) carry the actual
// clinical data. Never widen this contract to include values, deltas,
// or resource IDs without a joint security review.
//
// Wire it once at the app root (see app/_layout.tsx). Renders no UI.

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken, hasStoredSession } from '@/lib/auth-tokens';
import {
  HEALTH_DATA_QUERY_KEYS,
  invalidateHealthDataQueries,
  isHealthDataChanged,
  isLabsRealtimeEnabled,
} from '@/lib/health-data-sync';

// Re-export the pure surface so callers importing from this hook
// module continue to work, and so the runtime unit tests
// (`hooks/__tests__/use-health-data-sync.test.ts`) have a single
// canonical import path. The definitions themselves live in
// `lib/health-data-sync.ts` — a dependency-free file that resolves
// under `node --test`. See that file's header for the rationale
// (mirrors the `lib/bio-regeneration.ts` split).
export {
  HEALTH_DATA_QUERY_KEYS,
  invalidateHealthDataQueries,
  isHealthDataChanged,
  isLabsRealtimeEnabled,
};

// Endpoint comes from an Expo public env var so the same JS bundle can point
// at dev/staging/prod without conditional imports. Value format:
//   wss://<apiId>.execute-api.<region>.amazonaws.com/<stage>
const WSS_ENDPOINT = (
  process.env.EXPO_PUBLIC_WSS_ENDPOINT_URL ?? ''
).trim();

const POLL_INTERVAL_MS = 60_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;

/**
 * Mount once at the app root. Wires the WSS + long-poll lifecycle to
 * AppState + auth state. Renders nothing.
 */
export function useHealthDataSync(): void {
  const qc = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(RECONNECT_BASE_MS);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isLabsRealtimeEnabled()) return;
    if (!WSS_ENDPOINT) {
      // Endpoint unset — the poll will still run so admin-side or
      // integration-side mutations eventually reach the client. Log
      // once (dev builds only).
      if (__DEV__) {
        console.debug(
          '[health-data-sync] EXPO_PUBLIC_WSS_ENDPOINT_URL not set — long-poll only',
        );
      }
    }
    cancelledRef.current = false;

    async function connect(): Promise<void> {
      if (cancelledRef.current) return;
      if (!WSS_ENDPOINT) return;

      // Only connect when the user has a session — otherwise we'd try
      // to open a socket with an empty/expired token.
      const hasSession = await hasStoredSession();
      if (!hasSession) return;

      const token = await getAccessToken();
      if (!token) return;

      // SECURITY: same posture as use-entitlements-sync — the JWT rides
      // in the query string because API GW V2 upgrade has no cookie/
      // header channel. Never log the full URL; only WSS_ENDPOINT
      // (no query string). See use-entitlements-sync.ts for the full
      // rationale + SCRUM-632 short-lived-ticket follow-up.
      const url = `${WSS_ENDPOINT}?token=${encodeURIComponent(token)}`;
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        if (__DEV__) {
          const msg = err instanceof Error ? err.message : 'unknown';
          console.warn('[health-data-sync] WSS construct failed:', msg);
        }
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        // Reset backoff on successful connect.
        backoffRef.current = RECONNECT_BASE_MS;
        if (__DEV__) console.debug('[health-data-sync] WSS open');
      };

      socket.onmessage = (event) => {
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (isHealthDataChanged(parsed)) {
            // NOTE: `kinds` is inspected only so a future refinement
            // (e.g. "only invalidate ['plan'] when kinds includes
            // 'plan'") can be added without a wire-format change.
            // Today we invalidate the full set — the caches are cheap
            // and the correctness cost of a mis-targeted delta is
            // high (stale labs are a clinical-decision hazard).
            invalidateHealthDataQueries(qc);
          }
        } catch {
          // Non-JSON or unexpected shape — ignore (never throw from
          // the socket handler; would tear down the connection).
        }
      };

      socket.onerror = () => {
        // Fires just before onclose; leave the reconnect logic to onclose.
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (!cancelledRef.current) scheduleReconnect();
      };
    }

    function scheduleReconnect(): void {
      if (cancelledRef.current) return;
      if (reconnectTimerRef.current) return; // already scheduled
      const delay = backoffRef.current;
      // Cap + jitter (±30%) so 100 clients don't reconnect
      // simultaneously after a stage restart. Slightly wider than the
      // ±25% entitlements-sync window because labs pushes are more
      // event-clustered (e.g. a batch webhook drop wakes many clients
      // at once), so we buy a bit more spread.
      const jittered = Math.round(delay * (0.7 + Math.random() * 0.6));
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        // Grow backoff for the next attempt (capped).
        backoffRef.current = Math.min(backoffRef.current * 2, RECONNECT_CAP_MS);
        void connect();
      }, jittered);
    }

    // Long-poll fallback — safety net for dropped pushes and for users
    // who lose WSS entirely (bad network, misconfigured endpoint).
    pollTimerRef.current = setInterval(() => {
      invalidateHealthDataQueries(qc);
    }, POLL_INTERVAL_MS);

    // AppState — close socket in background, reopen on active.
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        // Refetch immediately + kick a fresh WSS connect if we don't
        // have one. This is the "user returned to the app" recovery
        // path — a WSS-only design would leave them staring at stale
        // labs for up to POLL_INTERVAL_MS.
        invalidateHealthDataQueries(qc);
        if (!socketRef.current) void connect();
      } else if (next === 'background' || next === 'inactive') {
        // Politely close the socket so we don't hold a connection
        // while backgrounded (iOS may kill it anyway after ~30s idle).
        socketRef.current?.close();
        socketRef.current = null;
      }
    };
    const sub = AppState.addEventListener('change', onAppStateChange);

    // Kick off initial connect.
    void connect();

    return () => {
      cancelledRef.current = true;
      sub.remove();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [qc]);
}
