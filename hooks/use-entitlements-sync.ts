// SCRUM-628 (Sprint 2 P6) — iOS entitlements-changed sync hook.
//
// Full WSS lifecycle for the mobile app (cos-app):
//   1. On app active + user authenticated + flag ON:
//      a. Open WebSocket to WSS_ENDPOINT + '?token=' + accessToken
//      b. Listen for {type:"ENTITLEMENTS_CHANGED"} messages
//      c. On receive: invalidate the ['user','me'] React Query cache
//         so useUser() refetches → new can() results propagate.
//   2. Long-poll fallback: 60s setInterval to invalidate the same cache.
//      Runs alongside the WSS so a dropped push doesn't strand the client.
//   3. Close socket on AppState background; reopen on active.
//   4. Reconnect on socket close/error with capped exponential backoff.
//
// iOS can pass the JWT directly (unlike cos-frontend web which has HTTP-only
// cookies) because cos-app stores the access token in Expo SecureStore and
// exposes it via lib/auth-tokens::getAccessToken(). This is the reason the
// FE web PR shipped long-poll only while this one gets the full contract.
//
// Wire it once at the app root (see app/_layout.tsx). It renders no UI.

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken, hasStoredSession } from '@/lib/auth-tokens';

// Endpoint comes from an Expo public env var so the same JS bundle can point
// at dev/staging/prod without conditional imports. Value format:
//   wss://<apiId>.execute-api.<region>.amazonaws.com/<stage>
const WSS_ENDPOINT = (
  process.env.EXPO_PUBLIC_WSS_ENDPOINT_URL ?? ''
).trim();

const SYNC_ENABLED =
  String(process.env.EXPO_PUBLIC_ENTITLEMENTS_SYNC_ENABLED ?? '')
    .toLowerCase()
    .trim() === 'true';

const POLL_INTERVAL_MS = 60_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;

interface EntitlementsChangedPayload {
  type: 'ENTITLEMENTS_CHANGED';
  v: number;
}

function isEntitlementsChanged(
  raw: unknown,
): raw is EntitlementsChangedPayload {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return obj.type === 'ENTITLEMENTS_CHANGED' && typeof obj.v === 'number';
}

/**
 * Mount once at the app root. Wires the WSS + long-poll lifecycle to
 * AppState + auth state. Renders nothing.
 */
export function useEntitlementsSync(): void {
  const qc = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(RECONNECT_BASE_MS);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!SYNC_ENABLED) return;
    if (!WSS_ENDPOINT) {
      // Endpoint unset — the poll will still run so admin-side mutations
      // eventually reach the client. Log once (dev builds only).
      if (__DEV__) {
        console.debug(
          '[entitlements-sync] EXPO_PUBLIC_WSS_ENDPOINT_URL not set — long-poll only',
        );
      }
    }
    cancelledRef.current = false;

    async function connect(): Promise<void> {
      if (cancelledRef.current) return;
      if (!WSS_ENDPOINT) return;

      // Only connect when the user has a session — otherwise we'd try to
      // open a socket with an empty/expired token.
      const hasSession = await hasStoredSession();
      if (!hasSession) return;

      const token = await getAccessToken();
      if (!token) return;

      // SECURITY: the JWT rides in the WSS query string because API GW V2
      // upgrade has no cookie/header channel. This IS the AWS-documented
      // pattern, but query-string tokens can leak into any transport that
      // logs URLs (Sentry auto-instrumentation, proxies, native
      // NSURLSession diagnostic logs). Mitigations:
      //   1. Never log the full URL — only `WSS_ENDPOINT` (no query string).
      //     Any thrown error is logged as `.message` only, which is a
      //     WebSocket-construct diagnostic like "URL is invalid" and does
      //     not include the URL in practice, but we scrub `.stack` etc.
      //   2. Long-term: move to short-lived (<= 60s) HMAC tickets minted by
      //     a backend endpoint (SCRUM-632). Ticket exposure has a bounded
      //     replay window vs the full access-token TTL.
      const url = `${WSS_ENDPOINT}?token=${encodeURIComponent(token)}`;
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        if (__DEV__) {
          const msg = err instanceof Error ? err.message : 'unknown';
          console.warn('[entitlements-sync] WSS construct failed:', msg);
        }
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        // Reset backoff on successful connect.
        backoffRef.current = RECONNECT_BASE_MS;
        if (__DEV__) console.debug('[entitlements-sync] WSS open');
      };

      socket.onmessage = (event) => {
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (isEntitlementsChanged(parsed)) {
            // Invalidate the user cache so useUser() refetches /v1/auth/me
            // → new permissions propagate. Any downstream can() consumer
            // re-renders on the fresh data.
            void qc.invalidateQueries({ queryKey: ['user', 'me'] });
          }
        } catch {
          // Non-JSON or unexpected shape — ignore (never throw from the
          // socket handler; would tear down the connection).
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
      // Cap + jitter (up to ±25%) so 100 clients don't reconnect
      // simultaneously after a stage restart.
      const jittered = Math.round(delay * (0.75 + Math.random() * 0.5));
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
      void qc.invalidateQueries({ queryKey: ['user', 'me'] });
    }, POLL_INTERVAL_MS);

    // AppState — close socket in background, reopen on active. Also reopen
    // on unfrozen state (some Android devices) but that's a no-op on iOS.
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        // Refetch immediately + kick a fresh WSS connect if we don't have one.
        void qc.invalidateQueries({ queryKey: ['user', 'me'] });
        if (!socketRef.current) void connect();
      } else if (next === 'background' || next === 'inactive') {
        // Politely close the socket so we don't hold a connection while
        // backgrounded (iOS may kill it anyway after ~30s idle).
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
