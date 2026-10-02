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
