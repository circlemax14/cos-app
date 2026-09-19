/**
 * COS-1060 — refetch a conversation when a message arrives.
 *
 * ─── WHY THIS DOES NOT RENDER THE MESSAGE ────────────────────────────
 *
 * The CHAT_MESSAGE frame carries conversationId, messageId, senderId and a
 * timestamp — and NO body. That is deliberate on the server side: a frame is
 * delivered to whatever connection id is on file, so if the text rode along, a
 * fan-out bug would disclose the message itself rather than an id.
 *
 * So this hook invalidates and lets the authenticated REST read fetch the
 * text, where the server checks membership again on the actual read. One extra
 * round trip buys a design where a delivery mistake cannot leak content.
 *
 * ─── A KNOWN COST, STATED RATHER THAN HIDDEN ─────────────────────────
 *
 * This is the THIRD socket the app opens: useEntitlementsSync and
 * useHealthDataSync each already call `new WebSocket` of their own. Three
 * sockets means three rows per user in cos-wss-connections and a chat fan-out
 * that posts three times per recipient to deliver one message.
 *
 * It is wasteful and it is not correctness-affecting — every copy triggers the
 * same invalidate, and react-query collapses them. Following the existing
 * pattern was chosen over refactoring two live, working features to share one
 * socket, which is the right fix and a bigger, riskier change than chat should
 * carry. The shape to aim for is one connection with a type-keyed dispatcher;
 * all three hooks already parse `{ type, v }` the same way.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { getAccessToken, hasStoredSession } from '@/lib/auth-tokens';

const WSS_ENDPOINT = (process.env.EXPO_PUBLIC_WSS_ENDPOINT_URL ?? '').trim();

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface ChatMessageFrame {
  type: 'CHAT_MESSAGE';
  v: number;
  conversationId: string;
  messageId: string;
  senderId: string;
  at: string;
}

/**
 * Narrow an untrusted frame.
 *
 * Everything on this socket is attacker-shaped until proven otherwise, and a
 * missing conversationId would invalidate every query key rather than one.
 */
export function isChatMessageFrame(value: unknown): value is ChatMessageFrame {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    o.type === 'CHAT_MESSAGE' &&
    typeof o.v === 'number' &&
    typeof o.conversationId === 'string' &&
    o.conversationId.length > 0
  );
}

export function useChatSync(): void {
  const qc = useQueryClient();
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!WSS_ENDPOINT) return;

    cancelledRef.current = false;
    let socket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (cancelledRef.current) return;
      // Exponential backoff, capped. A tight reconnect loop against API
      // Gateway is how one offline client becomes a bill.
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attemptRef.current, RECONNECT_MAX_MS);
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => void connect(), delay);
    };

    const connect = async (): Promise<void> => {
      if (cancelledRef.current || !WSS_ENDPOINT) return;

      // Never open a socket with an absent or expired token — the server
      // refuses the upgrade and we would reconnect in a loop against a 401.
      const hasSession = await hasStoredSession();
      if (!hasSession) return;
      const token = await getAccessToken();
      if (!token) return;

      try {
        socket = new WebSocket(`${WSS_ENDPOINT}?token=${encodeURIComponent(token)}`);
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        attemptRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (!isChatMessageFrame(parsed)) return;
          /*
           * Invalidate the thread AND the inbox. The inbox orders by
           * lastMessageAt, so a new message reorders it — refreshing only the
           * open thread leaves the list wrong the moment they go back.
           */
          void qc.invalidateQueries({
            queryKey: ['conversation-messages', parsed.conversationId],
          });
          void qc.invalidateQueries({ queryKey: ['conversations'] });
        } catch {
          // A malformed frame is not worth a crash; the next read corrects it.
        }
      };

      socket.onerror = () => {
        // Fires just before onclose; leave reconnection to onclose.
      };

      socket.onclose = () => {
        socket = null;
        if (!cancelledRef.current) scheduleReconnect();
      };
    };

    /*
     * Close on background, reopen on foreground. An API Gateway WebSocket is
     * billed per connection-minute and idles out at 10 minutes anyway, so
     * holding one open behind a locked screen costs money to achieve nothing.
     */
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        if (!socket) void connect();
      } else {
        socket?.close();
        socket = null;
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    void connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sub.remove();
      socket?.close();
      socket = null;
    };
  }, [qc]);
}
