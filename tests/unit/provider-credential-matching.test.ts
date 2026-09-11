/**
 * COS-968 — a doctor is not a physician assistant because their name
 * starts with "Pa".
 *
 * Ken, 2026-09-10, on the provider pages: they "don't filter it in a
 * meaningful way". One concrete reason: every keyword was matched with
 * `combined.includes(keyword)` against a string that concatenates
 * qualifications, specialty AND NAME, so two-letter credentials matched
 * inside ordinary words. The rows in the first test are REAL production
 * rows that were misfiled on 2026-09-10.
 *
 * A real unit test, not a source-contract one: the categoriser is a pure
 * function over strings and imports nothing, so it loads directly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Relative, not `@/` — node --test does not resolve the alias.
import { matchesKeyword, categorizeProvider } from '../../services/provider-categorization.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'services/provider-categorization.ts'), 'utf8');

test('THE POINT: a short credential must stand alone, not hide inside a name', () => {
  const realRows = [
    { name: 'padma dasari md', wrong: 'pa', right: 'md' },
    { name: 'paul d espy md', wrong: 'pa', right: 'md' },
    { name: 'scott daniel casey md', wrong: 'ot', right: 'md' },
    { name: 'patricia h', wrong: 'pa', right: null },
  ];
  for (const row of realRows) {
    assert.equal(
      matchesKeyword(row.name, row.wrong),
      false,
      `"${row.name}" must NOT match the credential "${row.wrong}"`,
    );
    if (row.right) {
      assert.equal(
        matchesKeyword(row.name, row.right),
        true,
        `"${row.name}" must still match its real credential "${row.right}"`,
      );
    }
  }
});

test('and the whole categoriser now files those rows correctly', () => {
  // The predicate is only worth fixing if the thing on screen changes.
  const padma = categorizeProvider({ name: 'PADMA DASARI', qualifications: 'MD' });
  assert.notEqual(
    padma.subCategory,
    'Physician Assistants',
    'Dr Dasari was filed under Physician Assistants because of "Pa"',
  );
  const casey = categorizeProvider({ name: 'SCOTT DANIEL CASEY', qualifications: 'MD' });
  assert.notEqual(
    casey.subCategory,
    'Physical/Occupational Therapists',
    'Dr Casey was filed under therapists because of "ot" in "Scott"',
  );
});

test('a genuine PA is still a PA', () => {
  // The fix must not swing the other way and empty the category.
  const pa = categorizeProvider({ name: 'Jane Doe', qualifications: 'PA-C' });
  assert.equal(pa.subCategory, 'Physician Assistants');
});

test('genuine credentials still match, in every position and punctuation', () => {
  const cases: [string, string][] = [
    ['jane doe pa', 'pa'],
    ['jane doe, pa-c', 'pa-c'],
    ['pa jane doe', 'pa'],
    ['jane doe r.n.', 'r.n'],
    ['smith ot', 'ot'],
    ['smith pt', 'pt'],
    ['adams gp', 'gp'],
  ];
  for (const [hay, kw] of cases) {
    assert.equal(matchesKeyword(hay, kw), true, `"${kw}" should match in "${hay}"`);
  }
});

test('long and multi-word keywords keep matching as substrings', () => {
  // Tightening these would LOSE matches inside longer specialty strings.
  assert.equal(matchesKeyword('board certified physician assistant', 'physician assistant'), true);
  assert.equal(matchesKeyword('cardiac rehabilitation unit', 'rehabilitation'), true);
  assert.equal(matchesKeyword('internal medicine', 'internal medicine'), true);
});

test('every keyword predicate in the module routes through the guard', () => {
  // The bug was one predicate repeated at nineteen call sites; a new raw
  // `combined.includes(keyword)` would reintroduce it for that list alone.
  assert.doesNotMatch(
    SRC,
    /combined\.includes\(keyword\)/,
    'a keyword list is matching raw — use matchesKeyword',
  );
  // The bare credential chain was the twentieth.
  assert.doesNotMatch(
    SRC,
    /quals\.includes\('(md|do|np|pa|rn|pt|ot|dc)'\)/,
    'the isMedical chain is matching credentials raw again',
  );
});
