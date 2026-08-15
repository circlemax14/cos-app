/**
 * Grouping self-assessments by biopsychosocial domain.
 *
 * Ken 2026-08-14 asked for this on Health Trends. The grouping itself is
 * cheap; the failure modes are not obvious:
 *
 *  - a card that appears in three groups makes one check-in look like three
 *  - a card that appears in NONE silently loses a completed assessment
 *  - and before the backend join deploys, no record carries subdomains at all,
 *    so the screen has to keep working with zero groupable data
 *
 * Uses real instrument shapes from production rather than invented ones —
 * `hope` genuinely spans four subdomains across three domains, which is the
 * case that decides the whole design.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupAssessmentsByDomain,
  domainForAssessment,
} from './assessment-grouping.ts';

// The real mapping, copied from lib/bps-subdomains.ts. Only the keys these
// fixtures use — enough to prove the grouping, and it keeps this file free of
// the alias/extension problem that made the module import-free in the first
// place. A contract test asserts the component wires the REAL resolver.
const DOMAIN_OF = (k) => ({
  faith_spiritual: 'social',
  attitudes_beliefs: 'psychological',
  coping_skills: 'psychological',
  social_support: 'social',
  emotions: 'psychological',
  physical_health: 'biological',
  immune_stress_response: 'biological',
  interpersonal_relationships: 'social',
  peer_group: 'social',
  diet_lifestyle: 'biological',
  metabolic_disorders: 'biological',
}[k] ?? null);

// Real subdomain sets, copied from cos-instrument-definitions-production.
const HOPE = { instrumentId: 'hope', subdomains: ['faith_spiritual', 'attitudes_beliefs', 'coping_skills', 'social_support'] };
const PHQ2 = { instrumentId: 'phq-2', subdomains: ['emotions'] };
const PAIN4 = { instrumentId: 'pain-4', subdomains: ['physical_health', 'immune_stress_response'] };
const LONELY = { instrumentId: 'loneliness-3', subdomains: ['social_support', 'interpersonal_relationships', 'peer_group'] };
const DSQ = { instrumentId: 'dsq-nci', subdomains: ['diet_lifestyle', 'metabolic_disorders'] };
const BARE = { instrumentId: 'mystery-9' };

test('a real multi-domain instrument resolves to ONE domain', () => {
  // hope spans faith_spiritual (social), attitudes_beliefs (psychological),
  // coping_skills and social_support. First subdomain wins.
  assert.equal(domainForAssessment(HOPE, DOMAIN_OF), 'social');
});

test('each instrument lands in exactly one group', () => {
  // Showing a card in every domain it touches would make one check-in read as
  // three, and a patient counting their check-ins would get the wrong answer.
  const groups = groupAssessmentsByDomain([HOPE, PHQ2, PAIN4, LONELY, DSQ], DOMAIN_OF);
  const ids = groups.flatMap((g) => g.records.map((r) => r.instrumentId));
  assert.equal(ids.length, new Set(ids).size, 'no instrument may appear twice');
  assert.equal(ids.length, 5, 'and none may be dropped');
});

test('groups come back in a fixed, meaningful order', () => {
  const groups = groupAssessmentsByDomain([LONELY, DSQ, PHQ2], DOMAIN_OF);
  // "Social & Faith" matches the Care Plan screen's own third section card,
  // which is the surface these headings render beside. See DOMAIN_ORDER.
  assert.deepEqual(groups.map((g) => g.label), ['Biological', 'Psychological', 'Social & Faith']);
});

test('empty domains are omitted, not rendered blank', () => {
  const groups = groupAssessmentsByDomain([PHQ2], DOMAIN_OF);
  assert.deepEqual(groups.map((g) => g.label), ['Psychological']);
});

test('an unplaceable instrument goes to Other, never missing', () => {
  // A check-in the patient completed must not vanish because a definition row
  // is missing a field.
  const groups = groupAssessmentsByDomain([PHQ2, BARE], DOMAIN_OF);
  const other = groups.find((g) => g.label === 'Other');
  assert.ok(other, 'an Other bucket must exist');
  assert.deepEqual(other.records.map((r) => r.instrumentId), ['mystery-9']);
  assert.equal(groups[groups.length - 1].label, 'Other', 'and it goes last');
});

test('NOTHING groupable ⇒ one unlabelled group, i.e. today\'s flat carousel', () => {
  // The pre-backend state. The client half of this change ships before the
  // subdomain join reaches production, so with no subdomains anywhere the
  // screen must render exactly as it does now.
  const groups = groupAssessmentsByDomain([BARE, { instrumentId: 'x' }], DOMAIN_OF);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '');
  assert.equal(groups[0].domain, null);
  assert.equal(groups[0].records.length, 2);
});

test('order WITHIN a group is preserved', () => {
  // The caller sorts by recency; regrouping must not reshuffle that.
  const a = { instrumentId: 'a', subdomains: ['emotions'] };
  const b = { instrumentId: 'b', subdomains: ['emotions'] };
  const groups = groupAssessmentsByDomain([a, b], DOMAIN_OF);
  assert.deepEqual(groups[0].records.map((r) => r.instrumentId), ['a', 'b']);
});

test('junk subdomains do not crash or misplace', () => {
  for (const subs of [[], [''], ['   '], ['not_a_real_subdomain']]) {
    const d = domainForAssessment({ instrumentId: 'z', subdomains: subs }, DOMAIN_OF);
    assert.equal(d, null, `${JSON.stringify(subs)} must be unplaceable, not wrong`);
  }
  assert.equal(domainForAssessment(null, DOMAIN_OF), null);
  assert.equal(domainForAssessment(undefined, DOMAIN_OF), null);
});

test('an empty list yields no groups', () => {
  assert.deepEqual(groupAssessmentsByDomain([], DOMAIN_OF), []);
});
