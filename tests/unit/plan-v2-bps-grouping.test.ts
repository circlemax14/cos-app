/**
 * Pure-logic tests for BPS domain → unified section key grouping
 * (COS-475). Node-testable — no RN imports pulled in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bpsDomainToSectionKey,
  BPS_SECTION_ORDER,
  groupByBps,
  sectionKeyToPrimaryDomain,
} from '../../lib/plan-v2/bps-grouping.ts';

test('bio → biological', () => {
  assert.equal(bpsDomainToSectionKey('bio'), 'biological');
});

test('psy → psychological', () => {
  assert.equal(bpsDomainToSectionKey('psy'), 'psychological');
});

test('soc and spi both → socialSpiritual (merged bucket)', () => {
  assert.equal(bpsDomainToSectionKey('soc'), 'socialSpiritual');
  assert.equal(bpsDomainToSectionKey('spi'), 'socialSpiritual');
});

test('unknown domain returns null (does NOT throw)', () => {
  // @ts-expect-error — intentional runtime unknown value
  assert.equal(bpsDomainToSectionKey('xyz'), null);
});

test('groupByBps preserves input order within each bucket', () => {
  const rows = [
    { id: 'a', d: 'bio' as const },
    { id: 'b', d: 'psy' as const },
    { id: 'c', d: 'bio' as const },
    { id: 'd', d: 'soc' as const },
    { id: 'e', d: 'spi' as const },
    { id: 'f', d: 'psy' as const },
  ];
  const grouped = groupByBps(rows, (r) => r.d);
  assert.deepEqual(grouped.biological.map((r) => r.id), ['a', 'c']);
  assert.deepEqual(grouped.psychological.map((r) => r.id), ['b', 'f']);
  assert.deepEqual(grouped.socialSpiritual.map((r) => r.id), ['d', 'e']);
});

test('groupByBps drops unknown domains silently', () => {
  const rows = [
    { id: 'a', d: 'bio' as const },
    // @ts-expect-error — runtime unknown value
    { id: 'x', d: 'wat' },
  ];
  const grouped = groupByBps(rows, (r) => r.d);
  assert.deepEqual(grouped.biological.map((r) => r.id), ['a']);
  assert.equal(grouped.psychological.length, 0);
  assert.equal(grouped.socialSpiritual.length, 0);
});

test('BPS_SECTION_ORDER is canonical bio → psy → soc', () => {
  assert.deepEqual([...BPS_SECTION_ORDER], [
    'biological',
    'psychological',
    'socialSpiritual',
  ]);
});

test('sectionKeyToPrimaryDomain rounds trip', () => {
  assert.equal(sectionKeyToPrimaryDomain('biological'), 'bio');
  assert.equal(sectionKeyToPrimaryDomain('psychological'), 'psy');
  assert.equal(sectionKeyToPrimaryDomain('socialSpiritual'), 'soc');
});
