/**
 * COS-1239 — the visit card's derivations: which visits Notes lists, what it
 * says you were there for, and when it may say nothing was recorded.
 *
 * Ken, 2026-10-02: "I'm thinking the appointments should detail perhaps why I
 * was there for an appointment."
 *
 * Synthetic fixtures only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isPastVisit,
  isUpcomingBooked,
  visitReason,
  visitReasonFromDiagnoses,
  recordedNothing,
  type DetailEncounter,
  type VisitCard,
} from '../../lib/provider-detail-model.ts';

const TODAY = '2026-10-02';
const enc = (over: Partial<DetailEncounter> = {}): DetailEncounter => ({
  id: 'e1',
  type: 'Outpatient',
  status: 'finished',
  date: '2026-03-01',
  ...over,
});
const card = (e: DetailEncounter, over: Partial<VisitCard> = {}): VisitCard => ({
  encounter: e,
  medications: [],
  reports: [],
  ...over,
});
const summary = (over: Partial<NonNullable<DetailEncounter['visitSummary']>> = {}) => ({
  reasonsForVisit: [],
  diagnoses: [],
  documentId: 'doc1',
  ...over,
});

test('THE POINT: a visit with no reports is still a past visit', () => {
  // COS-1131's reports-only rule hid these — the visits Ken is asking about.
  assert.equal(isPastVisit(enc(), TODAY), true);
});

test('booked-ahead and cancelled encounters are not visits you were at', () => {
  assert.equal(isPastVisit(enc({ normalizedStatus: 'planned' }), TODAY), false);
  assert.equal(isPastVisit(enc({ normalizedStatus: 'cancelled' }), TODAY), false);
  assert.equal(isPastVisit(enc({ date: '2026-10-09' }), TODAY), false);
});

test('today counts, and an undated encounter is kept rather than dropped', () => {
  assert.equal(isPastVisit(enc({ date: '2026-10-02T09:30:00-07:00' }), TODAY), true);
  assert.equal(isPastVisit(enc({ date: undefined }), TODAY), true);
});

test("the Encounter's own reason wins", () => {
  const e = enc({ reason: 'Initial Assessment', visitSummary: summary({ reasonsForVisit: ['Knee pain'] }) });
  assert.equal(visitReason(e), 'Initial Assessment');
});

test("the visit summary's reasons are used when the Encounter has none", () => {
  const e = enc({ visitSummary: summary({ reasonsForVisit: [' Knee pain ', '', 'Follow-up'] }) });
  assert.equal(visitReason(e), 'Knee pain; Follow-up');
});

test('blank reasons are no reason — never an empty line under the label', () => {
  // `??` would let '' through; the card would then show a label over nothing.
  assert.equal(visitReason(enc({ reason: '   ' })), undefined);
  assert.equal(visitReason(enc({ visitSummary: summary() })), undefined);
  assert.equal(visitReason(enc()), undefined);
});

test('"nothing was recorded" only when the card truly has nothing', () => {
  assert.equal(recordedNothing(card(enc())), true);
  assert.equal(recordedNothing(card(enc({ reason: 'Therapy Daily Treatment' }))), false);
  assert.equal(recordedNothing(card(enc({ visitSummary: summary({ note: 'Seen today.' }) }))), false);
  // Diagnoses with no reason is a real shape — some summaries lack "Reason for Visit".
  assert.equal(recordedNothing(card(enc({ visitSummary: summary({ diagnoses: ['Low back pain'] }) }))), false);
  assert.equal(
    recordedNothing(card(enc(), { reports: [{ id: 'r1', name: 'X-ray', status: 'final' }] })),
    false,
  );
});

test('booked = Confirmed and not in the past', () => {
  assert.equal(isUpcomingBooked({ date: '2026-10-09', status: 'Confirmed' }, TODAY), true);
  assert.equal(isUpcomingBooked({ date: '2026-10-02', status: 'Confirmed' }, TODAY), true);
  assert.equal(isUpcomingBooked({ date: '2026-09-01', status: 'Confirmed' }, TODAY), false);
  // The app maps cancelled/proposed Appointments to Pending; those are not booked.
  assert.equal(isUpcomingBooked({ date: '2026-10-09', status: 'Pending' }, TODAY), false);
  assert.equal(isUpcomingBooked({ date: '2026-10-09', status: 'Completed' }, TODAY), false);
});

test("a planned Encounter is a booked visit, not Pending", () => {
  // Fasten records carry booked visits as Encounters with status 'planned'.
  // Mapped to Pending, isUpcomingBooked never saw them and, with the past list
  // excluding planned, they vanished from the provider page entirely.
  const src = readFileSync(new URL('../../services/api/providers.ts', import.meta.url), 'utf8');
  assert.match(src, /a\.status === 'booked' \|\| a\.status === 'planned'\s*\?\s*\('Confirmed' as const\)/);
});

// Measured on a real record: 25 of 48 visit summaries state a reason, 48 of 48
// list visit diagnoses. A visit with only a diagnosis must not read
// "The clinic didn't record a reason" above that very diagnosis.
test('visitReasonFromDiagnoses: the primary diagnosis, without its marker', () => {
  const e = enc({ visitSummary: summary({ diagnoses: ['Knee pain, right - Primary', 'Status post knee replacement'] }) });
  assert.equal(visitReasonFromDiagnoses(e), 'Knee pain, right');
});

test('visitReasonFromDiagnoses: "(primary)" form is read the same way', () => {
  const e = enc({ visitSummary: summary({ diagnoses: ['Ankle sprain (primary)', 'Hypertension'] }) });
  assert.equal(visitReasonFromDiagnoses(e), 'Ankle sprain');
});

test('visitReasonFromDiagnoses: no primary marker → first two, joined', () => {
  const e = enc({ visitSummary: summary({ diagnoses: ['A', 'B', 'C'] }) });
  assert.equal(visitReasonFromDiagnoses(e), 'A; B');
});

test('visitReasonFromDiagnoses: nothing recorded → undefined, never invented', () => {
  assert.equal(visitReasonFromDiagnoses(enc()), undefined);
  assert.equal(visitReasonFromDiagnoses(enc({ visitSummary: summary({ diagnoses: ['  '] }) })), undefined);
});

test('the card prefers a stated reason and only falls back to diagnoses', () => {
  const src = readFileSync(new URL('../../app/Home/doctor-detail.tsx', import.meta.url), 'utf8');
  assert.match(src, /statedReason \?\? visitReasonFromDiagnoses\(v\.encounter\)/);
});
