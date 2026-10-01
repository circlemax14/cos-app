/**
 * add-latch — everything the nutrition card's add row is allowed to SAY, as
 * pure functions. COS-1220, extended by COS-1224.
 *
 * THE THREE FAILURES THIS SITS BETWEEN, all reported on that row:
 *
 *   2026-08-11 — "once deleted routines is still saying on your plan". A local
 *   `done` flag was OR'd with the derived check FOREVER, so deleting the item
 *   cleared it from the plan but not from the card.
 *
 *   COS-1220 — "Adding…" → "Add to my plan" → (1-2s) → "On your plan". The fix
 *   for the first bug deleted the local flag immediately and handed the answer
 *   to the derived source, which had not refetched yet, so for a moment
 *   NEITHER said added.
 *
 *   COS-1224 — the plan GET fails, so the derived source is an EMPTY SET rather
 *   than an absent one, and the card reads that as "nothing is on your plan".
 *   Every accepted suggestion offered "Add to my plan" again and tapping it
 *   minted a duplicate. Hence `derived: ReadonlySet<string> | null`: the
 *   unknowable case is in the TYPE, because an empty set and an unknown set are
 *   not the same answer and the compiler is the only thing that reliably
 *   remembers that.
 *
 * So the local flag may neither be kept forever nor dropped on acknowledgement.
 * It is a LATCH: it holds from the server's 200 until the derived source
 * actually contains the key, and is then released so the derived source — which
 * correctly reverts on delete — owns the answer from there on.
 *
 * TTL, and why it is not optional: the latch releases on CONFIRMATION, and
 * confirmation can never arrive (a label the server stores differently than we
 * sent it, so no derived key ever matches). Without a ceiling that is bug #1
 * again, permanently. With one, the worst case is a row that reads "On your
 * plan" — on the strength of a real 200 — for TTL, then defers to the plan.
 *
 * Deliberately pure and dependency-free: `now` is injected and nothing here
 * touches React, so the behaviour is testable without rendering (the section's
 * own test file reads source text and never mounts anything).
 */

/** key → epoch ms of the acknowledged add. */
export type AddLatch = Readonly<Record<string, number>>

export const EMPTY_LATCH: AddLatch = {}

/**
 * How long an UNCONFIRMED latch is honoured, once there is a derived source to
 * defer TO. Generous on purpose: in practice confirmation lands in well under a
 * second (the add mutation splices the server's full list into the cache in its
 * own onSuccess), so this only ever catches the pathological case above.
 *
 * It is a real ceiling, not a documented intention: the card arms a timer at
 * `nextLatchExpiry()` so the row re-reads itself when the window closes rather
 * than waiting for an incidental re-render (COS-1224).
 */
export const LATCH_TTL_MS = 30_000

/**
 * Every state the add row can be in that is NOT "added".
 *
 * Pinned as an exact set by the contract test, and that is the point: the
 * 2026-08-11 bug was a local member meaning ADDED sitting beside these. The
 * answer to "is it added?" comes from `isOnPlan` and nowhere else, so no member
 * here may ever mean added.
 */
export type AddRowState = 'saving' | 'failed' | 'capped' | 'no-plan'

/** Record a successful add. */
export function latchAdd(prev: AddLatch, key: string, now: number): AddLatch {
  return { ...prev, [key]: now }
}

/**
 * Release every latch the derived source now confirms, plus any that has run
 * out of time.
 *
 * `derived === null` (the plan is not known) releases NOTHING: there is nothing
 * to confirm against, and expiring into an unknown answer is how COS-1224 lost
 * a successful add.
 *
 * Returns `prev` ITSELF when there is nothing to release. That identity is
 * load-bearing: this runs from an effect keyed on the derived set, whose
 * identity changes on most renders, and a fresh object every time would be an
 * endless render loop.
 */
export function settleLatch(
  prev: AddLatch,
  derived: ReadonlySet<string> | null,
  now: number,
): AddLatch {
  if (derived === null) return prev
  const keys = Object.keys(prev)
  const keep = keys.filter((k) => !derived.has(k) && now - prev[k] < LATCH_TTL_MS)
  if (keep.length === keys.length) return prev
  const next: Record<string, number> = {}
  for (const k of keep) next[k] = prev[k]
  return next
}

/**
 * Does this row read as "on your plan"?
 *
 * The derived source wins outright. The latch only answers while the derived
 * source still says no — which is exactly the window the flicker lived in.
 */
export function isOnPlan(
  key: string,
  latch: AddLatch,
  derived: ReadonlySet<string> | null,
  now: number,
): boolean {
  /*
   * The plan is not known. A real 200 for THIS key is then the only evidence
   * anybody has, and it does not expire — the TTL exists to hand the answer
   * back to the derived source, and there is no derived source to hand it to.
   *
   * This is not the 2026-08-11 bug returning: the latch is not permanent, it is
   * suspended. The moment the plan is known again the clause below applies, a
   * deleted item reverts, and settleLatch sweeps.
   */
  if (derived === null) return latch[key] !== undefined
  if (derived.has(key)) return true
  const at = latch[key]
  return at !== undefined && now - at < LATCH_TTL_MS
}

/**
 * When does the earliest unconfirmed latch stop being honoured?
 *
 * The card reads `Date.now()` in its render body, so without a timer the TTL
 * only took effect on the next incidental re-render — and in the one case the
 * TTL exists for (confirmation never arrives) nothing else is re-rendering the
 * card. This is what the timer is set to.
 *
 * `null` means nothing is on a clock: either there is no unconfirmed latch, or
 * the plan is unknown and the latch is suspended rather than ticking.
 */
export function nextLatchExpiry(
  latch: AddLatch,
  derived: ReadonlySet<string> | null,
): number | null {
  if (derived === null) return null
  const due = Object.keys(latch)
    .filter((k) => !derived.has(k))
    .map((k) => latch[k] + LATCH_TTL_MS)
  return due.length === 0 ? null : Math.min(...due)
}

/**
 * Why did the add fail, in the only terms the row cares about: can the patient
 * do anything about it?
 *
 * COS-1224 — every failure rendered "Couldn't add — tap to retry", including
 * the two that can never succeed. Retrying the 20-routine cap just fails again,
 * and one production plan already carries 11 routines while every regeneration
 * emits more, so this is reachable.
 *
 * Reads the axios error shape without importing axios, which keeps this module
 * dependency-free and therefore testable in plain node.
 */
export function addFailureState(err: unknown): Exclude<AddRowState, 'saving'> {
  const code = (err as { response?: { data?: { code?: string } } } | null | undefined)?.response
    ?.data?.code
  // cos-backend plan-habits.routes.ts: 400 HABIT_CAP_REACHED, 404 NO_PLAN.
  if (code === 'HABIT_CAP_REACHED') return 'capped'
  if (code === 'NO_PLAN') return 'no-plan'
  return 'failed'
}

/**
 * COS-1224 — the routine endpoint's caps, mirrored from
 * cos-backend/src/routes/plan-habits.routes.ts `createHabitSchema`:
 * `label: z.string().min(1).max(60)` and `rationale: z.string().max(200)`.
 * Kept as named constants so the next person who changes one grep-finds the
 * other, instead of discovering the mismatch as a 400 on the patient's tap.
 */
export const HABIT_LABEL_MAX = 60
export const HABIT_RATIONALE_MAX = 200

/**
 * Trim to `max` on a WORD boundary, never mid-word.
 *
 * A hard slice is what the task-shaped payload did, and on a 60-char ceiling
 * it reads as a typo rather than a shortening — "Swap one sugary drink a day
 * for sparkling water with a squ". Falls back to a hard slice only when the
 * first word is itself longer than the budget.
 */
export function clampAtWord(text: string, max: number): string {
  const t = (text ?? '').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()
}
