/**
 * COS-1058 — the client for native chat.
 *
 * Mirrors /v1/patients/me/conversations and /v1/patients/me/social. No
 * third-party SDK: history is this REST client, live messages arrive on the
 * app's existing WebSocket.
 *
 * ─── THE SOCKET CARRIES IDS, SO THIS IS HOW TEXT ARRIVES ─────────────
 *
 * A CHAT_MESSAGE frame has conversationId/messageId/senderId and no body — by
 * design, so a delivery mistake cannot disclose content. The client therefore
 * refetches through here when a frame lands. That is one extra round trip in
 * exchange for message text never riding a channel where the recipient is
 * decided by a connection id.
 */
import { apiClient } from '@/lib/api-client';

export interface ConversationSummary {
  conversationId: string;
  lastMessageAt: string;
  kind: 'direct' | 'group';
}

export interface ConversationMessage {
  conversationId: string;
  messageId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ConversationMember {
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadAt: string | null;
}

export interface DirectoryEntry {
  userId: string;
  displayName: string;
  photoUrl: string | null;
}

export type ConnectionStatus = 'pending-out' | 'pending-in' | 'accepted' | 'declined';

export interface Connection {
  userId: string;
  peerId: string;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
  conversationId: string | null;
}

/** My conversations, newest activity first. */
export async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await apiClient.get<{ data: { conversations: ConversationSummary[] } }>(
    '/v1/patients/me/conversations',
  );
  return res.data?.data?.conversations ?? [];
}

/** A page of messages, newest first. */
export async function fetchMessages(
  conversationId: string,
  cursor?: string,
): Promise<{ messages: ConversationMessage[]; nextCursor: string | null }> {
  const res = await apiClient.get<{
    data: { messages: ConversationMessage[]; nextCursor: string | null };
  }>(`/v1/patients/me/conversations/${conversationId}/messages`, {
    params: cursor ? { cursor } : undefined,
  });
  return res.data?.data ?? { messages: [], nextCursor: null };
}

/**
 * Send a message.
 *
 * Errors are NOT swallowed. A failed send must surface, because the patient
 * believes they have said something — an empty catch here is how a message
 * silently disappears and someone assumes it was read.
 */
export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<ConversationMessage> {
  const res = await apiClient.post<{ data: ConversationMessage }>(
    `/v1/patients/me/conversations/${conversationId}/messages`,
    { body },
  );
  return res.data.data;
}

export async function fetchMembers(conversationId: string): Promise<ConversationMember[]> {
  const res = await apiClient.get<{ data: { members: ConversationMember[] } }>(
    `/v1/patients/me/conversations/${conversationId}/members`,
  );
  return res.data?.data?.members ?? [];
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await apiClient.post(`/v1/patients/me/conversations/${conversationId}/read`);
}

// ── social ───────────────────────────────────────────────────────────

/** Am I findable in the directory? */
export async function fetchDiscoverability(): Promise<boolean> {
  const res = await apiClient.get<{ data: { discoverable: boolean } }>(
    '/v1/patients/me/social/discoverability',
  );
  return res.data?.data?.discoverable === true;
}

export async function setDiscoverability(discoverable: boolean): Promise<void> {
  await apiClient.put('/v1/patients/me/social/discoverability', { discoverable });
}

/**
 * Search the directory.
 *
 * Returns [] for a query the server refuses as too short rather than throwing,
 * because the caller is a search box that types one character on the way to
 * two — an error state that flashes on every first keystroke trains people to
 * ignore errors.
 */
export async function searchDirectory(query: string): Promise<DirectoryEntry[]> {
  try {
    const res = await apiClient.get<{ data: { results: DirectoryEntry[] } }>(
      '/v1/patients/me/social/search',
      { params: { q: query } },
    );
    return res.data?.data?.results ?? [];
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 400) return [];
    throw err;
  }
}

export async function fetchConnections(status?: ConnectionStatus): Promise<Connection[]> {
  const res = await apiClient.get<{ data: { connections: Connection[] } }>(
    '/v1/patients/me/social/connections',
    { params: status ? { status } : undefined },
  );
  return res.data?.data?.connections ?? [];
}

export async function requestConnection(userId: string): Promise<Connection> {
  const res = await apiClient.post<{ data: Connection }>('/v1/patients/me/social/connections', {
    userId,
  });
  return res.data.data;
}

export async function acceptConnection(requesterId: string): Promise<Connection> {
  const res = await apiClient.post<{ data: Connection }>(
    `/v1/patients/me/social/connections/${requesterId}/accept`,
  );
  return res.data.data;
}

export async function declineConnection(requesterId: string): Promise<void> {
  await apiClient.post(`/v1/patients/me/social/connections/${requesterId}/decline`);
}
