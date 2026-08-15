/**
 * Crisis support decisions.
 *
 * The asymmetry that governs every case here: showing a helpline to someone
 * who did not need it costs a card they scroll past. Not showing it to someone
 * who did is not comparable. Where a rule is arguable, these tests pin the
 * over-offering side on purpose.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CRISIS_RESOURCES,
  crisisResourceUrl,
  isHeavySubject,
  shouldOfferImmediateSupport,
  shouldOfferSupportOnResult,
} from './crisis-support.ts'

// ── the live gap this exists to close ───────────────────────────────────────

test('THE POINT: endorsing PHQ-9 q9 offers support immediately', () => {
  assert.equal(shouldOfferImmediateSupport('phq-9', 'q9', 1), true)
})

test('"Several days" counts — not just "nearly every day"', () => {
  // 1..3 are the PHQ frequency values above "Not at all".
  for (const v of [1, 2, 3]) {
    assert.equal(shouldOfferImmediateSupport('phq-9', 'q9', v), true, `value ${v}`)
  }
})

test('"Not at all" does not', () => {
  assert.equal(shouldOfferImmediateSupport('phq-9', 'q9', 0), false)
})

test('unanswered does not — undefined is not an endorsement', () => {
  assert.equal(shouldOfferImmediateSupport('phq-9', 'q9', undefined), false)
  assert.equal(shouldOfferImmediateSupport('phq-9', 'q9', null), false)
})

test('non-numeric junk does not fire it', () => {
  // A malformed draft must not produce a false alarm on an unrelated screen.
  for (const v of ['1', {}, [], NaN, true]) {
    assert.equal(shouldOfferImmediateSupport('phq-9', 'q9', v), false)
  }
})

test('other PHQ-9 items do not fire it', () => {
  // q2 is low mood. Real, and not this.
  assert.equal(shouldOfferImmediateSupport('phq-9', 'q2', 3), false)
})

test('an unrelated instrument with a q9 does not fire it', () => {
  // ACE q9 asks whether a HOUSEHOLD MEMBER attempted suicide — somebody else,
  // decades ago. Treating that as present danger would be wrong, and would
  // teach patients this app over-reacts.
  assert.equal(shouldOfferImmediateSupport('ace', 'q9', 1), false)
  assert.equal(shouldOfferImmediateSupport('brief-cope', 'q9', 4), false)
})

// ── results ─────────────────────────────────────────────────────────────────

test('a high-severity band offers support', () => {
  assert.equal(
    shouldOfferSupportOnResult({ instrumentId: 'phq-9', severity: 'high' }),
    true,
  )
})

test('THE DEAD FIELD: any careAction offers support', () => {
  // careAction has been written to every record and read by nothing.
  assert.equal(
    shouldOfferSupportOnResult({ instrumentId: 'falls-12', careAction: 'care-team-check-in' }),
    true,
  )
})

test('careAction matching is not a hardcoded string list', () => {
  // A new careAction seeded next month must not silently do nothing.
  assert.equal(
    shouldOfferSupportOnResult({ instrumentId: 'x', careAction: 'something-nobody-wrote-yet' }),
    true,
  )
})

test('an empty or whitespace careAction is not a careAction', () => {
  assert.equal(shouldOfferSupportOnResult({ instrumentId: 'x', careAction: '' }), false)
  assert.equal(shouldOfferSupportOnResult({ instrumentId: 'x', careAction: '   ' }), false)
})

test('the endorsement is remembered at the result, even on a low band', () => {
  // Someone can endorse q9 once and still total into "mild". The band must not
  // be able to bury the item.
  assert.equal(
    shouldOfferSupportOnResult({
      instrumentId: 'phq-9',
      responses: { q1: 0, q9: 1 },
      severity: 'low',
    }),
    true,
  )
})

test('a genuinely unremarkable result offers nothing', () => {
  assert.equal(
    shouldOfferSupportOnResult({
      instrumentId: 'phq-9',
      responses: { q1: 0, q9: 0 },
      severity: 'low',
      careAction: null,
    }),
    false,
  )
})

test('missing everything does not throw', () => {
  assert.equal(shouldOfferSupportOnResult({ instrumentId: 'phq-9' }), false)
  assert.equal(
    shouldOfferSupportOnResult({ instrumentId: 'phq-9', responses: null, severity: null }),
    false,
  )
})

// ── heavy subject matter ────────────────────────────────────────────────────

test('ACE and PCL-5 are heavy regardless of score', () => {
  // A zero on ACE does not mean the half hour answering it was easy.
  assert.equal(isHeavySubject('ace'), true)
  assert.equal(isHeavySubject('pcl-5'), true)
})

test('a sleep questionnaire is not', () => {
  assert.equal(isHeavySubject('sleep-4'), false)
})

// ── the resources themselves ────────────────────────────────────────────────

test('988 is offered before 911', () => {
  // Leading with an ambulance reads as an accusation and is the wrong first
  // offer for most endorsements.
  const kinds = CRISIS_RESOURCES.map((r) => r.kind)
  assert.ok(kinds.indexOf('emergency') === kinds.length - 1, '911 must be last')
  assert.equal(CRISIS_RESOURCES[0].value, '988')
})

test('a texting option exists', () => {
  // Speaking out loud is not available to everyone in every moment.
  assert.ok(CRISIS_RESOURCES.some((r) => r.kind === 'text'))
})

test('every resource builds a dialable url', () => {
  for (const r of CRISIS_RESOURCES) {
    const url = crisisResourceUrl(r)
    assert.match(url, /^(tel|sms):/)
    assert.ok(url.includes(r.value))
  }
})

test('the text line prefills HOME', () => {
  const t = CRISIS_RESOURCES.find((r) => r.kind === 'text')
  assert.equal(crisisResourceUrl(t), 'sms:741741?&body=HOME')
})
