/**
 * COS-1233 — the words on an invitation addressed to YOU.
 *
 * Pure strings, in their own module, for one reason: the sentence after Accept
 * depends on `requested`, and that branch is the only place in this feature
 * where the app can state something untrue.
 *
 * `POST /invites/received/:id/accept` answers `{ accepted: true, requested }`.
 * `requested:false` means the invitation IS spent but NO connection request
 * reached the inviter, because one of the two had already declined the other
 * in-app. So the success path must not say "we've let them know" — it has to
 * say the invitation is closed. Getting that wrong leaves the recipient waiting
 * for a confirmation that can never come, which is the same failure the sender
 * side had with `delivered`.
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
 * On `requested:true` the inviter now holds a request they have to confirm, so
 * the recipient is told to expect a second step rather than a connection.
 * On `requested:false` nothing reached anybody, and saying otherwise would be
 * the app inventing a notification.
 */
export function acceptOutcome(inviterName: string, requested: boolean): string {
  const who = inviterName.trim() || SOMEONE;
  return requested
    ? `Thank you. ${who} will see your request and confirm it.`
    : `That invitation is now closed. No request was sent to ${who}.`;
}

/**
 * The ONE refusal for a missing, expired, already-claimed, already-ignored or
 * somebody-else's invitation. The server returns a single 404 for all five and
 * deliberately does not say which; a client that guessed would turn that into
 * an oracle. A second Ignore lands here too, which is why it reads as a fact
 * about the list rather than as an error.
 */
export const INVITE_GONE = 'That invitation is no longer available.';
