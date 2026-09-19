/**
 * COS-1060 — the chat frame guard.
 *
 * Everything arriving on a WebSocket is attacker-shaped until proven
 * otherwise. This narrowing is the only thing between a frame and a
 * query-cache invalidation, and the dangerous failure is not a crash — it is
 * a frame with no conversationId invalidating EVERY conversation key instead
 * of one, which looks like the feature working while doing far more work.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * Read the guard as text and evaluate it in isolation: the hook imports React
 * Native, which `node --test` cannot load (see cos-app CLAUDE.md). Stripping
 * the TS signature is the same trick used by the score-ring test.
 */
const src = readFileSync(new URL('../../hooks/use-chat-sync.ts', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function isChatMessageFrame'));
const raw = body.slice(0, body.indexOf('\n}') + 2);
const fnSrc = ['function isChatMessageFrame(value) {', ...raw.split('\n').slice(1)]
  .join('\n')
  // Strip TS type assertions from the body — `new Function` parses JavaScript.
  .replace(/ as Record<string, unknown>/g, '')
  .replace(/ as [A-Za-z<>[\], |]+/g, '');
const isChatMessageFrame = new Function(`${fnSrc}; return isChatMessageFrame;`)() as (
  v: unknown,
) => boolean;

const valid = {
  type: 'CHAT_MESSAGE',
  v: 1,
  conversationId: 'conv-1',
  messageId: 'm-1',
  senderId: 's-1',
  at: '2026-09-19T10:00:00Z',
};

test('THE POINT: a well-formed frame is accepted', () => {
  assert.equal(isChatMessageFrame(valid), true);
});

test('THE POINT: a frame with no conversationId is refused', () => {
  /*
   * This is the one that matters. Without the check, `invalidateQueries({
   * queryKey: ['conversation-messages', undefined] })` matches the PREFIX and
   * invalidates every conversation the client has cached — every thread
   * refetches on every message, and it looks like it is working.
   */
  assert.equal(isChatMessageFrame({ ...valid, conversationId: undefined }), false);
  assert.equal(isChatMessageFrame({ ...valid, conversationId: '' }), false);
  assert.equal(isChatMessageFrame({ ...valid, conversationId: 123 }), false);
});

test('another payload type on the same socket is ignored', () => {
  // All three sync hooks share one endpoint, so each sees the others' frames.
  assert.equal(isChatMessageFrame({ type: 'ENTITLEMENTS_CHANGED', v: 1 }), false);
  assert.equal(isChatMessageFrame({ type: 'HEALTH_DATA_CHANGED', v: 1, kinds: [] }), false);
});

test('null, undefined and primitives do not throw', () => {
  for (const bad of [null, undefined, 0, '', 'CHAT_MESSAGE', [], true]) {
    assert.equal(isChatMessageFrame(bad), false);
  }
});

test('a missing version is refused — the envelope is part of the contract', () => {
  assert.equal(isChatMessageFrame({ ...valid, v: undefined }), false);
  assert.equal(isChatMessageFrame({ ...valid, v: '1' }), false);
});

test('THE POINT: the frame carries no body, and the guard does not expect one', () => {
  /*
   * The server sends ids only, on purpose — a frame goes to whatever
   * connection id is on file, so a fan-out bug would disclose the message
   * rather than an id. If this guard ever starts REQUIRING a body, someone has
   * put message text back on the wire.
   */
  assert.equal(isChatMessageFrame(valid), true);
  assert.ok(!Object.keys(valid).includes('body'));
  assert.doesNotMatch(raw, /body|text|preview/);
});
