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

/**
 * KILL-SWITCH: NUTRITION_PLAN_ENABLED (COS-399 / SCRUM-536). Default OFF.
 * Ken added a 9th category, Nutrition, at position #2 (Medical → Nutrition →
 * Cognitive → …). The backend adds the `nutrition` category behind a matching
 * SSM flag (built separately on COS-398) — key `nutrition`, label `Nutrition`,
 * position 2 — and only emits nutrition goals once that flag is on. This client
 * flag must match the backend rollout: flip to `true` + OTA to surface Nutrition
 * at #2. While OFF, `nutrition` is excluded from the category list/order so the
 * plan renders byte-for-byte today's 8 categories. Flip back to false + OTA to
 * instantly revert.
 */
export const NUTRITION_PLAN_ENABLED = false;

export type CarePlanCategoryKey =
  | 'medical' | 'nutrition' | 'cognitive' | 'adl' | 'medication'
  | 'mentalHealth' | 'integrative' | 'social' | 'spiritual';

/**
 * Full category registry in Ken's order, including `nutrition` at #2. This is
 * the master list; consumers should use `CARE_PLAN_CATEGORIES` (the flag-aware
 * exported list below), NOT this constant directly — when NUTRITION_PLAN_ENABLED
 * is OFF, `nutrition` is filtered out so the plan is byte-for-byte today's 8.
 * Order + keys + labels MUST match cos-backend/src/services/care-plan-categories.ts.
 */
const ALL_CARE_PLAN_CATEGORIES: { key: CarePlanCategoryKey; label: string }[] = [
  { key: 'medical',      label: 'Medical, Nursing & Physical Therapy' },
  { key: 'nutrition',    label: 'Nutrition' },
  { key: 'cognitive',    label: 'Cognitive' },
  { key: 'adl',          label: 'Daily Living (ADL/IADL)' },
  { key: 'medication',   label: 'Medication' },
  { key: 'mentalHealth', label: 'Mental Health' },
  { key: 'integrative',  label: 'Alternative & Integrative' },
  { key: 'social',       label: 'Social' },
  { key: 'spiritual',    label: 'Spiritual' },
];

/**
 * Flag-aware category registry. When NUTRITION_PLAN_ENABLED is OFF (default),
 * `nutrition` is excluded, leaving the original 8 categories in the original
 * order — byte-for-byte identical to today's plan. When ON, Nutrition appears
 * at index 1 (position #2).
 */
export const CARE_PLAN_CATEGORIES: { key: CarePlanCategoryKey; label: string }[] =
  NUTRITION_PLAN_ENABLED
    ? ALL_CARE_PLAN_CATEGORIES
    : ALL_CARE_PLAN_CATEGORIES.filter((c) => c.key !== 'nutrition');

export const CARE_PLAN_CATEGORY_KEYS: readonly CarePlanCategoryKey[] =
  CARE_PLAN_CATEGORIES.map((c) => c.key);

export function categoryLabel(key: string): string {
  // Resolve against the full registry so a nutrition goal still gets its label
  // even if the flag is off — defensive; present-only grouping won't surface it.
  return ALL_CARE_PLAN_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other';
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

// SCRUM-532 Phase A — Care Plan v2 plan-view cleanups. ENABLED 2026-06-26 via OTA
// (user request): the plan view hides the reminders + visits task groups
// (reminders move to Notifications/Reminders settings; visits live on the
// Calendar) and shows the "Manage reminders" link. Flip back to false + OTA to
// instantly revert to today's plan.
export const CARE_PLAN_V2_ENABLED = true;

// Full-Plan task types hidden when Care Plan v2 is on.
export const PLAN_TASK_TYPES_HIDDEN_IN_V2: readonly string[] = ['reminder', 'appointment'];

export function isPlanTaskTypeVisible(type: string, v2Enabled: boolean): boolean {
  if (!v2Enabled) return true;
  return !PLAN_TASK_TYPES_HIDDEN_IN_V2.includes(type);
}
