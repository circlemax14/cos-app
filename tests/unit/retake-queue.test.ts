/**
 * COS-1174 — the queue that replaces the "in between middleware".
 *
 * Vishal, 2026-09-30: "Once I complete one assessment, then I should be taken
 * to the next one. Until I complete all of them and after that there should be
 * just a message that we are rebuilding your plan[.] this in between middleware
 * is not required".
 *
 * These cover the expansion the app never had: scope → ordered instrument ids.
 * The routing that consumes it is asserted in
 * retake-queue-routing-contract.test.mjs.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildRetakeQueue,
  decodeRetakeQueue,
  encodeRetakeQueue,
  isPhq9Eligible,
  orderAssignedInstruments,
  parseRetakeScopeKey,
  resolveCompletionHref,
  rollUpDomain,
  type QueueInstrument,
} from '../../lib/retake-queue.ts'
import { retakeStartRoute } from '../../lib/retake-routes.ts'

const INSTRUMENTS: QueueInstrument[] = [
  { instrumentId: 'phq-2', domain: 'psychological' },
  { instrumentId: 'phq-9', domain: 'psychological' },
  { instrumentId: 'gad-7', domain: 'psychological' },
  { instrumentId: 'adl', domain: 'biological' },
  { instrumentId: 'iadl', domain: 'biological' },
  { instrumentId: 'cognition-8', domain: 'biological' },
  { instrumentId: 'lsns-6', domain: 'social' },
  { instrumentId: 'fica', domain: 'spiritual' },
  { instrumentId: 'pcl-5', domain: 'psychological', comingSoon: true },
  { instrumentId: 'legacy-no-domain' },
]

const none = new Set<string>()

describe('parseRetakeScopeKey', () => {
  it('recognises the two scope shapes the dashboard can send', () => {
    assert.deepEqual(parseRetakeScopeKey('all-assessments'), { kind: 'all' })
    assert.deepEqual(parseRetakeScopeKey('domain:biological'), {
      kind: 'domain',
      domain: 'biological',
    })
  })

  it('returns null for a single instrument, so it is never queued', () => {
    assert.equal(parseRetakeScopeKey('phq-9'), null)
    assert.equal(parseRetakeScopeKey('full-intake'), null)
    assert.equal(parseRetakeScopeKey('health-status-intake'), null)
  })

  it('rolls domain:spiritual into social rather than rejecting it', () => {
    // The dashboard cannot currently produce this key, but the oracle folds
    // spiritual into social everywhere else and a silent null here would mean
    // a request that can never be walked.
    assert.deepEqual(parseRetakeScopeKey('domain:spiritual'), {
      kind: 'domain',
      domain: 'social',
    })
  })

  it('rejects an unknown domain instead of guessing', () => {
    assert.equal(parseRetakeScopeKey('domain:cognitive'), null)
    assert.equal(parseRetakeScopeKey('domain:'), null)
  })
})

describe('rollUpDomain', () => {
  it('folds spiritual into social (COS-851 oracle)', () => {
    assert.equal(rollUpDomain('spiritual'), 'social')
    assert.equal(rollUpDomain('social'), 'social')
  })

  it('gives no domain to a pre-backfill row', () => {
    assert.equal(rollUpDomain(undefined), null)
    assert.equal(rollUpDomain(null), null)
    assert.equal(rollUpDomain(''), null)
  })
})

describe('buildRetakeQueue', () => {
  it('a domain scope yields only that domain, in catalog order', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'domain', domain: 'psychological' },
      instruments: INSTRUMENTS,
      completedIds: none,
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['phq-2', 'phq-9', 'gad-7'])
  })

  it('THE POINT: a completed instrument is not offered again', () => {
    // This is the loop he reported — finishing an assessment and being shown
    // the same one.
    const q = buildRetakeQueue({
      scope: { kind: 'domain', domain: 'psychological' },
      instruments: INSTRUMENTS,
      completedIds: new Set(['phq-2', 'phq-9']),
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['gad-7'])
  })

  it('an empty queue means satisfied — the signal to show the rebuild', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'domain', domain: 'social' },
      instruments: INSTRUMENTS,
      completedIds: new Set(['lsns-6', 'fica']),
      phq9Eligible: true,
    })
    assert.deepEqual(q, [])
  })

  it('a spiritual instrument is walked by a social scope', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'domain', domain: 'social' },
      instruments: INSTRUMENTS,
      completedIds: none,
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['lsns-6', 'fica'])
  })

  it('cognition-8 counts as biological — it must match the BACKEND, not the catalog header', () => {
    // The catalog promotes cognitive instruments into their own display
    // bucket. If that display rule leaked in here, cognition-8 would be left
    // out of a biological retake that the backend counts it in, and the scope
    // would never satisfy.
    const q = buildRetakeQueue({
      scope: { kind: 'domain', domain: 'biological' },
      instruments: INSTRUMENTS,
      completedIds: none,
      phq9Eligible: true,
    })
    assert.ok(q.includes('cognition-8'))
    assert.deepEqual(q, ['adl', 'iadl', 'cognition-8'])
  })

  it('never routes into a comingSoon instrument', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'all' },
      instruments: INSTRUMENTS,
      completedIds: none,
      phq9Eligible: true,
    })
    assert.ok(!q.includes('pcl-5'))
  })

  it('honours the PHQ-9 skip rule so we never auto-advance into a hidden item', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'domain', domain: 'psychological' },
      instruments: INSTRUMENTS,
      completedIds: none,
      phq9Eligible: false,
    })
    assert.deepEqual(q, ['phq-2', 'gad-7'])
  })

  it('an all-assessments scope includes a row with no domain; a domain scope does not', () => {
    const all = buildRetakeQueue({
      scope: { kind: 'all' },
      instruments: INSTRUMENTS,
      completedIds: none,
      phq9Eligible: true,
    })
    assert.ok(all.includes('legacy-no-domain'))
    for (const domain of ['biological', 'psychological', 'social'] as const) {
      const q = buildRetakeQueue({
        scope: { kind: 'domain', domain },
        instruments: INSTRUMENTS,
        completedIds: none,
        phq9Eligible: true,
      })
      assert.ok(!q.includes('legacy-no-domain'), `${domain} must not claim it`)
    }
  })

  it('preserves the order given and does not sort or dedupe-reorder', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'all' },
      instruments: [
        { instrumentId: 'zzz', domain: 'social' },
        { instrumentId: 'aaa', domain: 'social' },
        { instrumentId: 'zzz', domain: 'social' },
      ],
      completedIds: none,
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['zzz', 'aaa'])
  })
})

describe('isPhq9Eligible', () => {
  it('needs a PHQ-2 sum of 3 or more', () => {
    assert.equal(isPhq9Eligible({ q1: 2, q2: 1 }), true)
    assert.equal(isPhq9Eligible({ q1: 1, q2: 1 }), false)
  })

  it('an unanswered or absent PHQ-2 is not eligible', () => {
    assert.equal(isPhq9Eligible(undefined), false)
    assert.equal(isPhq9Eligible(null), false)
    assert.equal(isPhq9Eligible({}), false)
    // Non-numeric answers must not coerce their way past the gate.
    assert.equal(isPhq9Eligible({ q1: '3', q2: '3' }), false)
  })
})

describe('encode/decode round trip', () => {
  it('survives the URL', () => {
    const ids = ['adl', 'iadl', 'cognition-8']
    assert.deepEqual(decodeRetakeQueue(encodeRetakeQueue(ids)), ids)
  })

  it('an absent or empty param is an empty queue, never a one-item queue of ""', () => {
    assert.deepEqual(decodeRetakeQueue(undefined), [])
    assert.deepEqual(decodeRetakeQueue(''), [])
    assert.deepEqual(decodeRetakeQueue(','), [])
    assert.deepEqual(decodeRetakeQueue('adl,,iadl'), ['adl', 'iadl'])
  })
})

describe('resolveCompletionHref — the walk', () => {
  const returnHref = '/Home/assessments-catalog'
  const planHref = '/Home/health-plan'
  const base = { returnHref, planHref }

  it('no queue param: behaves exactly as before', () => {
    assert.equal(
      resolveCompletionHref({ ...base, queueParam: undefined, instrumentId: 'adl' }),
      returnHref,
    )
  })

  it('THE POINT: mid-walk goes straight to the next instrument, not the catalog', () => {
    const href = resolveCompletionHref({
      ...base,
      queueParam: 'adl,iadl,cognition-8',
      instrumentId: 'adl',
    })
    assert.equal(
      href,
      '/Home/assessment-stepper?instrumentId=iadl&source=retake-request&queue=iadl%2Ccognition-8',
    )
    assert.ok(!href.includes('assessments-catalog'))
  })

  it('the last instrument ends the walk at the plan, where the rebuild shows', () => {
    assert.equal(
      resolveCompletionHref({ ...base, queueParam: 'cognition-8', instrumentId: 'cognition-8' }),
      planHref,
    )
  })

  it('carries the remainder forward so the walk cannot restart', () => {
    // Walk the whole queue and assert it strictly shrinks and never revisits.
    let param = 'adl,iadl,cognition-8'
    const visited: string[] = []
    for (let i = 0; i < 5; i++) {
      const current = decodeRetakeQueue(param)[0]
      if (!current) break
      visited.push(current)
      const href = resolveCompletionHref({ ...base, queueParam: param, instrumentId: current })
      if (href === planHref) break
      param = decodeURIComponent(href.split('queue=')[1] ?? '')
    }
    assert.deepEqual(visited, ['adl', 'iadl', 'cognition-8'])
  })

  it('an instrument answered out of order still drops out of the queue', () => {
    // The patient taps iadl first from the catalog. iadl must not be offered
    // again when the walk reaches it.
    const href = resolveCompletionHref({
      ...base,
      queueParam: 'adl,iadl,cognition-8',
      instrumentId: 'iadl',
    })
    assert.equal(
      href,
      '/Home/assessment-stepper?instrumentId=adl&source=retake-request&queue=adl%2Ccognition-8',
    )
  })

  it('an instrument not in the queue at all does not stall the walk', () => {
    const href = resolveCompletionHref({
      ...base,
      queueParam: 'adl,iadl',
      instrumentId: 'gad-7',
    })
    // Still advances rather than looping on gad-7.
    assert.ok(href.includes('instrumentId=adl'))
  })
})

describe('COS-1175 — set: scopes (the scheduled sweeper batch)', () => {
  it('parses its members', () => {
    assert.deepEqual(parseRetakeScopeKey('set:falls-12,hope,ohio-leisure-interest'), {
      kind: 'set',
      instrumentIds: ['falls-12', 'hope', 'ohio-leisure-interest'],
    })
  })

  it('an empty or malformed set is not a scope', () => {
    // Would otherwise create a request that can never be satisfied.
    assert.equal(parseRetakeScopeKey('set:'), null)
    assert.equal(parseRetakeScopeKey('set:,,'), null)
  })

  it('THE POINT: one walk covering exactly the instruments that were due', () => {
    // Exactly the three the sweeper found due on dev at 05:32:30.
    const q = buildRetakeQueue({
      scope: { kind: 'set', instrumentIds: ['falls-12', 'hope', 'ohio-leisure-interest'] },
      instruments: [
        ...INSTRUMENTS,
        { instrumentId: 'falls-12', domain: 'biological' },
        { instrumentId: 'hope', domain: 'spiritual' },
        { instrumentId: 'ohio-leisure-interest', domain: 'social' },
      ],
      completedIds: none,
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['falls-12', 'hope', 'ohio-leisure-interest'])
  })

  it('walks in the SET order, not the catalog order', () => {
    // The sweeper sorts stalest-first; the catalog sorts by AI recommendation.
    const q = buildRetakeQueue({
      scope: { kind: 'set', instrumentIds: ['lsns-6', 'adl'] },
      instruments: INSTRUMENTS, // adl appears before lsns-6 here
      completedIds: none,
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['lsns-6', 'adl'])
  })

  it('ignores a member the patient is not assigned', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'set', instrumentIds: ['adl', 'not-assigned-to-them'] },
      instruments: INSTRUMENTS,
      completedIds: none,
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['adl'])
  })

  it('still skips completed and comingSoon members', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'set', instrumentIds: ['adl', 'pcl-5', 'iadl'] },
      instruments: INSTRUMENTS,
      completedIds: new Set(['adl']),
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['iadl'])
  })

  it('an emptied set ends the walk at the plan', () => {
    const q = buildRetakeQueue({
      scope: { kind: 'set', instrumentIds: ['adl', 'iadl'] },
      instruments: INSTRUMENTS,
      completedIds: new Set(['adl', 'iadl']),
      phq9Eligible: true,
    })
    assert.deepEqual(q, [])
  })
})

describe('COS-1175 — retakeStartRoute skips the picker for a set', () => {
  it('THE POINT: goes straight into the first check-in, carrying the queue', () => {
    const href = retakeStartRoute('set:falls-12,hope,ohio-leisure-interest')
    assert.equal(
      href,
      '/Home/assessment-stepper?instrumentId=falls-12&source=retake-request' +
        '&queue=falls-12%2Chope%2Cohio-leisure-interest',
    )
    assert.ok(!href.includes('assessments-catalog'))
  })

  it('a malformed set falls back to the catalog, not an empty stepper', () => {
    assert.ok(retakeStartRoute('set:').includes('assessments-catalog'))
  })

  it('domain and all-assessments still use the catalog — only it knows the members', () => {
    assert.ok(retakeStartRoute('all-assessments').includes('assessments-catalog'))
    assert.ok(retakeStartRoute('domain:social').includes('assessments-catalog'))
  })

  it('a single instrument is unchanged', () => {
    assert.ok(retakeStartRoute('gad-7').includes('instrumentId=gad-7'))
    assert.ok(!retakeStartRoute('gad-7').includes('queue='))
  })
})

describe('COS-1177 — a single-instrument retake also ends on the plan', () => {
  const base = { returnHref: '/Home/assessments-catalog', planHref: '/Home/health-plan' }

  it('THE POINT: no queue, but from a retake → the plan, not the catalog', () => {
    // retakeStartRoute('phq-9') goes straight to the stepper with no queue.
    // This is the shape the dashboard produces most often.
    assert.equal(
      resolveCompletionHref({
        ...base,
        queueParam: undefined,
        instrumentId: 'phq-9',
        source: 'retake-request',
      }),
      '/Home/health-plan',
    )
  })

  it('a NON-retake run is untouched — still the caller destination', () => {
    // patient-intake, the nutrition card, the Plan+ gate, plain deep links.
    assert.equal(
      resolveCompletionHref({ ...base, queueParam: undefined, instrumentId: 'phq-9' }),
      base.returnHref,
    )
    assert.equal(
      resolveCompletionHref({
        ...base,
        queueParam: undefined,
        instrumentId: 'phq-9',
        source: 'nutrition-card',
      }),
      base.returnHref,
    )
  })

  it('a queue still wins — mid-walk goes to the next instrument', () => {
    const href = resolveCompletionHref({
      ...base,
      queueParam: 'adl,iadl',
      instrumentId: 'adl',
      source: 'retake-request',
    })
    assert.ok(href.includes('instrumentId=iadl'))
  })
})

describe('COS-1181 — orderAssignedInstruments (lifted out of the catalog)', () => {
  const ALL: QueueInstrument[] = [
    { instrumentId: 'gad-7', domain: 'psychological' },
    { instrumentId: 'phq-2', domain: 'psychological' },
    { instrumentId: 'phq-9', domain: 'psychological' },
    { instrumentId: 'wellbeing-5', domain: 'psychological' },
    { instrumentId: 'not-assigned', domain: 'social' },
  ]
  const assigned = (...ids: string[]) => new Set(ids)

  it('THE POINT: only what the plan asks for', () => {
    const out = orderAssignedInstruments({
      all: ALL,
      assignedIds: assigned('gad-7', 'phq-2'),
      assignmentsKnown: true,
      phq9Eligible: true,
    })
    assert.deepEqual(out.map((i) => i.instrumentId), ['gad-7', 'phq-2'])
  })

  it('the AI order leads; INSTRUMENT_ORDER only backfills', () => {
    // `all` arrives in backend order (gad-7 before phq-2), which must survive —
    // INSTRUMENT_ORDER lists phq-2 first and must NOT reorder it.
    const out = orderAssignedInstruments({
      all: ALL,
      assignedIds: assigned('gad-7', 'phq-2', 'wellbeing-5'),
      assignmentsKnown: true,
      phq9Eligible: true,
    })
    assert.deepEqual(out.map((i) => i.instrumentId), ['gad-7', 'phq-2', 'wellbeing-5'])
  })

  it('the backfill cannot reintroduce the library', () => {
    // INSTRUMENT_ORDER names many ids; only assigned ones may come back.
    const out = orderAssignedInstruments({
      all: ALL,
      assignedIds: assigned('gad-7'),
      assignmentsKnown: true,
      phq9Eligible: true,
    })
    assert.deepEqual(out.map((i) => i.instrumentId), ['gad-7'])
  })

  it('"not loaded" is EMPTY, not everything', () => {
    // Flashing the full library and then removing most of it reads as a glitch —
    // and in the retake card it would auto-advance into an unassigned instrument.
    const out = orderAssignedInstruments({
      all: ALL,
      assignedIds: assigned('gad-7'),
      assignmentsKnown: false,
      phq9Eligible: true,
    })
    assert.deepEqual(out, [])
  })

  it('honours the PHQ-9 skip rule', () => {
    const out = orderAssignedInstruments({
      all: ALL,
      assignedIds: assigned('phq-2', 'phq-9'),
      assignmentsKnown: true,
      phq9Eligible: false,
    })
    assert.deepEqual(out.map((i) => i.instrumentId), ['phq-2'])
  })

  it('never repeats an instrument', () => {
    const out = orderAssignedInstruments({
      all: [...ALL, { instrumentId: 'gad-7', domain: 'psychological' }],
      assignedIds: assigned('gad-7'),
      assignmentsKnown: true,
      phq9Eligible: true,
    })
    assert.deepEqual(out.map((i) => i.instrumentId), ['gad-7'])
  })

  it('END TO END: an all-assessments scope now resolves without the catalog', () => {
    // This is the whole point of COS-1181 — the card can do this itself.
    const ordered = orderAssignedInstruments({
      all: ALL,
      assignedIds: assigned('gad-7', 'phq-2', 'wellbeing-5'),
      assignmentsKnown: true,
      phq9Eligible: true,
    })
    const q = buildRetakeQueue({
      scope: { kind: 'all' },
      instruments: ordered,
      completedIds: new Set(['phq-2']),
      phq9Eligible: true,
    })
    assert.deepEqual(q, ['gad-7', 'wellbeing-5'])
  })
})
