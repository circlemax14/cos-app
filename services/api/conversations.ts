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
  /** COS-1129 — present only on 'pending-out'; see the server note. */
  displayName?: string;
  photoUrl?: string | null;
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
/**
 * COS-1125 — both social consents, plus whether a region is on file.
 *
 * `hasRegion` says only WHETHER we hold one, never which. The screen needs it
 * to explain why the suggestions switch is unavailable; the value itself is
 * what the feature exists to protect.
 */
export interface SocialVisibility {
  discoverable: boolean;
  suggestRegion: boolean;
  hasRegion: boolean;
}

export async function fetchSocialVisibility(): Promise<SocialVisibility> {
  const res = await apiClient.get<{ data: SocialVisibility }>(
    '/v1/patients/me/social/discoverability',
  );
  const d = res.data.data;
  return {
    discoverable: d?.discoverable === true,
    suggestRegion: d?.suggestRegion === true,
    hasRegion: d?.hasRegion === true,
  };
}

/** Turn regional suggestions on or off. Throws with NO_REGION_ON_FILE when we
 *  hold no address to match against. */
export async function setRegionSuggestions(on: boolean): Promise<void> {
  await apiClient.put('/v1/patients/me/social/suggest-region', { suggestRegion: on });
}

/** People near me who asked to be suggested. [] is a normal answer. */
export async function fetchSuggestions(): Promise<DirectoryEntry[]> {
  try {
    const res = await apiClient.get<{ data: { results: DirectoryEntry[] } }>(
      '/v1/patients/me/social/suggestions',
    );
    return res.data.data.results ?? [];
  } catch {
    // Suggestions are an extra, never the point of the screen — a failure here
    // must not take the search down with it.
    return [];
  }
}

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

/**
 * COS-1129 — withdraw a request you sent.
 *
 * Symmetric by design on the server: both rows are deleted, so neither side is
 * left holding a record of a request that no longer exists.
 */
export async function cancelConnection(userId: string): Promise<void> {
  await apiClient.delete(`/v1/patients/me/social/connections/${encodeURIComponent(userId)}`);
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

// ── invite by email (COS-1231) ────────────────────────────────────────

/**
 * COS-1231 — inviting someone who is NOT a user yet.
 *
 * Everything above acts on a userId that already exists. These three act on an
 * email address that may belong to nobody, which is why the POST is the only
 * social route with server-side entitlement enforcement.
 *
 * The field names and the status union below are character-identical to
 * src/services/social-invite.service.ts's `Invite`. One shape, one vocabulary:
 * the last time this area grew a second one it shipped two implementations of
 * connections.
 */
export type InviteRelationship = 'family' | 'friend' | 'carer' | 'clinician';

export interface Invite {
  inviteId: string;
  email: string;
  relationship: InviteRelationship;
  note: string | null;
  /**
   * 'expired' is DERIVED by the server on every read and never stored, because
   * DynamoDB's TTL purge runs up to 48h late. Never compute it here from
   * expiresAt — two clocks disagreeing about whether a link is dead is how a
   * screen ends up offering Withdraw on something already gone.
   */
  status: 'invited' | 'claimed' | 'withdrawn' | 'expired';
  createdAt: string;
  expiresAt: string;
  /**
   * What the mail transport actually returned. Propagated rather than assumed:
   * a Resend 429 or 5xx is swallowed server-side into delivered:false with no
   * retry and no queue, and the confirmation screen NAMES the address — so a
   * false `true` here is the app telling a patient something untrue.
   */
  delivered: boolean;
}

/**
 * The server's `code` on a 4xx, carried so the sheet can say which of five
 * different things went wrong. Same shape as plan-type.ts:97.
 */
export type InviteErrorCode =
  | 'VALIDATION_ERROR'
  | 'SELF_INVITE'
  | 'INVITE_ALREADY_PENDING'
  | 'ALREADY_CONNECTED'
  | 'INVITE_RATE_LIMITED'
  | 'INVITE_NOT_FOUND';

export interface InviteError extends Error {
  code?: InviteErrorCode;
  /** Present on INVITE_ALREADY_PENDING: the invitation that already exists. */
  existing?: Invite;
}

function wrapInviteError(err: unknown): never {
  const res = (
    err as {
      response?: { data?: { code?: string; error?: string; details?: { invite?: Invite } } };
    }
  )?.response?.data;
  if (!res?.code) throw err;
  // The server's own message is used verbatim. It is written for a patient to
  // read ("You can send 10 invitations a day…"), and a second copy of that
  // copy in the app is one more string to keep in step with the email.
  const wrapped = new Error(res.error || 'That did not work — please try again.') as InviteError;
  wrapped.code = res.code as InviteErrorCode;
  if (res.details?.invite) wrapped.existing = res.details.invite;
  throw wrapped;
}

/**
 * Invite an email address to my care circle.
 *
 * The response is IDENTICAL whether or not the address already has an account.
 * That is deliberate and must stay that way: it used to come back 'claimed'
 * only for a hit, which made this endpoint an oracle any entitled patient
 * could use to learn that a named person is a patient of a healthcare product.
 */
export async function sendEmailInvite(input: {
  email: string;
  relationship: InviteRelationship;
  note?: string;
}): Promise<{ invite: Invite; delivered: boolean }> {
  try {
    const res = await apiClient.post<{ data: { invite: Invite; delivered: boolean } }>(
      '/v1/patients/me/social/invites',
      input,
    );
    const d = res.data?.data;
    return { invite: d.invite, delivered: d.delivered === true };
  } catch (err) {
    wrapInviteError(err);
  }
}

/** Invitations I have sent. Withdrawn ones are excluded by the server. */
export async function fetchEmailInvites(): Promise<Invite[]> {
  const res = await apiClient.get<{ data: { invites: Invite[] } }>(
    '/v1/patients/me/social/invites',
  );
  return res.data?.data?.invites ?? [];
}

/**
 * Take an invitation back. The server REMOVEs the token hash, which drops the
 * row out of a sparse GSI and kills the link in mail already delivered.
 *
 * NOT cancelConnection: there is no userId to route through
 * DELETE /connections/:userId, and the invitee may not be a user at all.
 */
export async function withdrawEmailInvite(inviteId: string): Promise<void> {
  try {
    await apiClient.delete(
      `/v1/patients/me/social/invites/${encodeURIComponent(inviteId)}`,
    );
  } catch (err) {
    wrapInviteError(err);
  }
}

// ── invitations addressed to ME (COS-1233) ────────────────────────────

/**
 * COS-1233 — the recipient's half of the double opt-in.
 *
 * Everything above this acts on invitations the caller SENT. These three act on
 * invitations the caller RECEIVED, and they are what makes the feature complete
 * at all: redemption used to be bound to the emailed token at confirm-signup,
 * nothing could carry that token through an app install, and no client ever
 * sent it — so an invited address signed up and nothing was ever claimed.
 *
 * ─── NO EMAIL ADDRESS IN ANY REQUEST ─────────────────────────────────
 *
 * The server resolves the recipient from the caller's own verified profile.
 * There is deliberately no "invitations for <address>" shape to call, because
 * that would be "accept the invitation addressed to anybody".
 *
 * ─── AND NO ENTITLEMENT CHECK IN FRONT OF THEM ────────────────────────
 *
 * None of the three is gated server-side, and that is load-bearing rather than
 * an oversight — so nothing here may add a client-side gate either. A brand-new
 * invitee lands on `starter`, which grants zero find-people.*, connections.* or
 * conversation.* keys, so any gate makes the feature a permanent dead end for
 * exactly the population it exists for. Sending (POST /invites) stays gated on
 * find-people.send-request, unchanged.
 */
export interface ReceivedInvite {
  inviteId: string;
  /**
   * A FIRST NAME, never empty — the server falls back to the literal 'Someone'.
   * There is no inviter email and no inviter id in the payload, by design: the
   * recipient has not connected to this person and may be about to ignore them.
   */
  inviterName: string;
  relationship: InviteRelationship;
  note: string | null;
  sentAt: string;
  expiresAt: string;
}

/**
 * Invitations addressed to my verified address that are still live, newest
 * first.
 *
 * `[]` is the NORMAL answer and means one of three things that must never be
 * rendered differently: no live invitation, OR my profile holds no email at all
 * (Apple relay sign-ups — 13 of 32 production rows), OR the address asked us to
 * stop. Telling those apart is an oracle, so the client does not try.
 */
export async function fetchReceivedInvites(): Promise<ReceivedInvite[]> {
  const res = await apiClient.get<{ data: { invites: ReceivedInvite[] } }>(
    '/v1/patients/me/social/invites/received',
  );
  return res.data?.data?.invites ?? [];
}

/**
 * Accept one. The FIRST of the two consents, not the last.
 *
 * The server claims the invitation AND creates the connection request with ME
 * as the requester, so it lands on the inviter as 'pending-in' for them to
 * confirm. It is therefore NOT an accepted connection and NOT a conversation:
 * it shows up in my own GET /connections?status=pending-out and I cannot finish
 * it myself.
 *
 * `requested:false` means the invitation is spent but nothing reached the
 * inviter, because one of us had declined the other in-app. Propagated rather
 * than swallowed — see lib/received-invite-copy.ts.
 */
export async function acceptReceivedInvite(
  inviteId: string,
): Promise<{ accepted: true; requested: boolean }> {
  try {
    const res = await apiClient.post<{ data: { accepted: true; requested: boolean } }>(
      `/v1/patients/me/social/invites/received/${encodeURIComponent(inviteId)}/accept`,
    );
    return { accepted: true, requested: res.data?.data?.requested === true };
  } catch (err) {
    wrapInviteError(err);
  }
}

/**
 * Ignore one. Terminal, and the inviter is told NOTHING — their list keeps
 * showing an unanswered invitation that expires on its own 14-day clock,
 * because telling them converts a private "no" into a social signal.
 *
 * A second Ignore is a 404 like any other row that is no longer live, so the UI
 * treats INVITE_NOT_FOUND as success-equivalent and simply refreshes.
 */
export async function ignoreReceivedInvite(inviteId: string): Promise<void> {
  try {
    await apiClient.post(
      `/v1/patients/me/social/invites/received/${encodeURIComponent(inviteId)}/ignore`,
    );
  } catch (err) {
    wrapInviteError(err);
  }
}
