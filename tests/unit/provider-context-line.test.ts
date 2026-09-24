/**
 * COS-1114 — the provider row must show what the filter acted on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLastSeen, providerContextLine } from '../../lib/provider-context-line.ts';

test('THE POINT: a treated provider states when and how often', () => {
  const line = providerContextLine({
    lastSeenAt: '2025-03-14T00:00:00Z',
    treatedCount: 4,
    involvement: 'treated',
  });
  assert.match(line ?? '', /Last seen/);
  assert.match(line ?? '', /4 visits/);
});

test('singular visit is not "1 visits"', () => {
  assert.match(providerContextLine({ lastSeenAt: '2025-03-14T00:00:00Z', treatedCount: 1 }) ?? '', /1 visit(?!s)/);
});

test('a provider we know nothing about gets NO line, not a placeholder', () => {
  // Ken's export has 25 providers from dead connections and many with no
  // dates at all. "No visits recorded" on every row would bury the rows that
  // do carry evidence — COS-1101 already says that once, at the top.
  assert.equal(providerContextLine({}), null);
  assert.equal(providerContextLine({ lastSeenAt: null, treatedCount: 0 }), null);
});

test('a merely-mentioned provider is described honestly', () => {
  // An anaesthetist on an operation note, a radiologist who read one scan.
  // Explains their presence without implying a relationship.
  assert.equal(providerContextLine({ involvement: 'mentioned' }), 'Named on your records');
});

test('a mentioned provider WITH dated evidence prefers the evidence', () => {
  const line = providerContextLine({
    lastSeenAt: '2024-11-02T00:00:00Z',
    treatedCount: 2,
    involvement: 'mentioned',
  });
  assert.match(line ?? '', /Last seen/);
  assert.doesNotMatch(line ?? '', /Named on/);
});

test('an unparseable date is dropped, never rendered as Invalid Date', () => {
  assert.equal(formatLastSeen('not-a-date'), null);
  assert.equal(formatLastSeen(''), null);
  assert.equal(formatLastSeen(null), null);
  assert.equal(providerContextLine({ lastSeenAt: 'not-a-date', treatedCount: 0 }), null);
});

test('month precision only — a day implies confidence we do not have', () => {
  const s = formatLastSeen('2025-03-14T00:00:00Z') ?? '';
  assert.match(s, /2025/);
  assert.doesNotMatch(s, /14/);
});
