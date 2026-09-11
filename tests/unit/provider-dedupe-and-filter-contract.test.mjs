/**
 * COS-971 — the two defects COS-968 introduced while fixing a third.
 *
 * Both were found by auditing my own change against LIVE data, not by any
 * test, and both are the kind that read correctly in the diff.
 *
 * ─── 1. THE DEDUPE HID DOCTORS ───────────────────────────────────────
 *
 * COS-968 merged every provider row sharing name+credentials, keeping
 * whichever had records. That fixed the real duplication (~39 doctors
 * arriving as 78 rows, once under the Epic FHIR id and once under the NPI).
 *
 * But production returns a PLACEHOLDER practitioner name with no specialty,
 * repeated — and on two live accounts the merge collapsed 17 and 15 DISTINCT
 * practitioner FHIR ids into one row. Sixteen doctors became unreachable.
 *
 * Showing a doctor twice is untidy. Hiding sixteen is dangerous. The fix
 * narrows the merge to the signature actually observed: EXACTLY TWO rows
 * where EXACTLY ONE carries records.
 *
 * ─── 2. THE REPLACEMENT FILTER DID NOTHING ───────────────────────────
 *
 * COS-968 replaced a filter that emptied the list (it read `lastVisited`,
 * which nothing writes) with "With records / No records yet". That predicate
 * short-circuits on `provider.category !== 'Medical'` — but `category` is
 * LOWERCASED at providers.ts:81, so the comparison was always true, every row
 * returned early, and both options produced the identical list.
 *
 * A destructive filter became a dead one. Nobody would have noticed: the list
 * looks plausible either way.
 *
 * Source-contract tests: providers.ts imports through the `@/` alias, which
 * `node --test` does not resolve. What matters is that these specific guards
 * survive the next edit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const API = read('services/api/providers.ts');
const SCREENS = ['app/Home/index.tsx', 'app/modal.tsx'];

test('THE POINT: a merge needs a PAIR, not just a matching name', () => {
  const fn = API.slice(API.indexOf('function dedupeByPerson'), API.indexOf('export async function fetchProviders'));
  // Both halves of the condition must be present. Either alone re-opens it:
  // pair-only without the data check merges two real people; the data check
  // without pair-only still collapses seventeen placeholder rows.
  assert.match(fn, /group\.length === 2/, 'the merge must require exactly two rows');
  assert.match(fn, /withData\.length === 1/, 'the merge must require exactly one side to hold records');
  // And anything that does not match must survive INTACT.
  assert.match(fn, /out\.push\(\.\.\.group\)/, 'a non-matching group must be kept whole');
});

test('the greedy "keep whichever has data" merge is gone', () => {
  const fn = API.slice(API.indexOf('function dedupeByPerson'), API.indexOf('export async function fetchProviders'));
  // The old shape: one Map holding a single survivor per key, overwritten by
  // a comparison. If that returns, so does the 17-doctor collapse.
  assert.doesNotMatch(fn, /best\.set\(key, p\)/, 'the single-survivor map is back');
  assert.doesNotMatch(fn, /\(p\.hasData \? 1 : 0\) - \(held\.hasData \? 1 : 0\)/, 'the greedy comparator is back');
});

test('a blank name is never an identity', () => {
  const fn = API.slice(API.indexOf('function dedupeByPerson'), API.indexOf('export async function fetchProviders'));
  // Unnamed rows must key to themselves or they all pool into one.
  assert.match(fn, /norm\(p\.name\) \? key : `\$\{key\}\|\$\{p\.id\}`/);
});

test('THE POINT: the records filter actually compares like with like', () => {
  for (const f of SCREENS) {
    const src = read(f);
    // `category` is lowercased upstream. Comparing it to a capitalised
    // literal is always true, which makes the whole filter a no-op.
    assert.doesNotMatch(
      src,
      /provider\.category !== 'Medical'/,
      `${f}: comparing lowercased category against 'Medical' — the filter does nothing`,
    );
    assert.match(
      src,
      /provider\.category\.toLowerCase\(\) !== 'medical'/,
      `${f}: the non-medical short-circuit must compare lowercase`,
    );
  }
});

test('category is still lowercased upstream, which is why the above matters', () => {
  // If this ever stops being true the comparison above must change with it.
  assert.match(API, /category: cat\.category\.toLowerCase\(\)/);
});

test('the filter still exempts the rows that can never have EHR records', () => {
  // Manually added people and non-medical supports have no records by
  // definition; a records filter must not hide them.
  for (const f of SCREENS) {
    const src = read(f);
    assert.match(src, /if \(provider\.isManual\) return true;/, `${f}: manual rows must be exempt`);
  }
});
