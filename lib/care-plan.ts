/**
 * Care Plan — pure client mirror of the backend care-plan contract (COS-377).
 * RN-import-free so node:test can load it directly. Category list + order MUST
 * match cos-backend/src/services/care-plan-categories.ts.
 *
 * KILL-SWITCH: CARE_PLAN_ENABLED default FALSE. While off, the goals UI renders
 * exactly as today (a flat list) — no category headers, no measurable line,
 * no edit affordance.
 */
export const CARE_PLAN_ENABLED = false;

export type CarePlanCategoryKey =
  | 'medical' | 'cognitive' | 'adl' | 'medication'
  | 'mentalHealth' | 'integrative' | 'social' | 'spiritual';

export const CARE_PLAN_CATEGORIES: { key: CarePlanCategoryKey; label: string }[] = [
  { key: 'medical',      label: 'Medical, Nursing & Physical Therapy' },
  { key: 'cognitive',    label: 'Cognitive' },
  { key: 'adl',          label: 'Daily Living (ADL/IADL)' },
  { key: 'medication',   label: 'Medication' },
  { key: 'mentalHealth', label: 'Mental Health' },
  { key: 'integrative',  label: 'Alternative & Integrative' },
  { key: 'social',       label: 'Social' },
  { key: 'spiritual',    label: 'Spiritual' },
];

export const CARE_PLAN_CATEGORY_KEYS: readonly CarePlanCategoryKey[] =
  CARE_PLAN_CATEGORIES.map((c) => c.key);

export function categoryLabel(key: string): string {
  return CARE_PLAN_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other';
}

export interface GoalGroup<G> {
  key: string;
  label: string;
  goals: G[];
}

/** Group goals by category in registry order, present categories only. Goals
 *  with no category collapse into one legacy "Your Goals" group. */
export function groupGoalsByCategory<G extends { category?: string }>(
  goals: G[],
): GoalGroup<G>[] {
  const hasCategories = goals.some((g) => g.category);
  if (!hasCategories) {
    return goals.length ? [{ key: 'general', label: 'Your Goals', goals }] : [];
  }
  const groups: GoalGroup<G>[] = [];
  for (const c of CARE_PLAN_CATEGORIES) {
    const inCat = goals.filter((g) => g.category === c.key);
    if (inCat.length) groups.push({ key: c.key, label: c.label, goals: inCat });
  }
  const leftover = goals.filter((g) => !g.category);
  if (leftover.length) groups.push({ key: 'general', label: 'Your Goals', goals: leftover });
  return groups;
}

/** "baseline → target · timeframe" (omits missing parts; '' when none). */
export function formatGoalMeasure(g: {
  baseline?: string; target?: string; timeframe?: string;
}): string {
  const left = g.baseline && g.target ? `${g.baseline} → ${g.target}` : (g.target ?? '');
  return [left, g.timeframe].filter(Boolean).join(' · ');
}
