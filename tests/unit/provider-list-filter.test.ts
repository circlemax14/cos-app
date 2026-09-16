import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * COS-1012 — the provider list must be FILTERED, not merely ordered.
 *
 * COS-1011 sorted by involvement and left everyone in. Vishal opened several
 * providers who had never treated him and reported the filter missing — putting
 * someone twentieth is not removing them.
 *
 * Measured on a real 59-row record: 22 treated, 7 on paperwork only, 30 in no
 * clinical record at all.
 */
const SRC = readFileSync(join(process.cwd(), 'services/api/providers.ts'), 'utf8');

test('the list is filtered to providers who treated the patient', () => {
  assert.match(
    SRC,
    /clinicians\.filter\(\(p\) => p\.involvement === 'treated'\)/,
    'the list must be filtered to treated providers',
  );
});

test('it fails OPEN when no provider carries involvement', () => {
  /*
   * An older API, a failed field or an undeployed stage would otherwise empty
   * the provider list completely. A blank list is a far worse failure than an
   * over-full one — it reads as "you have no doctors".
   */
  assert.match(
    SRC,
    /if \(labelled\.length === 0\) return clinicians;/,
    'with no involvement data at all, the unfiltered list must be returned',
  );
});

test('it does not claim the patient was never treated', () => {
  // If nothing is labelled 'treated', fall back to everyone in the record
  // rather than rendering an empty screen.
  assert.match(SRC, /if \(treated\.length > 0\) return treated;/);
  assert.match(SRC, /p\.involvement === 'mentioned'/);
});
