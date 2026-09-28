/**
 * COS-1148 — grouping a provider's visits under the diagnoses recorded at them.
 *
 * Ken's provider-page spec: "Notes =. List only / 1. Condition 1 - dates/notes
 * / Condition 2 - date/notes".
 *
 * A real unit test rather than a source-text one, because the function is pure
 * and the ways it goes wrong are behavioural: silently dropping a visit no
 * diagnosis claimed, rendering the same problem three times because three
 * Condition resources share a name, or inventing a link the record has not got.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupVisitsByCondition,
  type ProviderDetail,
  type VisitCard,
  type DetailCondition,
} from '../../lib/provider-detail-model.ts';

const visit = (id: string, date: string): VisitCard => ({
  encounter: { id, type: 'Outpatient', date } as VisitCard['encounter'],
  medications: [],
  reports: [],
});

const condition = (id: string, name: string, encounterId?: string): DetailCondition => ({
  id,
  name,
  status: 'active',
  ...(encounterId ? { encounterId } : {}),
});

const detail = (conditions: DetailCondition[]): ProviderDetail =>
  ({
    treatment: { activeConditions: conditions, resolvedConditions: [], procedures: [] },
  } as unknown as ProviderDetail);

test('groups visits under the condition recorded at them', () => {
  const visits = [visit('e1', '2026-01-07'), visit('e2', '2026-02-04')];
  const { groups, ungrouped } = groupVisitsByCondition(
    detail([condition('c1', 'Achilles tendon injury', 'e1')]),
    visits,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].condition.name, 'Achilles tendon injury');
  assert.deepEqual(groups[0].visits.map((v) => v.encounter.id), ['e1']);
  assert.deepEqual(ungrouped.map((v) => v.encounter.id), ['e2']);
});

test('the same diagnosis across three visits is ONE group, not three', () => {
  /*
   * The same condition recorded at three visits arrives as three Condition
   * resources with three ids. Keying on id would render the problem three
   * times as three one-visit rows — the opposite of what the spec asks for.
   */
  const visits = [visit('e1', '2026-01-07'), visit('e2', '2026-02-04'), visit('e3', '2026-03-01')];
  const { groups } = groupVisitsByCondition(
    detail([
      condition('c1', 'Knee pain', 'e1'),
      condition('c2', 'Knee pain', 'e2'),
      condition('c3', 'Knee pain', 'e3'),
    ]),
    visits,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].visits.length, 3);
});

test('visits are newest first within a group', () => {
  const visits = [visit('e1', '2026-01-07'), visit('e2', '2026-03-01')];
  const { groups } = groupVisitsByCondition(
    detail([condition('c1', 'Knee pain', 'e1'), condition('c2', 'Knee pain', 'e2')]),
    visits,
  );
  assert.deepEqual(groups[0].visits.map((v) => v.encounter.date), ['2026-03-01', '2026-01-07']);
});

test('one visit may appear under several conditions', () => {
  /*
   * Faithful, not a bug: 35-47% of notes on the linked records belong to an
   * encounter carrying more than one diagnosis. A visit where two problems
   * were addressed is part of both stories, and picking one silently drops the
   * other.
   */
  const visits = [visit('e1', '2026-01-07')];
  const { groups, ungrouped } = groupVisitsByCondition(
    detail([condition('c1', 'Knee pain', 'e1'), condition('c2', 'Ankle pain', 'e1')]),
    visits,
  );
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.visits.length === 1));
  assert.equal(ungrouped.length, 0);
});

test('a condition with NO encounter link groups nothing and invents nothing', () => {
  /*
   * The Epic and payer case — 0% of their Conditions carry the link. Inferring
   * one from dates was measured and rejected: a +/-7 day window matched exactly
   * one Condition for 1 note out of 169, and two-to-five simultaneously for 59.
   */
  const visits = [visit('e1', '2026-01-07'), visit('e2', '2026-02-04')];
  const { groups, ungrouped } = groupVisitsByCondition(
    detail([condition('c1', 'Knee pain'), condition('c2', 'Ankle pain')]),
    visits,
  );
  assert.equal(groups.length, 0);
  // Every visit still reaches the caller — nothing is lost by being ungroupable.
  assert.equal(ungrouped.length, 2);
});

test('a link pointing at an unknown encounter is ignored, not guessed at', () => {
  const visits = [visit('e1', '2026-01-07')];
  const { groups, ungrouped } = groupVisitsByCondition(
    detail([condition('c1', 'Knee pain', 'does-not-exist')]),
    visits,
  );
  assert.equal(groups.length, 0);
  assert.equal(ungrouped.length, 1);
});

test('the most-documented condition leads', () => {
  const visits = [visit('e1', '2026-01-07'), visit('e2', '2026-02-04'), visit('e3', '2026-03-01')];
  const { groups } = groupVisitsByCondition(
    detail([
      condition('c1', 'Ankle pain', 'e1'),
      condition('c2', 'Knee pain', 'e2'),
      condition('c3', 'Knee pain', 'e3'),
    ]),
    visits,
  );
  assert.equal(groups[0].condition.name, 'Knee pain');
  assert.equal(groups[0].visits.length, 2);
});

test('resolved conditions are grouped too', () => {
  // A resolved diagnosis still has visits worth reading, and Ken's spec draws a
  // list of conditions rather than a list of open ones.
  const visits = [visit('e1', '2026-01-07')];
  const d = {
    treatment: {
      activeConditions: [],
      resolvedConditions: [condition('c1', 'Post-surgical recovery', 'e1')],
      procedures: [],
    },
  } as unknown as ProviderDetail;
  const { groups } = groupVisitsByCondition(d, visits);
  assert.equal(groups.length, 1);
});

test('no visits at all is empty, not a crash', () => {
  const { groups, ungrouped } = groupVisitsByCondition(
    detail([condition('c1', 'Knee pain', 'e1')]),
    [],
  );
  assert.equal(groups.length, 0);
  assert.equal(ungrouped.length, 0);
});
