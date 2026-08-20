/**
 * COS-734 — whether to trust the server's plan-type card copy.
 *
 * This copy sits on the screen where a patient chooses their assessment
 * intensity, and that choice drives real clinical behaviour: screener depth and
 * assessment expiry.
 *
 * The failure mode worth being strict about is a PARTIAL list. Three options
 * where there should be four is invisible to the patient — they pick the
 * closest, never learn a fourth existed, nothing errors, and the wrong clinical
 * intensity becomes their setting. "Renders something" is not good enough here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectCards } from '../../lib/plan-type-card-select.ts';

const EMBEDDED = [
  { type: 'basic', title: 'Basic' },
  { type: 'advanced', title: 'Advanced' },
] as const;

const full = (type: string, title: string) => ({
  type,
  title,
  description: 'd',
  assessmentLevel: 'light',
  icon: 'i',
  features: { assessment: 'a', updates: 'u', support: 's', bestFor: 'b' },
});

test('complete, valid server copy is used', () => {
  const out = selectCards([full('basic', 'Starter'), full('advanced', 'Pro')], EMBEDDED) as { title: string }[];
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Starter');
});

test('THE POINT: a PARTIAL list falls back wholesale', () => {
  assert.deepEqual(selectCards([full('basic', 'Starter')], EMBEDDED), EMBEDDED);
});

test('THE POINT: the server cannot introduce an unknown plan type', () => {
  // `type` is a clinical enum — an unrecognised card would be a choice no
  // backend logic understands.
  assert.deepEqual(selectCards([full('basic', 'A'), full('premium', 'B')], EMBEDDED), EMBEDDED);
});

test('an invalid assessmentLevel is rejected — it drives screener depth', () => {
  const broken = { ...full('advanced', 'Pro'), assessmentLevel: 'extreme' };
  assert.deepEqual(selectCards([full('basic', 'A'), broken], EMBEDDED), EMBEDDED);
});

test('a card missing any rendered field falls back, rather than showing a blank line', () => {
  for (const field of ['title', 'description', 'icon'] as const) {
    const broken = { ...full('advanced', 'Pro'), [field]: '' };
    assert.deepEqual(selectCards([full('basic', 'A'), broken], EMBEDDED), EMBEDDED, field);
  }
});

test('a blank nested feature line falls back too', () => {
  const broken = { ...full('advanced', 'Pro'), features: { assessment: '', updates: 'u', support: 's', bestFor: 'b' } };
  assert.deepEqual(selectCards([full('basic', 'A'), broken], EMBEDDED), EMBEDDED);
});

test('whitespace does not count as content', () => {
  const broken = { ...full('advanced', 'Pro'), title: '   ' };
  assert.deepEqual(selectCards([full('basic', 'A'), broken], EMBEDDED), EMBEDDED);
});

test('anything that is not an array falls back', () => {
  for (const raw of [undefined, null, 'nope', 42, {}]) {
    assert.deepEqual(selectCards(raw, EMBEDDED), EMBEDDED, String(raw));
  }
});

test('an empty array falls back — never render a chooser with no choices', () => {
  assert.deepEqual(selectCards([], EMBEDDED), EMBEDDED);
});

test('duplicates cannot pad a short list past the length check', () => {
  // Two valid cards of the SAME type would satisfy a naive count.
  assert.deepEqual(selectCards([full('basic', 'A'), full('basic', 'B')], EMBEDDED), EMBEDDED);
});

test('server order does not override the embedded ladder', () => {
  // A Scan has no guaranteed order, and the ladder is meaningful — basic must
  // stay first even if the server returns advanced first.
  const out = selectCards([full('advanced', 'Pro'), full('basic', 'Starter')], EMBEDDED) as { type: string }[];
  assert.deepEqual(out.map((c) => c.type), ['basic', 'advanced']);
});
