/**
 * COS-1236 — the two things that sent a patient to the wrong screen.
 *
 * 1. Back from Find people landed on HOME. The screen is pushed inside the
 *    Inbox tab's stack, so `router.back()` pops to that tab's initial route and
 *    there was no param saying otherwise. Asserted at runtime because the fix
 *    is a decision, not a string: the allowlist has to send 'inbox' to the
 *    inbox and still send everything else where it went before.
 *
 * 2. The Inbox icon has to land IN the invite sheet. The panel takes no props
 *    and cannot read route params, so the intent travels through module scope —
 *    which makes the read-ONCE property the thing worth testing: a note that
 *    survived its navigation would open the invite form the next time anybody
 *    opened the Supports modal for any other reason.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  socialReturnHref,
  requestInviteSheet,
  consumeInviteSheetIntent,
} from './social-nav.ts';

describe('socialReturnHref', () => {
  test('THE POINT: a screen opened from the Inbox goes BACK to the Inbox', () => {
    assert.equal(socialReturnHref('inbox'), '/Home/inbox');
  });

  test('nothing named keeps the historic destination', () => {
    // An older deep link, a notification tap, or a caller that says nothing.
    assert.equal(socialReturnHref(undefined), '/Home');
    assert.equal(socialReturnHref(''), '/Home');
  });

  test('an arbitrary pathname is NOT honoured — the switch is an allowlist', () => {
    // COS-1186's rule. A Back button that follows a pathname out of a shared
    // link is an open redirect with a friendly label on it.
    assert.equal(socialReturnHref('/Home/conversation?id=someone-elses'), '/Home');
    assert.equal(socialReturnHref('https://example.com'), '/Home');
  });
});

describe('the invite intent is read exactly once', () => {
  test('nothing asked for it, so nothing is claimed', () => {
    assert.equal(consumeInviteSheetIntent(), false);
  });

  test('THE POINT: asked for, delivered once, then gone', () => {
    requestInviteSheet();
    assert.equal(consumeInviteSheetIntent(), true);
    // The second mount is somebody opening Supports for an unrelated reason.
    assert.equal(consumeInviteSheetIntent(), false);
  });

  test('asking twice before a read is still one sheet, not a queue', () => {
    requestInviteSheet();
    requestInviteSheet();
    assert.equal(consumeInviteSheetIntent(), true);
    assert.equal(consumeInviteSheetIntent(), false);
  });
});
