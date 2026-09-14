import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVisitCards, type ProviderDetail } from '../../lib/provider-detail-model.ts';

/**
 * COS-1013 — grouping a provider's record into one card per visit.
 *
 * Real proportions from the test account: 46 of 59 medications and 74 of 76
 * reports name their encounter. Conditions name none — 0 of 9 — which is the
 * reason they are absent from these cards rather than an oversight.
 */
const base = (over: Partial<ProviderDetail> = {}): ProviderDetail => ({
  provider: { id: 'p1', name: 'Marlowe Bishop, DO' },
  treatment: { activeConditions: [], resolvedConditions: [], procedures: [] },
  progressNotes: { reports: [] },
  medications: { active: [], previous: [] },
  appointments: { encounters: [] },
  ...over,
});

test('one card per visit, newest first', () => {
  const { visits } = toVisitCards(base({
    appointments: { encounters: [
      { id: 'e1', type: 'Outpatient', date: '2025-02-03', status: 'finished' },
      { id: 'e2', type: 'Outpatient', date: '2025-04-30', status: 'finished' },
    ] },
  }));
  assert.deepEqual(visits.map((v) => v.encounter.id), ['e2', 'e1']);
});

test('medications and reports land on the visit they name', () => {
  const { visits } = toVisitCards(base({
    appointments: { encounters: [{ id: 'e1', type: 'Outpatient', date: '2025-02-03', status: 'finished' }] },
    medications: {
      active: [{ id: 'm1', name: 'gabapentin', status: 'active', encounterId: 'e1' }],
      previous: [],
    },
    progressNotes: { reports: [{ id: 'r1', name: 'X-ray', status: 'final', encounterId: 'e1' }] },
  }));
  assert.equal(visits[0].medications[0].name, 'gabapentin');
  assert.equal(visits[0].reports[0].name, 'X-ray');
});

test('records with no visit are surfaced, never dropped or guessed onto a date', () => {
  /*
   * 13 of 59 medications carry no encounter. Attaching them to the nearest
   * visit would invent a fact; hiding them would lose a prescription the
   * patient actually has.
   */
  const { visits, unlinkedMedications } = toVisitCards(base({
    appointments: { encounters: [{ id: 'e1', type: 'Outpatient', date: '2025-02-03', status: 'finished' }] },
    medications: {
      active: [{ id: 'm1', name: 'orphan med', status: 'active' }],
      previous: [],
    },
  }));
  assert.equal(visits[0].medications.length, 0);
  assert.deepEqual(unlinkedMedications.map((m) => m.name), ['orphan med']);
});

test('a link to an encounter this provider does not have is treated as unlinked', () => {
  // Otherwise the row vanishes: it matches no card and would fall out of both.
  const { unlinkedReports } = toVisitCards(base({
    appointments: { encounters: [{ id: 'e1', type: 'Outpatient', status: 'finished' }] },
    progressNotes: { reports: [{ id: 'r9', name: 'elsewhere', status: 'final', encounterId: 'zzz' }] },
  }));
  assert.deepEqual(unlinkedReports.map((r) => r.name), ['elsewhere']);
});

test('conditions never appear on a visit card', () => {
  // No Condition in this data references an encounter, so placing one inside a
  // visit would assert a diagnosis was made that day.
  const detail = base({
    appointments: { encounters: [{ id: 'e1', type: 'Outpatient', date: '2025-02-03', status: 'finished' }] },
    treatment: {
      activeConditions: [{ id: 'c1', name: 'Achilles injury', status: 'active' }],
      resolvedConditions: [],
      procedures: [],
    },
  });
  const { visits } = toVisitCards(detail);
  assert.equal(JSON.stringify(visits).includes('Achilles'), false);
});

test('THE POINT: encounters are read from appointments.encounters', () => {
  /*
   * COS-1016 — the field is nested. Reading a top-level `encounters` returned
   * undefined for every provider, so no visit card ever rendered and the
   * treatment tab claimed "no diagnoses recorded" for a provider with seven
   * visits. This asserts against the SHAPE the server actually sends.
   */
  const { visits } = toVisitCards({
    provider: { id: 'p', name: 'Jordan Waverly, DO' },
    treatment: { activeConditions: [], resolvedConditions: [], procedures: [] },
    progressNotes: { reports: [] },
    medications: { active: [], previous: [] },
    appointments: {
      encounters: [
        { id: 'e1', type: 'Outpatient', date: '2013-03-12', status: 'finished' },
        { id: 'e2', type: 'Outpatient', date: '2016-11-16', status: 'finished' },
      ],
    },
  });
  assert.equal(visits.length, 2, 'seven visits must not render as zero cards');
});
