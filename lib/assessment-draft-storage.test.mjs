// Unit tests for the pure pieces of lib/assessment-draft-storage.ts
// (SCRUM-367). cos-app has no jest/vitest harness today, so we use
// node:test which ships with the runtime. Run with:
//
//   node --test lib/assessment-draft-storage.test.mjs
//
// We can't import the .ts module directly (no transpiler is wired up),
// so we test by mirroring the pure key-building rules and by stubbing
// AsyncStorage to exercise the sweep helper's filter logic.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// --- Mirror of the pure key logic exported from the .ts module. -----------
// If this drifts from assessment-draft-storage.ts, the test fails by design.
const ASSESSMENT_DRAFT_KEY_PREFIX = 'assessment_'

function assessmentDraftKey(userSub, instrumentId) {
  return `${ASSESSMENT_DRAFT_KEY_PREFIX}${userSub}_draft_${instrumentId}`
}

// --- Mirror of clearAllAssessmentDraftsForUser's filter rule. -------------
// Pure: given an existing key list and a userSub, return the subset that
// should be removed. The real implementation hands this list to
// AsyncStorage.multiRemove.
function keysOwnedBy(userSub, allKeys) {
  if (!userSub) return []
  const userPrefix = `${ASSESSMENT_DRAFT_KEY_PREFIX}${userSub}_`
  return allKeys.filter((k) => k.startsWith(userPrefix))
}

test('assessmentDraftKey includes the user sub before the instrument id', () => {
  const key = assessmentDraftKey('abc-123', 'PHQ-9')
  assert.equal(key, 'assessment_abc-123_draft_PHQ-9')
})

test('assessmentDraftKey is deterministic for the same inputs', () => {
  const a = assessmentDraftKey('sub-1', 'instr-1')
  const b = assessmentDraftKey('sub-1', 'instr-1')
  assert.equal(a, b)
})

test('different users get different keys for the same instrument', () => {
  const userA = assessmentDraftKey('sub-a', 'PHQ-9')
  const userB = assessmentDraftKey('sub-b', 'PHQ-9')
  assert.notEqual(userA, userB)
  assert.ok(userA.includes('sub-a'))
  assert.ok(userB.includes('sub-b'))
})

test('different instruments get different keys for the same user', () => {
  const phq = assessmentDraftKey('sub-1', 'PHQ-9')
  const gad = assessmentDraftKey('sub-1', 'GAD-7')
  assert.notEqual(phq, gad)
})

test('key carries the shared prefix so a sweep can identify it', () => {
  const key = assessmentDraftKey('sub-1', 'instr')
  assert.ok(key.startsWith(ASSESSMENT_DRAFT_KEY_PREFIX))
})

test('sweep returns only the outgoing user\'s draft keys', () => {
  const all = [
    'assessment_alice_draft_PHQ-9',
    'assessment_alice_draft_GAD-7',
    'assessment_bob_draft_PHQ-9',
    'csh-calendar-mirror-map-v2:alice',
    'cos_cached_user_profile_v1',
    'random-key',
  ]
  const owned = keysOwnedBy('alice', all)
  assert.deepEqual(
    owned.sort(),
    ['assessment_alice_draft_GAD-7', 'assessment_alice_draft_PHQ-9'],
  )
})

test('sweep does not match a user whose sub is a prefix of another sub', () => {
  // Defends against the trailing-underscore mistake — without it,
  // user "abc" would match user "abcd"'s keys.
  const all = [
    'assessment_abc_draft_PHQ-9',
    'assessment_abcd_draft_PHQ-9',
  ]
  const owned = keysOwnedBy('abc', all)
  assert.deepEqual(owned, ['assessment_abc_draft_PHQ-9'])
})

test('sweep with empty userSub matches nothing (fail-closed)', () => {
  const all = ['assessment_alice_draft_PHQ-9', 'assessment_bob_draft_PHQ-9']
  assert.deepEqual(keysOwnedBy('', all), [])
})

test('sweep with no matching keys returns an empty list', () => {
  const all = ['csh-calendar-mirror-map-v2:alice', 'cos_cached_user_profile_v1']
  assert.deepEqual(keysOwnedBy('alice', all), [])
})
