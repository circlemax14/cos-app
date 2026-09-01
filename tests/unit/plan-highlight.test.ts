/**
 * COS-808 — turning a free-text highlight into a table row.
 *
 * The prod chooser's cards read as a labelled table. Two of its four rows are
 * real plan config; the other two (Support, Best for) were hardcoded marketing
 * copy with no field anywhere in the plan model. Rather than freeze a marketing
 * decision into the schema, an admin writes `Label: value` in the highlights
 * they already have.
 *
 * That makes a PARSER the load-bearing piece, and a parser that guesses wrong
 * puts prose in a 84pt-wide column. These are the cases where a plausible
 * result would look broken on a patient's phone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHighlight, sortRows } from '../../lib/plan-highlight.ts';

test('a labelled highlight becomes a row', () => {
  assert.deepEqual(parseHighlight('Support: Self-directed'), {
    label: 'Support',
    value: 'Self-directed',
  });
});

test('THE POINT: an unlabelled highlight is left alone', () => {
  // Every plan authored before COS-808 has these, and they must render exactly
  // as they always did. No migration.
  assert.deepEqual(parseHighlight('Unlimited messaging with your care team'), {
    label: null,
    value: 'Unlimited messaging with your care team',
  });
});

test('only the FIRST colon splits', () => {
  // Otherwise the value loses everything after its own punctuation.
  assert.deepEqual(parseHighlight('Best for: complex care: many specialists'), {
    label: 'Best for',
    value: 'complex care: many specialists',
  });
});

test('THE POINT: a sentence is prose, not a label', () => {
  // A long run before a colon would be squeezed into the fixed label column
  // and wrap to four lines against an empty value. Falling back to a plain
  // line is the readable answer.
  const prose = 'Includes everything in Basic, plus the following: clinical screeners';
  assert.deepEqual(parseHighlight(prose), { label: null, value: prose });
});

test('a colon with nothing on one side is not a row', () => {
  for (const raw of ['Support:', ': Self-directed', ':', 'Support:   ']) {
    assert.equal(parseHighlight(raw).label, null, `"${raw}" should not become a row`);
  }
});

test('a leading colon never yields an empty label', () => {
  // indexOf(':') === 0 would slice to '' and render a blank column.
  assert.deepEqual(parseHighlight(':no label'), { label: null, value: ':no label' });
});

test('whitespace around the split is trimmed', () => {
  assert.deepEqual(parseHighlight('  Updates  :   Weekly  '), {
    label: 'Updates',
    value: 'Weekly',
  });
});

test('an empty highlight does not crash', () => {
  assert.deepEqual(parseHighlight(''), { label: null, value: '' });
});

// ── COS-812: canonical row order ─────────────────────────────────────────

test('THE POINT: rows land in the prod chooser\'s order, whatever the author did', () => {
  // Two admins writing the same rows in opposite orders would otherwise break
  // alignment across cards, silently.
  const rows = [{ label: 'Best for' }, { label: 'Support' }, { label: 'Assessment' }];
  assert.deepEqual(sortRows(rows).map((r) => r.label), ['Assessment', 'Support', 'Best for']);
});

test('unknown labels keep their author order, after the canonical ones', () => {
  const rows = [{ label: 'Zebra' }, { label: 'Best for' }, { label: 'Apple' }];
  assert.deepEqual(sortRows(rows).map((r) => r.label), ['Best for', 'Zebra', 'Apple']);
});

test('matching is case-insensitive', () => {
  // An admin typing "best for" must not fall to the bottom.
  const rows = [{ label: 'zzz' }, { label: 'best for' }];
  assert.deepEqual(sortRows(rows).map((r) => r.label), ['best for', 'zzz']);
});

test('sorting does not mutate the input', () => {
  const rows = [{ label: 'Best for' }, { label: 'Assessment' }];
  sortRows(rows);
  assert.equal(rows[0].label, 'Best for');
});
