/**
 * COS-1231 — the invite sheet mails whatever address it is given.
 *
 * A mistyped address is not a dead letter here: it tells a stranger, from a
 * healthcare-branded From line, that a named person uses Circle Support
 * Health. There is no recall. So the obvious typos are caught before Send is
 * enabled, and the cases below are the ones a 60+ patient actually produces —
 * a missing @, a trailing word, a space pasted in from a contacts app.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmailFormat, normaliseEmail, MAX_EMAIL_LENGTH } from './email-format.ts';

test('accepts the addresses a patient will actually type', () => {
  for (const ok of [
    'daughter@gmail.com',
    'a.b+tag@sub.example.co.uk',
    "o'brien@example.com",
    '  spaced@example.com  ',
  ]) {
    assert.equal(isValidEmailFormat(ok), true, `${ok} should be accepted`);
  }
});

test('THE POINT: rejects what would otherwise be mailed to nobody', () => {
  for (const bad of [
    '',
    '   ',
    'daughter',
    'daughter@',
    '@gmail.com',
    'daughter@gmail',
    'daughter gmail.com',
    'two addresses@example.com b@example.com',
    'a@b@example.com',
  ]) {
    assert.equal(isValidEmailFormat(bad), false, `${bad} should be rejected`);
  }
});

test('the length cap matches the server, so a long address fails HERE', () => {
  // The route is z.string().max(254). Over that the server answers 422 with a
  // single message covering three different mistakes, which tells the patient
  // nothing about which one they made.
  const local = 'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length);
  assert.equal(isValidEmailFormat(`${local}@example.com`), true);
  assert.equal(isValidEmailFormat(`${local}a@example.com`), false);
});

test('normalisation agrees with the server, so dedupe agrees too', () => {
  // normaliseEmail on the server is trim + toLowerCase, and emailHash is taken
  // from the result. If the client sent a different casing the 409
  // INVITE_ALREADY_PENDING guard would miss and the address would be mailed
  // twice — the one promise the confirmation screen makes in writing.
  assert.equal(normaliseEmail('  Bob@Example.COM '), 'bob@example.com');
});
