/**
 * COS-1153 — a dose schedule is never invented.
 *
 * COS-1111 moved `frequency` off the sig text and onto the structured timing,
 * and its comment says the field "stays empty when the EHR sent none". The
 * guard it shipped only asked whether a `timing` block EXISTS — and a FHIR
 * `repeat` legitimately carries nothing but `boundsPeriod`, a start and end
 * date with no schedule. All three `??` defaults then fired.
 *
 * Measured on real records: 98 of 100 sampled active medications carry a
 * `timing.repeat`, and ALL 98 carry no frequency and no period. Every one
 * rendered "1x per 1 day". 62 have sig text reading "as needed" — the screen
 * was telling patients to take a PRN medication daily.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../services/api/patient.ts', import.meta.url), 'utf8');
/* The comment quotes the bug, so match on code only. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the FREQUENCY field is the guard, not the presence of a timing block', () => {
  assert.match(CODE, /typeof timing\?\.frequency === 'number'/);
  // The old guard asked only whether `timing` was truthy.
  assert.ok(!/const frequency =\s*\n?\s*timing\s*$/m.test(CODE));
});

test('frequency is never defaulted to 1', () => {
  // `timing.frequency ?? 1` is what printed "1x per 1 day" on every row.
  const i = CODE.indexOf('const frequency =');
  const expr = CODE.slice(i, CODE.indexOf(';', i));
  assert.ok(!expr.includes('frequency ?? 1'), 'no invented frequency');
});

test('a repeat with no frequency yields an empty string, not a sentence', () => {
  const i = CODE.indexOf('const frequency =');
  const expr = CODE.slice(i, CODE.indexOf(';', i));
  assert.match(expr, /:\s*''/);
});

test('period and periodUnit may still default — but only alongside a real frequency', () => {
  /*
   * Deliberate and different: once the EHR has stated a frequency, "3x per
   * day" is the conventional reading of a missing period. The invention was
   * the frequency itself.
   */
  const i = CODE.indexOf('const frequency =');
  const expr = CODE.slice(i, CODE.indexOf(';', i));
  assert.ok(expr.includes('timing.period ?? 1'));
  assert.ok(expr.includes("timing.periodUnit ?? 'day'"));
});
