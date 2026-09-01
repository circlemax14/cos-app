/**
 * COS-810 — the per-plan accent.
 *
 * Its whole value is STABILITY: a card that changed colour because a neighbour
 * was edited would be worse than no colour at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planAccent, PLAN_ACCENTS } from '../../lib/plan-accent.ts';

test('THE POINT: the same plan always gets the same colour', () => {
  // Keyed off planKey, not list position, so adding or hiding a plan does not
  // recolour the others.
  for (const k of ['basic', 'standard', 'advanced', 'family', 'starter']) {
    assert.equal(planAccent(k), planAccent(k));
  }
});

test('position in the list is irrelevant', () => {
  // The failure this guards: an admin hides Family, and every card below it
  // shifts colour.
  const before = ['starter', 'basic', 'standard', 'family', 'advanced'].map(planAccent);
  const after = ['starter', 'basic', 'standard', 'advanced'].map(planAccent);
  assert.equal(before[0], after[0]);
  assert.equal(before[1], after[1]);
  assert.equal(before[2], after[2]);
  assert.equal(before[4], after[3], 'advanced must keep its colour when family is removed');
});

test('THE POINT: no accent is a status colour', () => {
  // Green, amber and red mean something in this app — wellbeing bands,
  // adherence, plausibility warnings. A plan accented green would read as a
  // verdict on the plan.
  for (const hex of PLAN_ACCENTS) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    assert.ok(b >= r, `${hex} is warm — accents must stay cool`);
    // Green is not "g is the largest channel" — the app's own brand teal
    // (#0D9488) has g=148 over b=136 and reads as teal, not as a verdict. What
    // separates green from teal is that green DROPS the blue channel, so the
    // ratio is the discriminator. #16A34A (a real success green) is g/b = 2.2.
    assert.ok(g <= b * 1.2, `${hex} reads as green, which means "good" elsewhere`);
  }
});

test('a missing key does not crash or return undefined', () => {
  assert.equal(planAccent(null), PLAN_ACCENTS[0]);
  assert.equal(planAccent(undefined), PLAN_ACCENTS[0]);
  assert.equal(planAccent(''), PLAN_ACCENTS[0]);
});

test('every accent is a real hex colour', () => {
  for (const hex of PLAN_ACCENTS) assert.match(hex, /^#[0-9A-F]{6}$/i);
});
