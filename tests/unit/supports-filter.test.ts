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

test('the filter renders only for categories whose records carry dates', () => {
  /*
   * Vishal: "outside we have agencies, social, where these filters are not
   * applicable and not required." A band is computed from clinical records, so
   * offering it on the social list was offering to filter by something that
   * list does not have.
   */
  assert.ok(
    /\{\(category\.id === 'medical' \|\| category\.id === 'integrative'\) && \(/.test(src),
    'the filter must be gated to medical/integrative',
  );
  // And it must NOT be back in the modal header, above every category.
  const header = src.slice(src.indexOf('styles.modalHeader'), src.indexOf('SUPPORTS'));
  assert.ok(!/<FilterMenu/.test(header), 'no filter in the modal header');
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

test('the active filter is visible without opening the menu', () => {
  // The selection was only ever shown inside the menu, which is closed by the
  // time you look at the list it was supposed to change.
  assert.ok(
    /RECENCY_FILTERS\.find\(f => f\.id === recencyFilter\)\?\.label/.test(src),
    'the chosen band must be printed beside the control',
  );
});
