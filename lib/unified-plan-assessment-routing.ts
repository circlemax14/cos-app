/**
 * Deep-link mapping: BPS section → assessment catalog entry (COS-467).
 *
 * A section rendered with zero plan bullets/goals/tasks nudges the user
 * to complete the matching assessment. Ken's approved copy: "Take the
 * {section} assessment →". Rather than a per-section route, we push the
 * shared assessments catalog with a `focus` query param so the catalog
 * scrolls to the relevant instruments; older builds without focus
 * handling simply render the catalog as normal (back-compatible).
 *
 * Pure module — no React, no navigation import — so it can be unit-
 * tested from `tests/unit/*` without a native runtime.
 */

/**
 * Duplicated (not imported) so this file remains dependency-free and
 * runnable under `node --test` without transitively pulling in
 * `services/api/*` (which imports axios / RN client).
 */
export type UnifiedSectionKey =
  | 'biological'
  | 'psychological'
  | 'socialSpiritual';

/** Query params to append to /Home/assessments-catalog for each section. */
export const ASSESSMENT_ROUTE_FOR_SECTION: Record<UnifiedSectionKey, string> = {
  biological: 'bio',
  psychological: 'psy',
  socialSpiritual: 'soc',
};

/**
 * Returns the full route href for the assessment catalog scoped to a
 * BPS section. Also carries `source=unified-plan-empty` so the catalog
 * can attribute the visit for engagement analytics.
 */
export function assessmentHrefForSection(section: UnifiedSectionKey): string {
  const focus = ASSESSMENT_ROUTE_FOR_SECTION[section];
  return `/Home/assessments-catalog?source=unified-plan-empty&focus=${focus}`;
}
