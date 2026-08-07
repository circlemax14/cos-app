/**
 * #5 Phase 1 — the 12 wellbeing areas and the derived map layout.
 *
 * Two classes of invariant here, and the second is the one that matters most:
 *
 *  1. The areas partition the taxonomy honestly — every one of the 26
 *     subdomains is either claimed by an area or explicitly listed as
 *     context-only. A subdomain that is neither would silently disappear from
 *     the patient's checklist with nobody noticing.
 *
 *  2. Dot positions AGREE with the declared taxonomy. This is the defect that
 *     started the whole redesign: 12 of 26 dots rendered in the wrong Venn
 *     region, eight outside all three circles, including `faith_spiritual`
 *     outside the circle named for it. Positions are now derived rather than
 *     hand-written, so these assertions check the derivation rather than a
 *     table of coordinates someone has to remember to update.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BPS_SUBDOMAINS } from '../../lib/bps-subdomains.ts';
import {
  WELLBEING_AREAS,
  CONTEXT_ONLY_SUBDOMAINS,
  AREA_MAPPED_SUBDOMAINS,
  areasByGroup,
  areaCoverage,
  groupCoverage,
  pickStartHere,
  instrumentsForArea,
  AREA_BY_ID,
} from '../../lib/wellbeing-areas.ts';
import {
  isInRegion,
  MIN_SEPARATION,
  computeDotPositions,
  indexByKey,
} from '../../lib/wellbeing-map-layout.ts';

// The layout takes the taxonomy as INPUT, so the test supplies the real one —
// which is what makes "the render agrees with the declaration" assertable.
const DOT_POSITIONS = computeDotPositions(BPS_SUBDOMAINS);
const DOT_POSITION_BY_KEY = indexByKey(DOT_POSITIONS);

// ── 1. The areas partition the taxonomy ────────────────────────────────────

test('there are exactly 12 areas, 5 + 4 + 3', () => {
  assert.equal(WELLBEING_AREAS.length, 12);
  assert.equal(areasByGroup('body').length, 5);
  assert.equal(areasByGroup('mind').length, 4);
  assert.equal(areasByGroup('life').length, 3);
});

test('every subdomain is either claimed by an area or explicitly context-only', () => {
  const claimed = new Set(AREA_MAPPED_SUBDOMAINS);
  const context = new Set(CONTEXT_ONLY_SUBDOMAINS);
  const orphans = BPS_SUBDOMAINS.map((s) => s.key).filter((k) => !claimed.has(k) && !context.has(k));
  assert.deepEqual(
    orphans,
    [],
    `Subdomains belonging to no area and not listed as context-only: ${orphans.join(', ')}. ` +
      'They would vanish from the checklist silently. Either fold them into an area or add them ' +
      'to CONTEXT_ONLY_SUBDOMAINS deliberately.',
  );
});

test('context-only subdomains are genuinely unclaimed — the two lists never overlap', () => {
  const claimed = new Set(AREA_MAPPED_SUBDOMAINS);
  const both = CONTEXT_ONLY_SUBDOMAINS.filter((k) => claimed.has(k));
  assert.deepEqual(both, [], `Listed as context-only AND folded into an area: ${both.join(', ')}`);
});

test('every subdomain an area claims actually exists in the taxonomy', () => {
  const known = new Set(BPS_SUBDOMAINS.map((s) => s.key));
  const bogus = AREA_MAPPED_SUBDOMAINS.filter((k) => !known.has(k));
  assert.deepEqual(bogus, [], `Areas reference subdomains that do not exist: ${bogus.join(', ')}`);
});

test('area ids are unique and stable-looking', () => {
  const ids = WELLBEING_AREAS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate area id');
  for (const id of ids) {
    assert.match(id, /^[a-z][a-z0-9-]*$/, `area id "${id}" should be lower-kebab`);
  }
});

test('every area explains why it is being asked, in plain language', () => {
  for (const a of WELLBEING_AREAS) {
    assert.ok(a.whyItMatters.length > 20, `${a.id} needs a real whyItMatters`);
    // The audience is a 70-year-old. These are the words the copy rules ban.
    for (const jargon of ['biopsychosocial', 'subdomain', 'instrument', 'psychometric']) {
      assert.ok(
        !a.whyItMatters.toLowerCase().includes(jargon),
        `${a.id} whyItMatters contains jargon "${jargon}"`,
      );
    }
  }
});

// ── 2. Instruments are DERIVED, not declared ───────────────────────────────

test('instrumentsForArea inverts the catalog rather than reading a hardcoded list', () => {
  const catalog = [
    { id: 'sleep-4', subdomains: ['sleep'] },
    { id: 'phq-9', subdomains: ['emotions', 'self_esteem'] },
    { id: 'gad-7', subdomains: ['immune_stress_response'] },
    { id: 'untagged', subdomains: [] },
  ];
  assert.deepEqual(instrumentsForArea(AREA_BY_ID['sleep'], catalog), ['sleep-4']);
  assert.deepEqual(instrumentsForArea(AREA_BY_ID['mood'], catalog), ['phq-9']);
  // Broad instruments legitimately serve more than one area — gad-7 tags
  // immune_stress_response, which both "Worry & stress" and "Pain" fold in.
  assert.deepEqual(instrumentsForArea(AREA_BY_ID['worry-stress'], catalog), ['gad-7']);
  assert.deepEqual(instrumentsForArea(AREA_BY_ID['pain'], catalog), ['gad-7']);
});

test('a missing or empty catalog yields [] rather than throwing', () => {
  // A stale cache must render "no questionnaire yet", not crash the screen.
  assert.deepEqual(instrumentsForArea(AREA_BY_ID['sleep'], null), []);
  assert.deepEqual(instrumentsForArea(AREA_BY_ID['sleep'], undefined), []);
  assert.deepEqual(instrumentsForArea(AREA_BY_ID['sleep'], []), []);
  assert.deepEqual(
    instrumentsForArea(AREA_BY_ID['sleep'], [{ id: 'x', subdomains: null }]),
    [],
  );
});

// ── 3. Coverage + Start here ───────────────────────────────────────────────

test('an area is covered when ANY of its subdomains is, not all', () => {
  // "Memory & thinking" folds in three subdomains but is served by one
  // instrument. Requiring all three would leave it permanently unchecked.
  const area = AREA_BY_ID['memory-thinking'];
  assert.equal(area.subdomains.length, 3);
  assert.equal(areaCoverage(area, new Set(['neurobiology'])), 'covered');
  assert.equal(areaCoverage(area, new Set()), 'not-yet');
});

test('groupCoverage counts areas, not subdomains', () => {
  const covered = new Set(['sleep', 'physical_health']);
  const body = groupCoverage('body', covered);
  assert.equal(body.total, 5);
  // sleep → Sleep; physical_health → both "Getting around" AND "Pain".
  assert.equal(body.covered, 3);
});

test('pickStartHere targets the proportionally weakest group', () => {
  // Body 4/5 (80%), Mind 0/4 (0%), Life 0/3 (0%). Mind and Life tie at 0;
  // Mind wins on declared order, and returns its first uncovered area.
  const covered = new Set([
    'sleep', 'physical_health', 'diet_lifestyle', 'neurobiology',
  ]);
  const pick = pickStartHere(covered);
  assert.ok(pick);
  assert.equal(pick.group, 'mind');
  assert.equal(pick.id, 'mood');
});

test('pickStartHere returns null when everything is covered', () => {
  const all = new Set(AREA_MAPPED_SUBDOMAINS);
  assert.equal(pickStartHere(all), null);
});

// ── 4. Derived dot layout — the defect that started this ───────────────────

test('every one of the 26 dots renders inside its DECLARED region', () => {
  assert.equal(DOT_POSITIONS.length, BPS_SUBDOMAINS.length);
  const misplaced: string[] = [];
  for (const s of BPS_SUBDOMAINS) {
    const p = DOT_POSITION_BY_KEY[s.key];
    assert.ok(p, `no position derived for ${s.key}`);
    if (!isInRegion(p.x, p.y, s.domain, s.overlap)) {
      misplaced.push(`${s.key} (declared ${s.overlap ?? s.domain})`);
    }
  }
  assert.deepEqual(
    misplaced,
    [],
    'Dots rendering outside the region BPS_SUBDOMAINS declares for them. This is the exact ' +
      'defect the derivation replaced — a hand-written coordinate table had 12 of 26 wrong, ' +
      `including faith_spiritual outside the Social circle. Misplaced: ${misplaced.join(', ')}`,
  );
});

test('no two dots have overlapping tap targets', () => {
  const collisions: string[] = [];
  for (let i = 0; i < DOT_POSITIONS.length; i++) {
    for (let j = i + 1; j < DOT_POSITIONS.length; j++) {
      const a = DOT_POSITIONS[i];
      const b = DOT_POSITIONS[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < MIN_SEPARATION) collisions.push(`${a.key} <-> ${b.key} (${d.toFixed(1)})`);
    }
  }
  assert.deepEqual(
    collisions,
    [],
    `Dots closer than ${MIN_SEPARATION} units — their r=12 hit circles overlap and one ` +
      `silently opens the other:\n  ${collisions.join('\n  ')}`,
  );
});

test('the layout is deterministic — a patient sees the same map every visit', () => {
  // No Math.random anywhere. Two independent computations must be identical,
  // or the map would rearrange itself between renders.
  const a = computeDotPositions(BPS_SUBDOMAINS);
  const b = computeDotPositions(BPS_SUBDOMAINS);
  assert.deepEqual(a, b);
});

test('the seven overlap items land in an intersection, not a pure lobe', () => {
  const overlaps = BPS_SUBDOMAINS.filter((s) => s.overlap);
  assert.equal(overlaps.length, 7, 'taxonomy should declare 7 overlap subdomains');
  for (const s of overlaps) {
    const p = DOT_POSITION_BY_KEY[s.key];
    // Region label is carried through so the a11y string can name it.
    assert.equal(p.region, s.overlap, `${s.key} should be placed in its ${s.overlap} region`);
  }
});

test('the historically misplaced twelve are now correct', () => {
  // Named explicitly. These are the ones the 2026-08-07 audit measured as
  // wrong; if the derivation ever regresses, the failure should say so in the
  // same words the audit did rather than as an anonymous count.
  const wereWrong = [
    'attitudes_beliefs', 'culture', 'faith_spiritual', 'family_circumstances',
    'genes', 'grief', 'immune_stress_response', 'life_events', 'peer_group',
    'socioeconomic_status', 'substance_use', 'trauma',
  ];
  for (const key of wereWrong) {
    const s = BPS_SUBDOMAINS.find((x) => x.key === key);
    assert.ok(s, `${key} vanished from the taxonomy`);
    const p = DOT_POSITION_BY_KEY[key];
    assert.ok(
      isInRegion(p.x, p.y, s.domain, s.overlap),
      `${key} is misplaced again — it was one of the original 12`,
    );
  }
});
