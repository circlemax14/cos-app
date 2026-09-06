/**
 * COS-927 — height, entered the way the patient thinks of it.
 *
 * Vishal: "when we were asking hi[ght] to the patient, we are just asking for
 * the number, but there can also be two options — anyone can enter in
 * centimeters, or anyone can enter in five feet and inches."
 *
 * ─── THE STORED VALUE DOES NOT CHANGE ────────────────────────────────
 *
 * The intake answer is `height_in`: a number of INCHES. That is not a display
 * choice we are free to revisit — it is read by
 * `lifestyle-questionnaire.ts` as `BMI = 703 * weight_lb / height_in²`, by the
 * health-age model, and by the intake report, and every patient who has already
 * answered has inches on file. Storing centimetres for some patients and inches
 * for others would silently corrupt BMI for whoever picked the wrong one, with
 * no way to tell them apart after the fact.
 *
 * So the unit is an INPUT AFFORDANCE. Whatever the patient types is converted
 * here and stored as inches, exactly as before.
 *
 * ─── ROUND ONCE, AT THE EDGE ─────────────────────────────────────────
 *
 * Everything here rounds at the boundary and never mid-chain, because the
 * obvious implementation produces "5 ft 12 in": 71.65 inches split naively is
 * 5 ft and 11.65 in, and rounding the inches part alone gives 12. Total inches
 * are rounded to a whole number FIRST and then divided, so the feet carry
 * properly and the remainder is always 0–11.
 */

/** Exact, by definition. Not an approximation — 1 inch IS 2.54 cm. */
const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

export type HeightUnit = 'ftin' | 'cm';

/**
 * Centimetres → inches, for storage.
 *
 * Two decimals: enough that a whole number of centimetres survives the round
 * trip back to the same whole centimetre (182 → 71.65 → 182), and few enough
 * that the stored value stays readable in the report and in DynamoDB.
 */
export function cmToInches(cm: number): number | null {
  if (!Number.isFinite(cm) || cm <= 0) return null;
  return Math.round((cm / CM_PER_INCH) * 100) / 100;
}

/** Inches → centimetres, for display. Whole cm — nobody writes 182.4 cm. */
export function inchesToCm(inches: number): number | null {
  if (!Number.isFinite(inches) || inches <= 0) return null;
  return Math.round(inches * CM_PER_INCH);
}

/**
 * Feet + inches → total inches, for storage.
 *
 * Accepts an inches part of 12 or more rather than rejecting it: someone who
 * types 5 ft 13 in means 6 ft 1 in, and refusing that is a worse experience
 * than understanding it. Feet must still be a real number of feet.
 */
export function ftInToInches(feet: number, inches: number): number | null {
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
  if (feet < 0 || inches < 0) return null;
  const total = feet * INCHES_PER_FOOT + inches;
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

/**
 * Total inches → the feet and inches a person would say out loud.
 *
 * The rounding order is the whole point — see the header. `inches` is always
 * 0–11, so this can never render "5 ft 12 in".
 */
export function inchesToFtIn(totalInches: number): { feet: number; inches: number } | null {
  if (!Number.isFinite(totalInches) || totalInches <= 0) return null;
  const whole = Math.round(totalInches);
  return { feet: Math.floor(whole / INCHES_PER_FOOT), inches: whole % INCHES_PER_FOOT };
}

/**
 * How to say a stored height back to the patient, in their chosen unit.
 *
 * Returns null for an unanswered question rather than "0 cm" or "0 ft" — a
 * placeholder that reads like an answer is how someone skips a question
 * believing they filled it in.
 */
export function formatHeight(totalInches: number | null | undefined, unit: HeightUnit): string | null {
  if (totalInches == null || !Number.isFinite(totalInches) || totalInches <= 0) return null;
  if (unit === 'cm') {
    const cm = inchesToCm(totalInches);
    return cm == null ? null : `${String(cm)} cm`;
  }
  const parts = inchesToFtIn(totalInches);
  return parts == null ? null : `${String(parts.feet)} ft ${String(parts.inches)} in`;
}

/**
 * Which unit to show a patient first.
 *
 * Derived from the value already on file rather than guessed from a locale: a
 * height that is a whole number of inches was almost certainly typed as feet
 * and inches, and one that is not was almost certainly converted from
 * centimetres. That gets a returning patient back to the box they used last
 * time without us storing a preference we would then have to keep in sync.
 *
 * A patient with nothing on file gets ft/in, matching the unit we store and
 * the market the app currently ships to. One tap changes it either way, and
 * the toggle is the first thing on the question — not hidden behind the
 * keyboard — so a wrong guess costs a tap, not an error.
 */
export function preferredUnitFor(totalInches: number | null | undefined): HeightUnit {
  if (totalInches == null || !Number.isFinite(totalInches) || totalInches <= 0) return 'ftin';
  return Number.isInteger(totalInches) ? 'ftin' : 'cm';
}
