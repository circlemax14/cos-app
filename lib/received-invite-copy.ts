/**
 * COS-1233 — the words on an invitation addressed to YOU.
 *
 * Pure strings, in their own module, for one reason: the sentence after Accept
 * depends on `requested`, and that branch is the only place in this feature
 * where the app can state something untrue.
 *
 * `POST /invites/received/:id/accept` answers
 * `{ accepted: true, requested, connected }`. `requested:false` means the
 * invitation IS spent but NO connection request reached the inviter, because one of
 * the two had already declined the other in-app. So the success path must not say
 * "we've let them know" — it has to say the invitation is closed. Getting that
 * wrong leaves the recipient waiting for a confirmation that can never come, which
 * is the same failure the sender side had with `delivered`.
 *
 * COS-1235 adds `connected`, for the case where the inviter had already sent an
 * in-app request: both people have acted, so there is no second step left and
 * saying there is leaves somebody waiting again. It also adds the INVITER's side of
 * the same problem — see incomingRequestLine.
 *
 * Kept free of react-native so `node --test` can load it and assert both
 * branches without a renderer. See lib/received-invite-copy.test.mjs.
 */

/**
 * How the sender said they know you, as a clause.
 *
 * `Record<string, string>` and not the InviteRelationship union on purpose:
 * that type lives in services/api/conversations.ts, whose import graph reaches
 * react-native through api-client, and dragging it in here would make this
 * module unloadable by the test runner. The caller passes the union, so the
 * compiler still checks the call site; the `??` below covers a relationship the
 * server grows later, which is a missing clause rather than a missing sentence.
 */
export const RELATIONSHIP_PHRASE: Record<string, string> = {
  family: 'as family',
  friend: 'as a friend',
  carer: 'as a carer',
  clinician: 'as a clinician',
};

/** A sender with no first name on file: the server already falls back to this. */
const SOMEONE = 'Someone';

/**
 * One sentence naming who invited you and how they know you.
 *
 * "their care circle" rather than his/her: the payload carries a FIRST NAME and
 * nothing else, by design — no inviter email, no id, no gender.
 */
export function invitationLine(inviterName: string, relationship: string): string {
  const who = inviterName.trim() || SOMEONE;
  const phrase = RELATIONSHIP_PHRASE[relationship];
  return phrase
    ? `${who} invited you to their care circle, ${phrase}.`
    : `${who} invited you to their care circle.`;
}

/**
 * What to say after Accept — and the whole reason this module exists.
 *
 * THREE outcomes, because the server reports three and only one of them is the
 * ordinary one:
 *
 *   requested — the inviter now holds a request they have to confirm, so the
 *     recipient is told to expect a second step rather than a connection.
 *   connected (COS-1235) — the inviter had ALREADY sent an in-app request, so both
 *     people had acted and accepting completed it. There is nothing left to
 *     confirm, and "they will confirm it" would leave the recipient waiting for a
 *     step that will never happen. This case used to be a dead end that reported
 *     the ordinary sentence while the server wrote nothing at all.
 *   neither — one of the two had declined the other in-app, so nothing reached
 *     anybody. Saying otherwise would be the app inventing a notification.
 */
export function acceptOutcome(
  inviterName: string,
  requested: boolean,
  connected = false,
): string {
  const who = inviterName.trim() || SOMEONE;
  if (connected) return `You are now connected with ${who}.`;
  return requested
    ? `Thank you. ${who} will see your request and confirm it.`
    : `That invitation is now closed. No request was sent to ${who}.`;
}

/**
 * ─── COS-1235: THE SECOND CONSENT HAD NO NAME ON IT ──────────────────
 *
 * The inviter's incoming-request row. Accepting an emailed invitation creates the
 * request with the RECIPIENT as requester, so the INVITER is the one being asked
 * to confirm — and the list said "Someone would like to connect", with no name, for
 * a person they had invited by email minutes earlier. They could not tell it was
 * the right person, which is the entire job of a second consent.
 *
 * `displayName` is NOT enough on its own and `invitedEmail` is not decoration: the
 * users row only carries a displayName once somebody turns discoverability on, so
 * a brand-new invitee has none — and the address is what the inviter typed, which
 * makes it both guaranteed to be there and the only identifier they ever had.
 *
 * A STRANGER'S REQUEST STAYS ANONYMOUS, and that is the server's decision, not
 * this function's: neither field is populated for a peer the caller did not invite.
 * So "both absent" has to keep reading as the original sentence.
 */
export function incomingRequestLine(peer: {
  displayName?: string;
  invitedEmail?: string;
}): string {
  const named = peer.displayName?.trim() || peer.invitedEmail?.trim();
  return named ? `${named} would like to connect` : 'Someone would like to connect';
}

/**
 * The second line on that row: WHY it is there, which is the thing that lets the
 * inviter recognise it. Null for a stranger, who has no "why" we may disclose.
 *
 * The address is repeated here when we also have a name, because "Ruth Adams"
 * alone does not tell the inviter which of the addresses they typed this is.
 */
export function incomingRequestReason(peer: {
  displayName?: string;
  invitedEmail?: string;
}): string | null {
  const email = peer.invitedEmail?.trim();
  if (!email) return null;
  return peer.displayName?.trim()
    ? `Accepted your invitation to ${email}`
    : 'Accepted your invitation';
}

/**
 * The ONE refusal for a missing, expired, already-claimed, already-ignored or
 * somebody-else's invitation. The server returns a single 404 for all five and
 * deliberately does not say which; a client that guessed would turn that into
 * an oracle. A second Ignore lands here too, which is why it reads as a fact
 * about the list rather than as an error.
 */
export const INVITE_GONE = 'That invitation is no longer available.';
