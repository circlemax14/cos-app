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

/**
 * KILL-SWITCH: PLAN_REDESIGN_ENABLED (COS-402 / SCRUM-538). Default OFF.
 *
 * While OFF the Care Plan screen renders EXACTLY as today (the existing
 * `health-plan.tsx` render path, byte-for-byte). While ON it renders the
 * goals-first redesign (`PlanScreenRedesigned`) — same data, hooks, edit flow,
 * build/refresh logic, and celebration, new presentation only.
 *
 * Ken's brief: the plan screen is too crowded — lead with editable goals (with
 * an unmistakable per-card Edit button), shrink the count card, and collapse the
 * daily-task list into a secondary "Today's tasks" section. Presentation-only:
 * flip back to false to instantly revert to today's screen.
 */
// ENABLED 2026-06-26 for Ken's testing (SCRUM-538). Flip to false + OTA to
// instantly revert to today's screen (presentation-only; flag-off is byte-for-byte today).
export const PLAN_REDESIGN_ENABLED = true;

/**
 * KILL-SWITCH: PLAN_REDESIGN_V2_ENABLED (COS-422). Default OFF.
 *
 * Layers ABOVE PLAN_REDESIGN_ENABLED — when ON, the Care Plan screen renders the
 * MakeMyTrip-inspired visual redesign (`PlanScreenRedesignedV2`) instead of v1
 * (`PlanScreenRedesigned`). Same data, hooks, props, edit flow, build/refresh +
 * canGenerate gating, medications sections, and category structure as v1 — pure
 * presentation: depth/elevation, per-category color + icon chips, a 3-state
 * status pill, token-driven spacing/radii, and a warmer empty state.
 *
 * Render precedence in health-plan.tsx:
 *   PLAN_REDESIGN_V2_ENABLED → v2, else PLAN_REDESIGN_ENABLED → v1, else legacy.
 *
 * Presentation-only: flip back to false to instantly revert to v1 (or, with both
 * off, byte-for-byte today's legacy screen).
 */
export const PLAN_REDESIGN_V2_ENABLED = false;

/**
 * Plain-language one-liner for a goal's measure + progress (COS-402). Powers the
 * redesigned goal card's "a 5-year-old can understand it" measure line, e.g.
 * "You're at 72% of your target" or "Aiming for <7.0% over 3 months".
 *
 * Prefers a live progress percentage when present; otherwise falls back to the
 * baseline→target framing. Returns '' when nothing measurable is known so the
 * caller can omit the line entirely. Pure — no RN imports (node:test loadable).
 */
export function formatGoalPlain(g: {
  baseline?: string;
  target?: string;
  timeframe?: string;
  progress?: { progressPercent?: number };
}): string {
  const pct = g.progress?.progressPercent;
  if (pct != null && Number.isFinite(pct)) {
    const clamped = Math.round(Math.min(100, Math.max(0, pct)));
    const targetSuffix = g.target ? ` toward ${g.target}` : '';
    return `You're at ${clamped}%${targetSuffix}`;
  }
  if (g.target) {
    const tf = g.timeframe ? ` over ${g.timeframe}` : '';
    return g.baseline
      ? `From ${g.baseline} to ${g.target}${tf}`
      : `Aiming for ${g.target}${tf}`;
  }
  return g.timeframe ? `Over ${g.timeframe}` : '';
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

// ── Category-first plan view (COS-404 / SCRUM-539) ───────────────────────────
//
// Ken's structure: the plan is organized BY CATEGORY, each category flowing
// STATUS → TASKS → GOALS. Goals already carry `category`. Tasks gain an additive
// `category` once the backend ships; until then (and for legacy/untagged tasks)
// we derive a sensible category from the task TYPE so tasks still group under
// the right heading BEFORE the backend ships. Pure — no RN imports.

/**
 * Map a plan task's TYPE to a care-plan category. Used as the FALLBACK when a
 * task has no AI-tagged `category`. Mirrors the backend's derivation
 * (medication→'medication', exercise→'medical', …). Returns a CarePlanCategoryKey.
 */
export const TASK_TYPE_TO_CATEGORY: Record<string, CarePlanCategoryKey> = {
  medication: 'medication',
  exercise: 'medical',
  appointment: 'medical',
  reminder: 'medical',
};

/**
 * Resolve the category for a single task. Prefers the backend's AI-tagged
 * `task.category` (validated against the known category keys); falls back to the
 * type→category mapping; defaults to 'medical' for unknown types so a task is
 * never dropped. Pure, defensive (reads optional fields).
 */
export function taskCategoryFor(task: { type?: string; category?: string }): CarePlanCategoryKey {
  if (task.category && (CARE_PLAN_CATEGORY_KEYS as readonly string[]).includes(task.category)) {
    return task.category as CarePlanCategoryKey;
  }
  return TASK_TYPE_TO_CATEGORY[task.type ?? ''] ?? 'medical';
}

export interface TaskGroup<T> {
  key: CarePlanCategoryKey;
  label: string;
  tasks: T[];
}

/**
 * Group tasks by category in registry order, present-only. Uses `taskCategoryFor`
 * (AI tag, else type fallback) so it works before AND after the backend ships
 * task tags. Pure — no RN imports.
 */
export function groupTasksByCategory<T extends { type?: string; category?: string }>(
  tasks: T[],
): TaskGroup<T>[] {
  const groups: TaskGroup<T>[] = [];
  for (const c of CARE_PLAN_CATEGORIES) {
    const inCat = tasks.filter((t) => taskCategoryFor(t) === c.key);
    if (inCat.length) groups.push({ key: c.key, label: c.label, tasks: inCat });
  }
  return groups;
}

/**
 * Look up the backend STATUS summary for a category. Returns the trimmed status
 * string, or null when absent (backend flag off / not yet deployed) so the
 * caller GRACEFULLY OMITS the STATUS block. Pure, defensive — never throws on a
 * missing/empty `categoryStatuses`.
 */
export function getCategoryStatus(
  categoryStatuses: { category?: string; status?: string }[] | undefined,
  categoryKey: string,
): string | null {
  if (!Array.isArray(categoryStatuses)) return null;
  const entry = categoryStatuses.find((s) => s?.category === categoryKey);
  const status = entry?.status?.trim();
  return status ? status : null;
}

/**
 * Build the ordered list of category sections for the category-first plan view.
 * A category section is PRESENT when it has any goals OR any tasks OR a status
 * (so STATUS-only categories from the backend still surface). Ordered by the
 * category registry. Pure — no RN imports; the screen layers presentation on top.
 */
export interface CategorySection<G, T> {
  key: CarePlanCategoryKey;
  label: string;
  status: string | null;
  goals: G[];
  tasks: T[];
}

export function buildCategorySections<
  G extends { category?: string },
  T extends { type?: string; category?: string },
>(
  goals: G[],
  tasks: T[],
  categoryStatuses: { category?: string; status?: string }[] | undefined,
): {
  sections: CategorySection<G, T>[];
  /** Goals with no category (or an unknown one) — rendered as a trailing
   *  "Your Goals" group exactly like the legacy grouping, so nothing is lost. */
  leftoverGoals: G[];
} {
  const knownKeys = CARE_PLAN_CATEGORY_KEYS as readonly string[];
  const sections: CategorySection<G, T>[] = [];
  for (const c of CARE_PLAN_CATEGORIES) {
    const catGoals = goals.filter((g) => g.category === c.key);
    const catTasks = tasks.filter((t) => taskCategoryFor(t) === c.key);
    const status = getCategoryStatus(categoryStatuses, c.key);
    if (catGoals.length || catTasks.length || status) {
      sections.push({ key: c.key, label: c.label, status, goals: catGoals, tasks: catTasks });
    }
  }
  const leftoverGoals = goals.filter((g) => !g.category || !knownKeys.includes(g.category));
  return { sections, leftoverGoals };
}
