/**
 * COS-809 — the assessment badge, rebuilt from plan config.
 *
 * The prod chooser's cards carried a tinted badge — "LIGHT ASSESSMENT",
 * "STANDARD + EHR ASSESSMENT", "FULL CLINICAL ASSESSMENT" — and it did a lot
 * of the work: it told you in two words what a plan would actually ask of you,
 * before you read a single feature row.
 *
 * There it was a hardcoded property of four fixed tiers. Plans are composed
 * now and can be named anything, so the badge has to be DERIVED from what the
 * plan is configured to do, or it would go stale the moment someone edited one.
 *
 * Two inputs, both real:
 *   - how many screeners the plan asks for  → the depth
 *   - whether it reads the health record    → the "+ EHR"
 *
 * The thresholds mirror the tiers they replace: prod's Basic asked for 1–3
 * brief screeners and read as Light; Advanced asked for 3–5 clinical ones and
 * read as Standard. Anything asking for more than a handful is a clinical
 * workload whatever it is called.
 */

/** Matches the prod chooser's ASSESSMENT_COLOR exactly. */
export const ASSESSMENT_COLORS = {
  light: '#6B7280',
  standard: '#5B47CC',
  clinical: '#0E7490',
} as const;

export type AssessmentDepth = keyof typeof ASSESSMENT_COLORS;

export interface AssessmentBadge {
  label: string;
  depth: AssessmentDepth;
  color: string;
}

/**
 * Returns null when the plan asks for nothing and reads nothing — a badge
 * saying "LIGHT ASSESSMENT" on a plan with no assessment at all would be a
 * claim about a thing that does not happen.
 */
export function assessmentBadge(
  assessmentCount: number | null | undefined,
  usesEhrRefresh: boolean | null | undefined,
): AssessmentBadge | null {
  const count = typeof assessmentCount === 'number' && assessmentCount > 0 ? assessmentCount : 0;
  const ehr = usesEhrRefresh === true;
  if (count === 0 && !ehr) return null;

  // A plan that only reads records still assesses you — from the record
  // rather than a questionnaire — so it is Light, not nothing.
  const depth: AssessmentDepth = count > 6 ? 'clinical' : count > 3 ? 'standard' : 'light';

  const base = depth === 'clinical' ? 'Full clinical' : depth === 'standard' ? 'Standard' : 'Light';
  // "STANDARD + EHR ASSESSMENT" — the noun stays singular and trailing, as in
  // prod, so the three labels line up as a set.
  const label = ehr ? `${base} + EHR assessment` : `${base} assessment`;

  return { label, depth, color: ASSESSMENT_COLORS[depth] };
}
