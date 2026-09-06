/**
 * COS-820 — the one line a goal card shows.
 *
 * The card has three facts available and room for one. Picking wrong means
 * telling someone their adherence is fine on a goal that went past its date
 * three weeks ago, or showing 0% on a goal they are keeping perfectly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalStatusLine } from '../../lib/goal-status.ts';

const g = (progress: unknown) => ({ progress } as Parameters<typeof goalStatusLine>[0]);

test('THE POINT: overdue outranks everything', () => {
  // A goal three weeks past its date does not need to be told it hit 80%.
  const out = goalStatusLine(g({
    daysRemaining: -21,
    adherence: { linkedTasks: 3, scheduled: 5, completed: 4, percent: 80, windowDays: 7 },
  }));
  assert.equal(out?.text, '21 days past its target date');
  assert.equal(out?.tone, 'bad');
});

test('adherence is the line when there is work to report', () => {
  const out = goalStatusLine(g({
    daysRemaining: 12,
    adherence: { linkedTasks: 2, scheduled: 6, completed: 5, percent: 83, windowDays: 7 },
  }));
  assert.equal(out?.text, '5 of 6 this week · 12 days left');
  assert.equal(out?.tone, 'good');
});

test('THE POINT: nothing due is not 0%', () => {
  // percent === null means no occurrence fell in the window. Rendering a zero
  // would call a perfectly-kept weekly goal a failure.
  const out = goalStatusLine(g({
    adherence: { linkedTasks: 2, scheduled: 0, completed: 0, percent: null, windowDays: 7 },
  }));
  assert.equal(out?.text, '2 linked tasks');
  assert.equal(out?.tone, 'neutral');
});

test('the tone tracks the number, not the mood', () => {
  const at = (percent: number, completed: number) =>
    goalStatusLine(g({ adherence: { linkedTasks: 4, scheduled: 10, completed, percent, windowDays: 7 } }))?.tone;
  assert.equal(at(80, 8), 'good');
  assert.equal(at(50, 5), 'warn');
  assert.equal(at(30, 3), 'bad');
});

test('due today reads as due today, not "0 days left"', () => {
  assert.equal(goalStatusLine(g({ daysRemaining: 0 }))?.text, 'Due today');
});

test('singulars are singular', () => {
  assert.equal(goalStatusLine(g({ daysRemaining: 1 }))?.text, '1 day left');
  assert.equal(goalStatusLine(g({ daysRemaining: -1 }))?.text, '1 day past its target date');
});

test('THE POINT: nothing true to say returns null', () => {
  // An empty string on a card reads as a loading state that never resolves.
  assert.equal(goalStatusLine(g(undefined)), null);
  assert.equal(goalStatusLine(g({})), null);
  assert.equal(goalStatusLine(g({ adherence: { linkedTasks: 0, scheduled: 0, completed: 0, percent: null, windowDays: 7 } })), null);
});

test('an ongoing goal with work still reports the work', () => {
  // No targetDate is the common case — five of eight goals on a real plan.
  const out = goalStatusLine(g({
    adherence: { linkedTasks: 3, scheduled: 7, completed: 7, percent: 100, windowDays: 7 },
  }));
  assert.equal(out?.text, '7 of 7 this week');
  assert.equal(out?.tone, 'good');
});

// ── the card wiring ──────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const card = readFileSync(join(root, 'components/health-plan/BioGoalCard.tsx'), 'utf8');

test('THE POINT: the card renders nothing when there is nothing to say', () => {
  // goalStatusLine returns null for most goals today. The render must be
  // guarded on the value, not on the object — `{statusLine.text}` inside a
  // truthy check on `g.progress` would crash on a goal with progress but no
  // sayable line.
  assert.match(card, /\{statusLine && \(/);
});

test('the status tones are NOT the wellbeing palette', () => {
  // This says whether the WORK is happening, not whether the patient is well.
  // Borrowing the clinical colours would make a missed week look like a
  // health finding.
  assert.match(card, /const STATUS_TONE = \{/);
  assert.match(card, /good: \{ fg: '#0E7490'/);
});
