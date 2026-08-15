/**
 * The assessment detail screen (SCRUM-675, 3 of 3).
 *
 * Two things this closes:
 *   1. the self-assessment cards were tappable and went NOWHERE —
 *      `onOpenInstrument` is optional and no mount point passed it
 *   2. subscale scores had nowhere to render
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCREEN = codeOnly(read('app/Home/assessment-detail.tsx'));
const TRENDS = codeOnly(read('components/health-plan/SelfAssessmentTrends.tsx'));

test('EVERY card branch now routes somewhere', () => {
  // There are two card renderers behind a kill-switch. Wiring one and not the
  // other would leave half the taps dead, which is how this shipped before.
  const dead = TRENDS.match(/onOpenInstrument\?\.\(record\.instrumentId\)/g) ?? [];
  assert.deepEqual(dead, [], 'no card may call the optional prop directly');
  const wired = TRENDS.match(/openInstrument\(record\.instrumentId\)/g) ?? [];
  assert.equal(wired.length, 2, 'both card branches must be wired');
});

test('an explicit onOpenInstrument still wins', () => {
  // The prop is public API; a caller may want its own destination.
  assert.match(TRENDS, /if \(onOpenInstrument\) \{\s*onOpenInstrument\(instrumentId\)/);
});

test('history is re-sorted newest-first, not trusted', () => {
  // The trends carousel already learned this: an oldest-first response made an
  // improving patient read as worsening.
  assert.match(SCREEN, /\.sort\(\(a, b\) => \(b\.completedAt \?\? ''\)\.localeCompare\(a\.completedAt \?\? ''\)\)/);
});

test('an INCOMPLETE subscale never renders a number', () => {
  // A two-item subscale answered once is a different quantity wearing the same
  // label; beside properly scored rows it would invite the comparison it
  // cannot support.
  assert.match(SCREEN, /s\.complete \?/);
  assert.match(SCREEN, /answered\} of \$\{s\.total\} answered/);
});

test('the screen works with NO subscales — that is every instrument today', () => {
  assert.match(SCREEN, /subscales\.length > 0 \? \(/);
  // ...and still shows the latest result plus history without them.
  assert.match(SCREEN, /Your latest result/);
  assert.match(SCREEN, /Previous results/);
});

test('a patient who has never taken it gets words, not an empty screen', () => {
  assert.match(SCREEN, /haven&apos;t completed this check-in yet/);
});
