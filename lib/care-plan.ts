/**
 * Care Plan — pure client mirror of the backend care-plan contract (COS-377).
 * RN-import-free so node:test can load it directly. Category list + order MUST
 * match cos-backend/src/services/care-plan-categories.ts.
 *
 * The only non-local import is a `type`-only one (erased at compile time —
 * `services/api/types.ts` is itself a pure, RN-import-free data-types module),
 * so this file stays node:test loadable.
 *
 * KILL-SWITCH: CARE_PLAN_ENABLED. While off, the goals UI renders exactly as
 * today (a flat list) — no category headers, no measurable line, no edit
 * affordance. ENABLED 2026-06-25 (COS-377 rollout) — the backend
 * care_plan_enabled flag is live in prod, so the UI now renders the 8-category
 * measurable Care Plan. Flip back to false to instantly revert the UI.
 */
import type { BiopsychosocialDomain } from '@/services/api/types';

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

// ── Biopsychosocial section mapping (COS-360 / SCRUM-518, Phase 2/3) ────────
//
// Maps each of the 8 Care Plan categories onto Ken's biopsychosocial model.
// Mirrors the per-instrument `domain` assignments in the design doc (e.g.
// `cog-minicog` → biological, `pss-4`/`wellbeing-who5` → psychological,
// `social-isolation-lsns6` → social): medical/cognitive/adl/medication are
// physical-axis categories → biological; mentalHealth + integrative (talk
// therapy, mindfulness, stress-reduction practices) → psychological; social
// stays social; spiritual keeps its own tag here (still useful for the
// instrument-catalog section header) but folds into `social` at the
// 3-bucket SectionPlan layer via `getSection` below.
export const SECTION_BY_CATEGORY: Record<CarePlanCategoryKey, BiopsychosocialDomain> = {
  medical: 'biological',
  cognitive: 'biological',
  adl: 'biological',
  medication: 'biological',
  mentalHealth: 'psychological',
  integrative: 'psychological',
  social: 'social',
  spiritual: 'spiritual',
};

/**
 * Resolve which of the THREE biopsychosocial-plan sections
 * (`BiopsychosocialPlanRecord.sections`: biological / psychological / social)
 * a category's content belongs to. Folds `spiritual` → `social` since the
 * plan record has no separate spiritual bucket — the section is literally
 * named "Social & Spiritual Wellness". Pure — no RN imports.
 */
export function getSection(category: CarePlanCategoryKey): 'biological' | 'psychological' | 'social' {
  const domain = SECTION_BY_CATEGORY[category] ?? 'social';
  return domain === 'spiritual' ? 'social' : domain;
}

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
 *
 * ENABLED 2026-06-30 (COS-429) for prod testing of the V2 redesign (OTA to the
 * production channel). Revert = set false + re-OTA (instant rollback to v1).
 */
export const PLAN_REDESIGN_V2_ENABLED = true;

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

// ── Patient-authored PERSONAL GOALS (COS-405 / SCRUM-532) ────────────────────
//
// Ken's plan structure: per category, GOALS + metrics are set "by the
// individual, the proxy, or the agency care manager." This is the PATIENT side
// — in each category's GOALS section the patient can ADD / EDIT / DELETE their
// own measurable goals alongside the AI-suggested ones.
//
// All logic below is PURE (no RN imports) so node:test can load it directly and
// so the service layer can normalize the backend response defensively.

/**
 * KILL-SWITCH: PERSONAL_GOALS_ENABLED (COS-405 / SCRUM-532). Default OFF.
 *
 * While OFF the plan renders EXACTLY as today's v3 — no personal-goals UI, no
 * "+ Add goal" affordance, and the hooks make NO network calls. While ON, the
 * per-category GOALS section also shows the patient's own goals + an add/edit
 * sheet, talking to the backend's flag-gated `/v1/me/personal-goals` endpoints.
 *
 * The backend contract is gated by its own `CARE_PLAN_V2_ENABLED` flag, so the
 * endpoints 404 until the backend ships + enables them. The service treats a
 * 404 / FEATURE_DISABLED as "no personal goals" (empty), not an error — so even
 * with this client flag ON before the backend ships, the plan degrades to
 * today's v3 (no personal goals shown, no error spam). Flip to false to instantly
 * remove the entire personal-goals UI.
 */
export const PERSONAL_GOALS_ENABLED = false;

export type PersonalGoalType = 'quantitative' | 'qualitative';
export type PersonalGoalCadence = 'monthly' | 'quarterly' | 'biannual' | 'yearly';
export type PersonalGoalStatus =
  | 'not_started' | 'in_progress' | 'on_track' | 'achieved';

export const PERSONAL_GOAL_CADENCES: { key: PersonalGoalCadence; label: string }[] = [
  { key: 'monthly',   label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'biannual',  label: 'Biannual' },
  { key: 'yearly',    label: 'Yearly' },
];

export const PERSONAL_GOAL_STATUSES: { key: PersonalGoalStatus; label: string }[] = [
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'on_track',    label: 'On track' },
  { key: 'achieved',    label: 'Achieved' },
];

export function cadenceLabel(key: string): string {
  return PERSONAL_GOAL_CADENCES.find((c) => c.key === key)?.label ?? 'Monthly';
}

export function personalGoalStatusLabel(key: string | undefined): string {
  return PERSONAL_GOAL_STATUSES.find((s) => s.key === key)?.label ?? 'Not started';
}

/**
 * Format a personal goal's plain-language measure line (mirrors `formatGoalPlain`
 * for AI goals so the cards read identically). Quantitative goals frame their
 * current/target/unit; qualitative goals frame their status. Returns '' when
 * nothing measurable is known so the caller can omit the line. Pure.
 */
export function formatPersonalGoalMeasure(g: {
  type?: string;
  target?: number;
  unit?: string;
  baseline?: number;
  current?: number;
  status?: string;
}): string {
  if (g.type === 'qualitative') {
    return personalGoalStatusLabel(g.status);
  }
  const unit = g.unit ? ` ${g.unit}` : '';
  if (g.current != null && g.target != null) {
    return `${g.current}${unit} of ${g.target}${unit}`;
  }
  if (g.target != null) {
    const from = g.baseline != null ? `From ${g.baseline}${unit} to ` : 'Aiming for ';
    return `${from}${g.target}${unit}`;
  }
  return '';
}

/**
 * Progress fraction (0–1) for a quantitative personal goal's bar, or null when
 * it can't be computed (qualitative, or missing/zero target). Pure. Clamped by
 * the caller for rendering.
 */
export function personalGoalProgressFraction(g: {
  type?: string;
  target?: number;
  baseline?: number;
  current?: number;
}): number | null {
  if (g.type === 'qualitative') return null;
  if (g.target == null || g.current == null) return null;
  const base = g.baseline ?? 0;
  const span = g.target - base;
  if (span === 0) return null;
  const frac = (g.current - base) / span;
  if (!Number.isFinite(frac)) return null;
  return Math.min(1, Math.max(0, frac));
}

/** A draft from the add/edit personal-goal form (strings as typed in inputs). */
export interface PersonalGoalDraft {
  type: PersonalGoalType;
  cadence: PersonalGoalCadence;
  title: string;
  description?: string;
  // Quantitative
  target?: string;
  unit?: string;
  baseline?: string;
  // Qualitative
  status?: PersonalGoalStatus;
}

/** The validated, backend-ready create/update payload (numbers parsed). */
export interface PersonalGoalSubmit {
  type: PersonalGoalType;
  cadence: PersonalGoalCadence;
  title: string;
  description?: string;
  target?: number;
  unit?: string;
  baseline?: number;
  status?: PersonalGoalStatus;
}

/**
 * Validate a personal-goal draft from the add/edit form. Pure — no RN imports,
 * no side effects — so the form's submit logic is unit-testable in isolation.
 *
 * Rules:
 *  - title is required (trimmed, ≤120 chars after trim).
 *  - quantitative: target is required and must be a finite number; baseline (if
 *    given) must be a finite number; unit is optional free text.
 *  - qualitative: no target/unit; status defaults to 'not_started'.
 *
 * Returns either `{ ok: true, value }` with a normalized, backend-ready payload
 * (numbers parsed, empty optionals dropped) or `{ ok: false, error }` with a
 * single user-facing message.
 */
export function validatePersonalGoalDraft(
  draft: PersonalGoalDraft,
): { ok: true; value: PersonalGoalSubmit } | { ok: false; error: string } {
  const title = (draft.title ?? '').trim();
  if (!title) return { ok: false, error: 'Please enter a goal title.' };
  if (title.length > 120) return { ok: false, error: 'Title must be 120 characters or fewer.' };

  const cadence: PersonalGoalCadence =
    PERSONAL_GOAL_CADENCES.some((c) => c.key === draft.cadence) ? draft.cadence : 'monthly';
  const description = (draft.description ?? '').trim() || undefined;

  if (draft.type === 'quantitative') {
    const targetStr = (draft.target ?? '').trim();
    if (!targetStr) return { ok: false, error: 'Enter a target number for a quantitative goal.' };
    const target = Number(targetStr);
    if (!Number.isFinite(target)) return { ok: false, error: 'Target must be a number.' };

    let baseline: number | undefined;
    const baselineStr = (draft.baseline ?? '').trim();
    if (baselineStr) {
      const b = Number(baselineStr);
      if (!Number.isFinite(b)) return { ok: false, error: 'Baseline must be a number.' };
      baseline = b;
    }
    const unit = (draft.unit ?? '').trim() || undefined;
    return {
      ok: true,
      value: { type: 'quantitative', cadence, title, description, target, unit, baseline },
    };
  }

  // qualitative
  const status: PersonalGoalStatus =
    PERSONAL_GOAL_STATUSES.some((s) => s.key === draft.status) ? draft.status! : 'not_started';
  return { ok: true, value: { type: 'qualitative', cadence, title, description, status } };
}

/**
 * Normalize ONE raw personal goal from the backend into a safe shape, dropping
 * anything malformed by returning null. Pure + defensive — the service maps the
 * array through this so a bad row never crashes the plan.
 */
export interface NormalizedPersonalGoal {
  id: string;
  category: string;
  type: PersonalGoalType;
  cadence: PersonalGoalCadence;
  title: string;
  description?: string;
  target?: number;
  unit?: string;
  baseline?: number;
  current?: number;
  status?: PersonalGoalStatus;
  selfRating?: number;
  reflections?: { period?: string; note?: string; rating?: number; at?: string }[];
  createdAt?: string;
  updatedAt?: string;
}

export function normalizePersonalGoal(raw: unknown): NormalizedPersonalGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const category = typeof r.category === 'string' ? r.category : '';
  if (!id || !title || !category) return null;
  const type: PersonalGoalType = r.type === 'qualitative' ? 'qualitative' : 'quantitative';
  const cadence: PersonalGoalCadence =
    PERSONAL_GOAL_CADENCES.some((c) => c.key === r.cadence) ? (r.cadence as PersonalGoalCadence) : 'monthly';
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const status = PERSONAL_GOAL_STATUSES.some((s) => s.key === r.status)
    ? (r.status as PersonalGoalStatus)
    : undefined;
  return {
    id,
    category,
    type,
    cadence,
    title,
    description: typeof r.description === 'string' ? r.description : undefined,
    target: num(r.target),
    unit: typeof r.unit === 'string' ? r.unit : undefined,
    baseline: num(r.baseline),
    current: num(r.current),
    status,
    selfRating: num(r.selfRating),
    reflections: Array.isArray(r.reflections)
      ? (r.reflections as { period?: string; note?: string; rating?: number; at?: string }[])
      : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
  };
}

/**
 * Normalize a raw `GET /v1/me/personal-goals` response body into a clean goals
 * array (dropping malformed rows). Pure + defensive: a non-array / missing
 * `goals` resolves to []. The service wraps this in try/catch so a 404
 * (backend flag off) also yields []. Returns goals only for known categories
 * are NOT filtered here — the UI buckets by category and silently ignores
 * unknown ones.
 */
export function normalizePersonalGoals(body: unknown): NormalizedPersonalGoal[] {
  const goals = (body as { goals?: unknown })?.goals;
  if (!Array.isArray(goals)) return [];
  const out: NormalizedPersonalGoal[] = [];
  for (const g of goals) {
    const n = normalizePersonalGoal(g);
    if (n) out.push(n);
  }
  return out;
}

/** Personal goals for one category key, in stable (created) order. Pure. */
export function personalGoalsForCategory<G extends { category?: string }>(
  goals: G[],
  categoryKey: string,
): G[] {
  return goals.filter((g) => g.category === categoryKey);
}
