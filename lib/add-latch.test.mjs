/**
 * The add-latch, as a sequence of moments.
 *
 * COS-1220 reported: "Adding…" → "Add to my plan" → (1-2s) → "On your plan".
 * The middle frame is the bug, and it is a TIMING bug — so these tests walk the
 * timeline explicitly rather than asserting on any one snapshot.
 *
 * The earlier bug (2026-08-11, "once deleted routines is still saying on your
 * plan") is the other side of the same coin and is asserted here too: a fix for
 * either one that reintroduces the other fails this file.
 *
 * COS-1224 added the third state — the plan is NOT KNOWN — and moved the
 * regression guard for the 2026-08-11 bug here, out of the contract file. It was
 * a pair of substring greps over the component's source
 * (`doesNotMatch(/'saving' | 'done'/)`), and a reviewer reproduced "On your plan
 * forever" with the suite green by widening the union to
 * `'saving' | 'failed' | 'done'` — which that grep does not match. The guarantee
 * is behavioural, so it is asserted behaviourally: once the derived source stops
 * reporting an item, isOnPlan reverts, at every horizon.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_LATCH,
  LATCH_TTL_MS,
  addFailureState,
  isOnPlan,
  latchAdd,
  nextLatchExpiry,
  settleLatch,  HABIT_LABEL_MAX,
  HABIT_RATIONALE_MAX,
  clampAtWord,
} from './add-latch.ts';

const KEY = 'eat a vegetable with lunch';

test('THE BUG: the row never reads "not added" between the 200 and the refetch', () => {
  // t=0 nothing on the plan, nothing latched → the add affordance.
  let latch = EMPTY_LATCH;
  let derived = new Set();
  assert.equal(isOnPlan(KEY, latch, derived, 0), false);

  // t=100 the server said 200. The derived source has NOT caught up — this is
  // the exact frame that used to render "Add to my plan".
  latch = latchAdd(latch, KEY, 100);
  assert.equal(isOnPlan(KEY, latch, derived, 100), true, 'must read as added the instant the add succeeds');

  // t=150..1600 still no refetch. Every frame in the window must hold.
  for (const t of [150, 400, 900, 1600]) {
    assert.equal(isOnPlan(KEY, latch, derived, t), true, `regressed at t=${t}`);
  }

  // t=1700 the refetch lands.
  derived = new Set([KEY]);
  assert.equal(isOnPlan(KEY, latch, derived, 1700), true);
});

test('AND THE OTHER BUG: it reverts once the item is deleted', () => {
  let latch = latchAdd(EMPTY_LATCH, KEY, 100);
  const derived = new Set([KEY]);

  // Confirmation releases the latch — this is what stops the delete below from
  // being papered over by a stale local flag.
  latch = settleLatch(latch, derived, 200);
  assert.deepEqual(latch, {}, 'a confirmed latch must be released, not kept');

  // The patient deletes the routine a few seconds later. Well inside the TTL,
  // so a latch that had merely expired-later would still be lying here.
  assert.equal(isOnPlan(KEY, latch, new Set(), 5_000), false);
});

test('an unconfirmed latch is not honoured forever', () => {
  // The failure that makes the TTL necessary: the stored label never matches
  // what we latched, so confirmation never arrives.
  const latch = latchAdd(EMPTY_LATCH, KEY, 0);
  const never = new Set(['something the server named differently']);
  assert.equal(isOnPlan(KEY, latch, never, LATCH_TTL_MS - 1), true);
  assert.equal(isOnPlan(KEY, latch, never, LATCH_TTL_MS), false, 'must defer to the plan eventually');
  assert.deepEqual(settleLatch(latch, never, LATCH_TTL_MS), {}, 'and be swept');
});

test('settleLatch returns the SAME object when nothing changes', () => {
  // Load-bearing: it runs from an effect keyed on the derived set, whose
  // identity changes on most renders. A fresh object every call is a render
  // loop, not a cosmetic waste.
  const latch = latchAdd(EMPTY_LATCH, KEY, 1_000);
  assert.strictEqual(settleLatch(latch, new Set(), 1_100), latch);
  assert.strictEqual(settleLatch(EMPTY_LATCH, new Set(['x']), 1_100), EMPTY_LATCH);
});

test('one row settling leaves the others latched', () => {
  // Two suggestions added back to back; only the first has been confirmed.
  let latch = latchAdd(EMPTY_LATCH, 'a', 100);
  latch = latchAdd(latch, 'b', 120);
  const derived = new Set(['a']);
  latch = settleLatch(latch, derived, 200);
  assert.deepEqual(Object.keys(latch), ['b']);
  assert.equal(isOnPlan('a', latch, derived, 200), true, 'confirmed by the plan');
  assert.equal(isOnPlan('b', latch, derived, 200), true, 'still latched');
});

test('the derived source alone is enough — no latch required', () => {
  // A suggestion already on the plan from a previous session. Local state
  // resets on every app launch; the plan does not.
  assert.equal(isOnPlan(KEY, EMPTY_LATCH, new Set([KEY]), Date.now()), true);
});


// ── COS-1224: the plan is not always KNOWN ───────────────────────────
//
// `derived` was a Set, and `habits: []` arrived both when the patient had no
// routines and when the plan GET failed (fetchAiHealthPlan swallows its errors
// and resolves to null). The card read the failure as "nothing is on your
// plan" and offered "Add to my plan" under items already added; the second tap
// minted a duplicate. `null` is that third answer.

test('an unknown plan is not an empty plan', () => {
  // Same latch, same clock, two different derived answers.
  const latch = latchAdd(EMPTY_LATCH, KEY, 0);

  // Known and empty: the plan says it is NOT there, so the TTL applies and the
  // row eventually goes back to offering the add.
  assert.equal(isOnPlan(KEY, latch, new Set(), LATCH_TTL_MS), false);

  // Not known: the 200 we got is the only evidence anyone has, and there is no
  // derived source to hand the answer back to. It does not expire.
  assert.equal(isOnPlan(KEY, latch, null, LATCH_TTL_MS), true);
  assert.equal(isOnPlan(KEY, latch, null, LATCH_TTL_MS * 1_000), true);
});

test('an unknown plan confirms nothing and expires nothing', () => {
  const latch = latchAdd(EMPTY_LATCH, KEY, 0);
  // Long past the TTL. A sweep here would throw away the only record of a
  // successful add — COS-1224 MAJOR 1 — so it must return the latch untouched,
  // and by identity, because this runs from a render-keyed effect.
  assert.strictEqual(settleLatch(latch, null, LATCH_TTL_MS * 10), latch);
});

test('a row with no latch is not claimed either way while the plan is unknown', () => {
  // The other half of MAJOR 1: the card must not say "Add to my plan" — a
  // confident claim — about an item it cannot check.
  assert.equal(isOnPlan('never added', EMPTY_LATCH, null, 0), false);
  // ...and the component reads `derived === null` to render "not sure yet"
  // rather than the add offer. isOnPlan answers only the added question.
});

test('the suspension ends the moment the plan lands', () => {
  // Not permanence (which would be the 2026-08-11 bug): the latch is suspended
  // while the plan is unknown and goes straight back on the clock after.
  const latch = latchAdd(EMPTY_LATCH, KEY, 0);
  assert.equal(isOnPlan(KEY, latch, null, LATCH_TTL_MS + 5_000), true, 'suspended');
  assert.equal(
    isOnPlan(KEY, latch, new Set(), LATCH_TTL_MS + 5_000),
    false,
    'the plan landed, empty, and the window had already closed',
  );
  assert.deepEqual(settleLatch(latch, new Set(), LATCH_TTL_MS + 5_000), {}, 'and is swept');
});

// ── COS-1224 MAJOR 2: the 2026-08-11 guard, as behaviour ─────────────

test('REGRESSION 2026-08-11: nothing local may outlive the plan dropping an item', () => {
  // "once deleted routines is still saying on your plan". The row's entire
  // answer is this function, so this is the guarantee, stated once: when the
  // derived source stops reporting the key, the row stops saying added — at
  // every horizon, from any starting state.
  const confirmedThenReleased = settleLatch(latchAdd(EMPTY_LATCH, KEY, 0), new Set([KEY]), 10);
  const neverConfirmed = latchAdd(EMPTY_LATCH, KEY, 0);
  const gone = new Set();

  for (const [name, latch] of [
    ['no latch at all', EMPTY_LATCH],
    ['added, confirmed, released', confirmedThenReleased],
    ['added, never confirmed, TTL elapsed', neverConfirmed],
  ]) {
    for (const t of [LATCH_TTL_MS, LATCH_TTL_MS + 1, LATCH_TTL_MS * 1_000]) {
      assert.equal(isOnPlan(KEY, latch, gone, t), false, `${name} at t=${t}`);
    }
  }

  // The one state that still reads added is a 200 inside its window, which is
  // COS-1220's fix and not local state outliving anything.
  assert.equal(isOnPlan(KEY, neverConfirmed, gone, LATCH_TTL_MS - 1), true);
});

// ── COS-1224 MINOR 3: the TTL needs a clock ──────────────────────────

test('nextLatchExpiry says WHEN the window closes, so a timer can be armed', () => {
  // Without this the component read Date.now() in its render body and nothing
  // re-rendered it, so LATCH_TTL_MS was a documented intention rather than a
  // ceiling.
  assert.equal(nextLatchExpiry(EMPTY_LATCH, new Set()), null, 'nothing latched, no timer');

  const latch = latchAdd(latchAdd(EMPTY_LATCH, 'a', 1_000), 'b', 4_000);
  assert.equal(nextLatchExpiry(latch, new Set()), 1_000 + LATCH_TTL_MS, 'the EARLIEST expiry');

  // A confirmed key is released by settleLatch, not by the clock — arming a
  // timer for it would fire a timeout that changes nothing.
  assert.equal(nextLatchExpiry(latch, new Set(['a']), 0), 4_000 + LATCH_TTL_MS);
  assert.equal(nextLatchExpiry(latch, new Set(['a', 'b'])), null);

  // Unknown plan ⇒ the latch is suspended, not ticking. No timer, no spin.
  assert.equal(nextLatchExpiry(latch, null), null);
});

test('the armed timer actually releases the latch when it fires', () => {
  // The timer calls settleLatch with the clock it fires at; this is that call.
  const latch = latchAdd(EMPTY_LATCH, KEY, 1_000);
  const due = nextLatchExpiry(latch, new Set());
  assert.deepEqual(settleLatch(latch, new Set(), due), {});
  assert.equal(isOnPlan(KEY, settleLatch(latch, new Set(), due), new Set(), due), false);
});

// ── COS-1224 MINOR 4: two failures that can never succeed ────────────

test('the two unretryable backend codes are told apart from a retryable blip', () => {
  // Every failure used to render "Couldn't add — tap to retry", including the
  // 20-routine cap (one production plan already carries 11, and every
  // regeneration emits more) and NO_PLAN. Retrying either fails identically.
  const axiosish = (code) => ({ response: { status: 400, data: { code } } });
  assert.equal(addFailureState(axiosish('HABIT_CAP_REACHED')), 'capped');
  assert.equal(addFailureState(axiosish('NO_PLAN')), 'no-plan');

  // Anything else is a blip worth retrying — including the shapes that are not
  // axios errors at all, which is what a timeout or a thrown TypeError looks
  // like here.
  assert.equal(addFailureState(axiosish('INVALID_BODY')), 'failed');
  assert.equal(addFailureState(new Error('Network Error')), 'failed');
  assert.equal(addFailureState({ response: {} }), 'failed');
  assert.equal(addFailureState(undefined), 'failed');
  assert.equal(addFailureState(null), 'failed');
});

// ── COS-1224: the payload must fit the ROUTINE schema, not the task schema ──
//
// plan-habits.routes.ts `createHabitSchema` caps label at 60 and rationale at
// 200. The card used to send `slice(0, 120)` and an uncapped rationale, both
// shaped for createPlanTask, so a legal suggestion 400'd on the one action the
// card exists for. These pin the caps AND the word-boundary trim.
test('COS-1224: the caps match the routine endpoint, not the task endpoint', () => {
  assert.equal(HABIT_LABEL_MAX, 60, 'createHabitSchema caps label at 60')
  assert.equal(HABIT_RATIONALE_MAX, 200, 'createHabitSchema caps rationale at 200')
  assert.ok(HABIT_LABEL_MAX < 120, 'the old task-shaped 120 would be rejected')
})

test('COS-1224: a real suggestion title is trimmed on a word boundary', () => {
  const title = 'Swap one sugary drink a day for sparkling water with a squeeze of lime'
  assert.ok(title.length > HABIT_LABEL_MAX, 'premise: this legal title exceeds the cap')
  const out = clampAtWord(title, HABIT_LABEL_MAX)
  assert.ok(out.length <= HABIT_LABEL_MAX, 'fits the schema')
  assert.ok(!out.endsWith(' '), 'no trailing space')
  assert.ok(title.startsWith(out), 'a prefix of the original, never reworded')
  // the giveaway of a hard slice is a severed word
  assert.ok(/\s/.test(title[out.length] ?? ' '), 'cut landed on a word boundary')
})

test('COS-1224: short text and empty text are returned untouched', () => {
  assert.equal(clampAtWord('Add beans to one meal', HABIT_LABEL_MAX), 'Add beans to one meal')
  assert.equal(clampAtWord('', HABIT_LABEL_MAX), '')
})

test('COS-1224: a single word longer than the budget still fits', () => {
  const out = clampAtWord('x'.repeat(200), HABIT_LABEL_MAX)
  assert.equal(out.length, HABIT_LABEL_MAX, 'falls back to a hard slice rather than returning nothing')
})
