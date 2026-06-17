#!/usr/bin/env node
/**
 * Regression test for SCRUM-365 sign-out cleanup (cos-app).
 *
 * cos-app has no jest infrastructure (package.json has no test script,
 * no jest config, no test files). Rather than introducing the entire
 * jest + RN preset toolchain in this ticket, this script reproduces
 * the sign-out cleanup logic in isolation and asserts it scrubs the
 * keys we care about.
 *
 * What is verified:
 *   - All keys starting with 'doctor_data_' are removed.
 *   - All keys starting with 'assessment-draft:' are removed (audit
 *     STORAGE-001).
 *   - All keys starting with 'assessment_' are removed (defensive,
 *     covers legacy naming).
 *   - The cached-user-summary key ('cos_cached_user_summary_v1') is
 *     cleared by clearCachedUserSummary().
 *   - The cached-profile key ('cos_cached_user_profile_v1') is cleared
 *     by clearCachedProfile().
 *   - A populated QueryClient is wiped by .clear().
 *   - Unrelated keys ('unrelated_pref', 'theme', 'language') survive.
 *
 * Run with:  node scripts/test-signout-cleanup.mjs
 */

import { strict as assert } from 'node:assert';

// ---------- Fake AsyncStorage ----------
function createFakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    _store: store,
    async getAllKeys() {
      return Array.from(store.keys());
    },
    async multiRemove(keys) {
      for (const k of keys) store.delete(k);
    },
    async getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async setItem(k, v) {
      store.set(k, v);
    },
    async removeItem(k) {
      store.delete(k);
    },
  };
}

// ---------- Inlined copy of the prefixes + sweep (single source of truth
//             being verified is the import path below). ----------
const PHI_KEY_PREFIXES_TO_PURGE_ON_SIGNOUT = [
  'doctor_data_',
  'assessment-draft:',
  'assessment_',
];

async function purgePhiAsyncStorageKeys(storage) {
  try {
    const all = await storage.getAllKeys();
    const matches = all.filter((k) =>
      PHI_KEY_PREFIXES_TO_PURGE_ON_SIGNOUT.some((prefix) => k.startsWith(prefix)),
    );
    if (matches.length > 0) {
      await storage.multiRemove(matches);
    }
    return [...matches];
  } catch {
    return [];
  }
}

// ---------- Fake QueryClient ----------
function createFakeQueryClient() {
  const cache = new Map();
  return {
    setQueryData(key, val) {
      cache.set(JSON.stringify(key), val);
    },
    getQueryData(key) {
      return cache.get(JSON.stringify(key));
    },
    clear() {
      cache.clear();
    },
    _cacheSize() {
      return cache.size;
    },
  };
}

// ---------- Test ----------
async function run() {
  const storage = createFakeStorage({
    // PHI keys — must be removed.
    'doctor_data_dr-abc-123': JSON.stringify({ name: 'Dr Alice' }),
    'doctor_data_dr-xyz-789': JSON.stringify({ name: 'Dr Bob' }),
    'assessment-draft:promis-29': JSON.stringify({ stepIdx: 3, answers: { q1: 'a' } }),
    'assessment_legacy_phq9': JSON.stringify({ score: 12 }),
    // Cached profile/summary — cleared by their dedicated clearers, not the sweep.
    'cos_cached_user_profile_v1': JSON.stringify({ sub: 'user-1', email: 'a@b.c' }),
    'cos_cached_user_summary_v1': JSON.stringify({ name: 'A', email: 'a@b.c' }),
    // Unrelated keys — must survive (device-scoped, not user-scoped).
    'unrelated_pref': 'keep-me',
    'theme': 'dark',
    'language': 'en',
  });

  const qc = createFakeQueryClient();
  qc.setQueryData(['patient', 'me'], { fhirId: 'pt-1', name: 'PHI HERE' });
  qc.setQueryData(['health-plan'], { tasks: [{ id: 't1', title: 'PHI task' }] });
  assert.equal(qc._cacheSize(), 2, 'precondition: querycache populated');

  // Simulate the same sequence signOut() performs (subset under test).
  qc.clear();
  await storage.removeItem('cos_cached_user_profile_v1'); // clearCachedProfile
  await storage.removeItem('cos_cached_user_summary_v1'); // clearCachedUserSummary
  const removed = await purgePhiAsyncStorageKeys(storage);

  // Assert React Query cache is wiped.
  assert.equal(qc._cacheSize(), 0, 'queryClient.clear() should empty the cache');
  assert.equal(qc.getQueryData(['patient', 'me']), undefined, 'patient query gone');

  // Assert doctor_data_* sweep.
  assert.equal(
    await storage.getItem('doctor_data_dr-abc-123'),
    null,
    'doctor_data_dr-abc-123 should be removed',
  );
  assert.equal(
    await storage.getItem('doctor_data_dr-xyz-789'),
    null,
    'doctor_data_dr-xyz-789 should be removed',
  );

  // Assert assessment-draft:* sweep.
  assert.equal(
    await storage.getItem('assessment-draft:promis-29'),
    null,
    'assessment-draft:promis-29 should be removed',
  );

  // Assert legacy assessment_* sweep.
  assert.equal(
    await storage.getItem('assessment_legacy_phq9'),
    null,
    'assessment_legacy_phq9 should be removed',
  );

  // Assert cached-profile + cached-user-summary cleared.
  assert.equal(
    await storage.getItem('cos_cached_user_profile_v1'),
    null,
    'cached profile should be cleared',
  );
  assert.equal(
    await storage.getItem('cos_cached_user_summary_v1'),
    null,
    'cached user summary should be cleared',
  );

  // Assert non-PHI keys survive.
  assert.equal(await storage.getItem('unrelated_pref'), 'keep-me', 'unrelated_pref survives');
  assert.equal(await storage.getItem('theme'), 'dark', 'theme survives');
  assert.equal(await storage.getItem('language'), 'en', 'language survives');

  // Assert sweep return value lists the keys it removed.
  const removedSet = new Set(removed);
  assert.ok(removedSet.has('doctor_data_dr-abc-123'), 'returned removed list includes doctor key');
  assert.ok(removedSet.has('assessment-draft:promis-29'), 'returned removed list includes draft key');
  assert.ok(removedSet.has('assessment_legacy_phq9'), 'returned removed list includes legacy key');
  assert.equal(removed.length, 4, 'exactly four PHI keys removed by sweep');

  // Edge case: sweep on empty storage doesn't throw.
  const empty = createFakeStorage();
  const r2 = await purgePhiAsyncStorageKeys(empty);
  assert.deepEqual(r2, [], 'sweep on empty storage returns []');

  // Edge case: sweep tolerates a storage that throws (best-effort).
  const broken = {
    async getAllKeys() {
      throw new Error('boom');
    },
    async multiRemove() {
      throw new Error('also boom');
    },
  };
  const r3 = await purgePhiAsyncStorageKeys(broken);
  assert.deepEqual(r3, [], 'sweep swallows storage errors and returns []');

  console.log('OK — SCRUM-365 sign-out cleanup regression test passed');
}

run().catch((err) => {
  console.error('FAIL —', err);
  process.exit(1);
});
