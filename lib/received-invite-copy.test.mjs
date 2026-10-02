/**
 * COS-1233 — the recipient must never be told something that did not happen.
 *
 * `POST /invites/received/:id/accept` returns `{ accepted: true, requested }`,
 * and `requested:false` is a real production state: when either party had
 * declined the other in-app the server honours that, writes no connection
 * request, and still spends the invitation. A success screen that reads the
 * same either way tells somebody their request is with the inviter when nothing
 * reached them — and they will wait for a confirmation that cannot come.
 *
 * That is the sender-side `delivered` bug one screen over, and it is the exact
 * copy this epic's review found false twice. So both branches are asserted
 * here, at runtime, rather than as source text.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  invitationLine,
  acceptOutcome,
  incomingRequestLine,
  incomingRequestReason,
  RELATIONSHIP_PHRASE,
  INVITE_GONE,
} from './received-invite-copy.ts';

describe('acceptOutcome', () => {
  test('THE POINT: requested:false never claims the inviter was told', () => {
    const closed = acceptOutcome('Barbara', false);
    assert.match(closed, /closed/);
    assert.ok(
      !/will see|let them know|notified|sent you|waiting for/i.test(closed),
      `requested:false must not imply the inviter heard anything: ${closed}`,
    );
  });

  test('requested:true names the second consent, not a connection', () => {
    const sent = acceptOutcome('Barbara', true);
    assert.match(sent, /Barbara/);
    assert.match(sent, /confirm/);
    // "You are now connected" would be wrong: accepting an invitation creates
    // the recipient's own 'pending-out' row, which only the inviter can finish.
    assert.ok(!/connected/i.test(sent), `accepting is not a connection yet: ${sent}`);
  });

  test('the two branches are not the same sentence', () => {
    assert.notEqual(acceptOutcome('Barbara', true), acceptOutcome('Barbara', false));
  });

  test("a sender with no first name still produces a sentence", () => {
    for (const blank of ['', '   ']) {
      for (const requested of [true, false]) {
        const line = acceptOutcome(blank, requested);
        assert.match(line, /Someone/);
        assert.ok(!/undefined|null|\s{2}/.test(line), `ragged copy: ${line}`);
      }
    }
  });
});

describe('invitationLine', () => {
  test('every relationship the server can send has a readable clause', () => {
    // The union on the wire. A missing entry here is a sentence that reads
    // "invited you to their care circle, as undefined."
    for (const r of ['family', 'friend', 'carer', 'clinician']) {
      const line = invitationLine('Barbara', r);
      assert.match(line, /^Barbara invited you to their care circle, as /);
      assert.ok(line.endsWith('.'), `no full stop: ${line}`);
      assert.ok(!/undefined/.test(line), `missing clause for ${r}: ${line}`);
      assert.equal(typeof RELATIONSHIP_PHRASE[r], 'string');
    }
  });

  test('a relationship we do not know drops the CLAUSE, not the sentence', () => {
    const line = invitationLine('Barbara', 'colleague');
    assert.equal(line, 'Barbara invited you to their care circle.');
  });

  test('no gendered pronoun — the payload carries a first name and nothing else', () => {
    for (const r of ['family', 'friend', 'carer', 'clinician']) {
      assert.ok(
        !/\b(his|her|hers|he|she)\b/i.test(invitationLine('Barbara', r)),
        'the server sends no gender, so the copy cannot assume one',
      );
    }
  });

  test('an empty inviterName falls back the same way the server does', () => {
    assert.equal(invitationLine('  ', 'friend'), 'Someone invited you to their care circle, as a friend.');
  });
});

test('the single refusal reads as a fact, not as an error', () => {
  // One 404 covers missing, expired, claimed, ignored and somebody else's id,
  // and a second Ignore lands here too. The copy must fit all five.
  assert.match(INVITE_GONE, /no longer available/);
  assert.ok(!/error|failed|invalid/i.test(INVITE_GONE), INVITE_GONE);
});

/*
 * ─── COS-1235: THE OTHER SIDE OF THE SAME BUG ────────────────────────
 *
 * Accepting creates the request with the RECIPIENT as requester, so the INVITER is
 * the one asked to confirm — and the row said "Someone would like to connect", with
 * no name, about a person they had invited BY EMAIL minutes earlier. They could not
 * tell it was the right person, which is the whole job of a second consent.
 *
 * The fix must NOT name a stranger. That hydration is one-sided on the server for a
 * reason: naming somebody who wrote to you out of the blue is a disclosure you never
 * asked for, while naming the person you yourself invited is your own input coming
 * back. So the "nothing populated" case has to keep reading exactly as before.
 */
describe('incomingRequestLine', () => {
  test('THE POINT: a stranger is still anonymous', () => {
    assert.equal(incomingRequestLine({}), 'Someone would like to connect');
    assert.equal(incomingRequestReason({}), null);
  });

  test('names the invitee by display name when there is one', () => {
    const peer = { displayName: 'Ruth Adams', invitedEmail: 'ruth@example.com' };
    assert.equal(incomingRequestLine(peer), 'Ruth Adams would like to connect');
    // ...and still shows WHICH address, because a name alone does not say which of
    // the invitations the inviter sent this answers.
    assert.equal(incomingRequestReason(peer), 'Accepted your invitation to ruth@example.com');
  });

  test('falls back to the ADDRESS, which is the only identifier guaranteed to exist', () => {
    // `displayName` is written in exactly one place (a discoverability opt-in), so a
    // brand-new invitee has none — the population this feature is for.
    const peer = { invitedEmail: 'ruth@example.com' };
    assert.equal(incomingRequestLine(peer), 'ruth@example.com would like to connect');
    assert.equal(incomingRequestReason(peer), 'Accepted your invitation');
  });

  test('blank strings are not a name — they fall back, they do not render empty', () => {
    assert.equal(incomingRequestLine({ displayName: '  ' }), 'Someone would like to connect');
    assert.equal(
      incomingRequestLine({ displayName: '   ', invitedEmail: 'r@e.com' }),
      'r@e.com would like to connect',
    );
    assert.equal(incomingRequestReason({ invitedEmail: '  ' }), null);
  });
});

describe('acceptOutcome — the third outcome (COS-1235)', () => {
  test('connected says they are connected, and asks them to wait for nothing', () => {
    const line = acceptOutcome('Barbara', true, true);
    assert.match(line, /connected/i);
    assert.match(line, /Barbara/);
    // The dead end this replaces: the server wrote nothing and the screen said the
    // inviter would confirm a request that did not exist.
    assert.ok(!/confirm|will see/i.test(line), `nothing is left to confirm: ${line}`);
  });

  test('all three outcomes are different sentences', () => {
    const lines = new Set([
      acceptOutcome('Barbara', true, true),
      acceptOutcome('Barbara', true, false),
      acceptOutcome('Barbara', false, false),
    ]);
    assert.equal(lines.size, 3);
  });

  test('the default is the ordinary request, so an older call site is unchanged', () => {
    assert.equal(acceptOutcome('Barbara', true), acceptOutcome('Barbara', true, false));
  });
});
