/**
 * COS-1022 — the "?" in the middle of the care circle.
 *
 * Vishal photographed Home mid-cold-start with a "?" where his own avatar
 * belongs. Every circle view declares `patientName = ''` as its DEFAULT
 * parameter, and the avatar asked for `patientName ?? 'Patient'`. Nullish
 * coalescing replaces null and undefined only — '' survives it, reaches
 * nameToInitials, hits `if (!raw) return '?'`, and renders.
 *
 * Same class as COS-1020: a terminal fallback displayed while the real value
 * is still in flight. `||` is correct here because an empty string is not a
 * name worth rendering.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// The comment explains why `??` was wrong, so an assertion banning `??` must
// not read it.
const HOME = stripComments(read('app/Home/index.tsx'));
const ICON = read('components/icons/EntityIcon.tsx');

test('THE POINT: no avatar name falls back with ?? — the default is an empty string', () => {
  assert.doesNotMatch(HOME, /patientName \?\? 'Patient'/);
  assert.doesNotMatch(HOME, /\w+\.(name|providerName) \?\? 'Provider'/);
});

test('every patient avatar uses || so the empty-string default is caught', () => {
  const uses = HOME.match(/patientName \|\| 'Patient'/g) ?? [];
  assert.ok(uses.length >= 4, `expected every circle view covered, found ${uses.length}`);
});

test('the default parameter really is an empty string — this is why ?? failed', () => {
  // If this ever becomes `patientName = undefined`, ?? would have been fine and
  // this whole guard is moot. It is not, today.
  assert.match(HOME, /patientName = ''/);
});

test('nameToInitials still returns ? for a genuinely unknown entity', () => {
  // The fallback itself is correct and must stay — the bug was reaching it
  // with a placeholder empty string, not the behaviour when truly unknown.
  assert.match(ICON, /if \(!raw\) return '\?'/);
});
