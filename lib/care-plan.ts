/**
 * Care Plan — pure client mirror of the backend care-plan contract (COS-377).
 * RN-import-free so node:test can load it directly. Category list + order MUST
 * match cos-backend/src/services/care-plan-categories.ts.
 *
 * KILL-SWITCH: CARE_PLAN_ENABLED. While off, the goals UI renders exactly as
 * today (a flat list) — no category headers, no measurable line, no edit
 * affordance. ENABLED 2026-06-25 (COS-377 rollout) — the backend
 * care_plan_enabled flag is live in prod, so the UI now renders the 8-category
 * measurable Care Plan. Flip back to false to instantly revert the UI.
 */
export const CARE_PLAN_ENABLED = true;

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

/**
 * KILL-SWITCH: GOAL_PROGRESS_ENABLED. While off, progress fields are ignored
 * and goal cards render exactly as Phase 1 (COS-377). ENABLED 2026-06-25
 * (COS-382 rollout) — backend goal-progress is deployed; the UI now renders
 * the per-goal progress row when the backend hydrates a goal's `progress`
 * (which it only does once the backend goal_progress_enabled SSM flag is on
 * per stage — so this is inert until then). Flip back to false to revert the UI.
 */
export const GOAL_PROGRESS_ENABLED = true;

/**
 * Format a goal's progress for display. Returns null when no progress data is
 * present (flag off or backend did not hydrate). Pure — no RN imports.
 *
 * @param g  Goal-shaped object carrying optional baseline, target, progress.
 * @returns  { line, trendSymbol, barFraction } or null.
 */
export function formatGoalProgress(g: {
  baseline?: string;
  target?: string;
  progress?: {
    currentValue?: string;
    trendDirection?: string;
    progressPercent?: number;
  };
}): { line: string; trendSymbol: '↑' | '↓' | '→' | ''; barFraction?: number } | null {
  if (!g.progress) return null;

  const { currentValue, trendDirection, progressPercent } = g.progress;

  // Build "baseline → currentValue → target" using whatever parts are available.
  const parts: string[] = [];
  if (g.baseline) parts.push(g.baseline);
  if (currentValue) parts.push(currentValue);
  if (g.target) parts.push(g.target);
  const line = parts.join(' → ');

  const trendSymbol: '↑' | '↓' | '→' | '' =
    trendDirection === 'improving'         ? '↑'
    : trendDirection === 'worsening'       ? '↓'
    : trendDirection === 'stable'          ? '→'
    : /* insufficient_data or unknown */     '';

  const barFraction = progressPercent != null ? progressPercent / 100 : undefined;

  return { line, trendSymbol, barFraction };
}
