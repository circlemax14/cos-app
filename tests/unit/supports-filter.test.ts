/**
 * COS-1101 — the Supports modal has ONE filter, and it lives where it applies.
 *
 * Read as source text: app/modal.tsx is a 1,200-line screen with react-native
 * imports that `node --test` cannot load (see cos-app CLAUDE.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('app/modal.tsx', 'utf8');

test('the records filter is gone entirely, not merely hidden', () => {
  // Vishal: "there was already one filter, but now you added one more. We
  // should get only one." It asked a question the recency filter answers
  // better, and two overlapping controls make the reader work out how they
  // combine.
  assert.ok(!/RECORD_FILTERS/.test(src), 'RECORD_FILTERS must be removed');
  assert.ok(!/lastVisitedFilter/.test(src), 'its state must be removed');
  // Quoted, so the comment explaining the removal does not count as a use.
  assert.ok(!/'with-records'|'without-records'/.test(src), 'its options must be removed');
});

test('exactly one FilterMenu is rendered', () => {
  const rendered = src.match(/<FilterMenu/g) ?? [];
  assert.strictEqual(rendered.length, 1, 'one filter control, not two');
});

test('the filter sits in the SUPPORTS header, beside the close button', () => {
  /*
   * COS-1103 — Vishal: "the place of the filter should be where it was already
   * there, like in this supports line where we have cross on the right side."
   *
   * COS-1101 had moved it into the Medical body. That fixed the wrong half:
   * the problem was never the position, it was that the control appeared on
   * tabs it could not filter.
   */
  const header = src.slice(src.indexOf('styles.modalHeader'), src.indexOf('SUPPORTS'));
  assert.ok(/<FilterMenu/.test(header), 'the filter must render in the header');
});

test('it is shown only on tabs where a band means something', () => {
  // A band is computed from dated clinical records. On Agencies and Social it
  // can filter nothing, which is what made it noise at the top before.
  assert.ok(
    /activeCategoryId === 'medical' \|\| activeCategoryId === 'integrative'/.test(src),
    'visibility must be gated on the open category',
  );
  assert.ok(
    /setActiveCategoryIndex\(index\)/.test(src),
    'the tabs must report which category is open — the header sits above them',
  );
});

test('an applied filter is indicated ON the control', () => {
  // Vishal: "there should be some kind of indicator that filter is applied."
  assert.ok(/active=\{isRecencyFilterActive\}/.test(src), 'the trigger must show active state');
  const menu = readFileSync('components/ui/filter-menu.tsx', 'utf8');
  assert.ok(/styles\.activeDot/.test(menu), 'the dot must render');
});

test('"Everyone" does not count as an applied filter', () => {
  /*
   * It is the OFF position. A dot there would claim the control is narrowing a
   * list it is showing in full — the opposite of what an indicator is for.
   */
  assert.ok(
    /recencyFilter !== null && recencyFilter !== 'all'/.test(src),
    'the off position must not light the indicator',
  );
});

test('a bypassed filter SAYS it was bypassed', () => {
  /*
   * Vishal: "if I click on any filter like stable and resolved, that row is
   * highlighted but I don't see anywhere the filters are applied."
   *
   * He was watching the fail-open work as designed. Skipping the filter when
   * no provider has a date is right — every row would vanish otherwise — but
   * doing it silently is indistinguishable from a broken control.
   */
  assert.ok(/anyRecencyData/.test(src), 'the bypass condition must be nameable by the UI');
  assert.ok(
    /we do not have visit dates for these providers yet/.test(src),
    'the bypass must be explained on screen',
  );
});

test('the active filter is legible without opening the menu', () => {
  /*
   * COS-1101 printed the chosen band as text beside the control. COS-1103
   * moved the control into the header, where there is no room for a label —
   * so the DOT carries that job, and the state is spelled out for VoiceOver
   * in the accessibility label instead of being inferable only from a colour.
   */
  assert.ok(/active=\{isRecencyFilterActive\}/.test(src), 'the dot reflects the state');
  assert.ok(
    /Currently \$\{activeRecencyLabel\}/.test(src),
    'the chosen band must be announced, not left to colour alone',
  );
});
