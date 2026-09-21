import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toVisitCards,
  groupVisitCourses,
  type ProviderDetail,
  type VisitCard,
} from '../../lib/provider-detail-model.ts';

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

/**
 * COS-1077 — collapsing a course of therapy into one card.
 *
 * Ken: "Many of these visits were to physical therapy. How should we filter
 * this?" On the reference record 22 of 55 encounters are "Therapies Series".
 */
const visit = (id: string, type: string, date: string, location?: string,
               reports = 0, meds = 0): VisitCard => ({
  encounter: { id, type, date, status: 'finished', location },
  reports: Array.from({ length: reports }, (_, i) => ({
    id: `${id}-r${i}`, name: 'Report', status: 'final',
  })),
  medications: Array.from({ length: meds }, (_, i) => ({
    id: `${id}-m${i}`, name: 'Med', status: 'active',
  })),
});

test('consecutive same-type visits at one place collapse into a course', () => {
  const g = groupVisitCourses([
    visit('e4', 'Therapies Series', '2026-02-25', 'PT Clinic'),
    visit('e3', 'Therapies Series', '2026-02-18', 'PT Clinic'),
    visit('e2', 'Therapies Series', '2026-02-11', 'PT Clinic'),
    visit('e1', 'Therapies Series', '2026-02-04', 'PT Clinic'),
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].visits.length, 4);
  assert.equal(g[0].courseType, 'Therapies Series');
  assert.equal(g[0].startDate, '2026-02-04');
  assert.equal(g[0].endDate, '2026-02-25');
});

test('a lone visit is NOT a course — no badge, no date range to explain', () => {
  const g = groupVisitCourses([visit('e1', 'Outpatient', '2026-07-24', 'Lab')]);
  assert.equal(g.length, 1);
  assert.equal(g[0].courseType, undefined);
  assert.equal(g[0].visits.length, 1);
});

test('THE POINT: a course can never hide a report or a medicine', () => {
  const g = groupVisitCourses([
    visit('e2', 'Therapies Series', '2026-02-18', 'PT', 1, 0),
    visit('e1', 'Therapies Series', '2026-02-11', 'PT', 1, 2),
  ]);
  // The collapsed face must be able to say what came out of the course.
  assert.equal(g[0].reportCount, 2);
  assert.equal(g[0].medicationCount, 2);
});

test('a different visit type BREAKS the run — two years never merge', () => {
  const g = groupVisitCourses([
    visit('e3', 'Therapies Series', '2026-02-18', 'PT'),
    visit('e2', 'Outpatient', '2025-11-02', 'Lab'),
    visit('e1', 'Therapies Series', '2025-03-04', 'PT'),
  ]);
  assert.equal(g.length, 3, 'the break is the evidence they are separate episodes');
  assert.ok(g.every((x) => x.courseType === undefined));
});

test('same type at a DIFFERENT clinic is a different course', () => {
  const g = groupVisitCourses([
    visit('e2', 'Therapies Series', '2026-02-18', 'Sonoma PT'),
    visit('e1', 'Therapies Series', '2026-02-11', 'Marin PT'),
  ]);
  assert.equal(g.length, 2);
});

test('an empty record produces no groups rather than an empty course', () => {
  assert.deepEqual(groupVisitCourses([]), []);
});
