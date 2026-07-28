/**
 * lib/wellbeing-caption.ts
 *
 * Pure helper for the Direction 1 hero score composition (COS-479).
 * Maps a composite wellbeing score and its prior-week value to a short,
 * warm, plain-English caption sitting under the 96pt hero number.
 *
 * Constraints:
 * - Pure: no React, no I/O, no side effects. Fully unit-testable.
 * - 5th-grade reading level. No jargon. No clinical framing.
 * - Deterministic on inputs — thresholds exported so tests can pin them.
 *
 * Threshold ordering matters: the "big jump" (>10 / <-10) checks must be
 * evaluated before the "small jump" (>3 / <-3) checks, otherwise every
 * larger delta silently degrades to the smaller-delta copy.
 */

// -----------------------------------------------------------------------------
// Threshold constants (exported for tests + future tuning)
// -----------------------------------------------------------------------------

/** Delta > this = "A little better than last week." */
export const CAPTION_SMALL_UP_THRESHOLD = 3;

/** Delta > this = "Much better than last week." */
export const CAPTION_BIG_UP_THRESHOLD = 10;

/** Delta < -this = "A little lower than last week." (spec: delta < -3) */
export const CAPTION_SMALL_DOWN_THRESHOLD = -3;

/** Delta < -this = "A little rougher than last week." (spec: delta < -10) */
export const CAPTION_BIG_DOWN_THRESHOLD = -10;

// -----------------------------------------------------------------------------
// Caption strings (exported so consumers + tests can reference by name)
// -----------------------------------------------------------------------------

export const CAPTION_NO_COMPOSITE = "Here is today's number.";
export const CAPTION_FIRST_SCORE = "Your first wellbeing score.";
export const CAPTION_BIG_UP = "Much better than last week.";
export const CAPTION_SMALL_UP = "A little better than last week.";
export const CAPTION_SMALL_DOWN = "A little lower than last week.";
export const CAPTION_BIG_DOWN = "A little rougher than last week.";
export const CAPTION_STEADY = "About the same as last week.";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Compose the plain-English caption shown under the composite wellbeing score.
 *
 * @param composite  Current composite wellbeing score (0–100), or undefined
 *                   when we don't have one yet.
 * @param prior      Prior-week composite score, or undefined when this is the
 *                   patient's first-ever score.
 * @returns          A single short sentence, 5th-grade reading level.
 */
export function composePlainCaption(
  composite?: number,
  prior?: number,
): string {
  // 1. No current score — nothing to compare against.
  if (composite === undefined || composite === null || Number.isNaN(composite)) {
    return CAPTION_NO_COMPOSITE;
  }

  // 2. First-ever score — no prior to diff against.
  if (prior === undefined || prior === null || Number.isNaN(prior)) {
    return CAPTION_FIRST_SCORE;
  }

  const delta = composite - prior;

  // 3. Big/small changes — check the larger magnitudes FIRST so a big jump
  //    doesn't get swallowed by the small-jump branch.
  if (delta > CAPTION_BIG_UP_THRESHOLD) {
    return CAPTION_BIG_UP;
  }
  if (delta > CAPTION_SMALL_UP_THRESHOLD) {
    return CAPTION_SMALL_UP;
  }
  if (delta < CAPTION_BIG_DOWN_THRESHOLD) {
    return CAPTION_BIG_DOWN;
  }
  if (delta < CAPTION_SMALL_DOWN_THRESHOLD) {
    return CAPTION_SMALL_DOWN;
  }

  // 4. Within ±3 either way — call it steady.
  return CAPTION_STEADY;
}

export default composePlainCaption;
