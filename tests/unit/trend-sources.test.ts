/**
 * COS-1045 — the source segments shown on Home and on the Trends screen.
 *
 * Shared because two copies would drift: the next person to rename a label or
 * change a colour would find one of them, and the same data would be described
 * two ways on two screens.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrendSources, totalTracked } from '../../lib/trend-sources.ts';

test('THE POINT: a segment is drawn only when its producer returned rows', () => {
  /*
   * The clinic bucket is empty on every stage today. A bar that always drew
   * three colours would imply we track something we do not.
   */
  const s = buildTrendSources({ clinic: 0, checkins: 4, devices: 7 });
  assert.deepEqual(s.map((x) => x.key), ['checkins', 'devices']);
});

test('order is fixed, NOT by size — the bar must not rearrange itself', () => {
  // A bar that reorders as counts change reads as a different bar each time.
  const a = buildTrendSources({ clinic: 1, checkins: 90, devices: 2 });
  const b = buildTrendSources({ clinic: 90, checkins: 1, devices: 2 });
  assert.deepEqual(a.map((x) => x.key), ['clinic', 'checkins', 'devices']);
  assert.deepEqual(b.map((x) => x.key), ['clinic', 'checkins', 'devices']);
});

test('the device label never says "Apple Health"', () => {
  /*
   * On Android the same data is Health Connect, and health-connect.ts
   * mislabels its own rows `source: 'apple-health'` — wrong label, right
   * bucket. "Your devices" is true on both platforms and survives that bug.
   */
  const s = buildTrendSources({ clinic: 0, checkins: 0, devices: 3 });
  assert.equal(s[0].label, 'From your devices');
  assert.ok(!JSON.stringify(s).includes('Apple'));
});

test('all-zero produces NO segments, so the caller can fall back', () => {
  // Rendering an empty bar is worse than rendering none — it looks broken.
  assert.deepEqual(buildTrendSources({ clinic: 0, checkins: 0, devices: 0 }), []);
});

test('negative and non-finite counts are treated as zero, never drawn', () => {
  const s = buildTrendSources({ clinic: -5, checkins: NaN, devices: 2 });
  assert.deepEqual(s.map((x) => x.key), ['devices']);
});

test('totalTracked sums what is actually drawn', () => {
  assert.equal(totalTracked(buildTrendSources({ clinic: 2, checkins: 3, devices: 4 })), 9);
});
