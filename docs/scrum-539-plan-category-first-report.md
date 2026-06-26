# SCRUM-539 / COS-404 — Care Plan, CATEGORY-FIRST rebuild (STATUS → TASKS → GOALS)

> Branch: `COS-404/plan-status-tasks-goals` (off main). App is LIVE. OTA-safe (JS/TSX only).
> Source of truth: `cos-backend/docs/plan-category-status-contract.md`.

## Why (Ken rejected v1)
The v1 redesign (`PlanScreenRedesigned`, live under `PLAN_REDESIGN_ENABLED`) led with goals but
did NOT show the plan CATEGORIES. Ken wants the plan organized BY CATEGORY, each category flowing
**STATUS → TASKS → GOALS**, "organized in a way that makes very clear sense to users" (his bar: a
5-year-old can understand it). This rebuild REPLACES the v1 content under the same flag.

## The new category-first layout
`PlanScreenRedesigned` now renders **one section per care-plan category**, in registry order
(`lib/care-plan.ts` → `CARE_PLAN_CATEGORIES`), present-only. Each category section, in order:

1. **Category header** — big, simple label (e.g. "Mental Health", "Social"). Clear visual
   separation between categories via a 2px bottom-border divider + generous top margin.
2. **STATUS** — "WHERE YOU ARE NOW" sub-label + a tinted card showing the backend's
   `categoryStatuses` summary for this category. **Omitted entirely when absent** (see below).
3. **TASKS** — "WHAT TO DO" sub-label + the category's tasks (icon, title, recurrence, time).
   Phase A hiding is applied (reminders/visits off) and the **Manage reminders** link is kept
   (rendered under the Medical section).
4. **GOALS** — "YOUR GOALS" sub-label + the v1 big editable goal cards, reused verbatim (plain-
   language measure, progress bar + trend line, the unmistakable per-card **Edit** button).

A trailing **"Your Goals"** group renders any goals with no/unknown category (legacy plans) so
nothing is lost. An empty state renders when there are no categories/goals/tasks yet.

A category section is **present** when it has any goals OR any tasks OR a status — so a STATUS-only
category (backend-supplied) or a task-only category still surfaces.

## STATUS-absent graceful path
`getCategoryStatus(categoryStatuses, key)` returns the trimmed status string, or `null` when:
- `categoryStatuses` is `undefined` (backend flag off / not yet deployed) — never throws,
- there is no entry for that category,
- the entry's `status` is empty/whitespace.

When it returns `null` the STATUS block is simply omitted; the section still reads
**TASKS → GOALS**. No placeholder, no error, no crash. `buildCategorySections` reads
`plan.categoryStatuses` defensively (optional).

## Task → category fallback (works BEFORE the backend ships)
`taskCategoryFor(task)`:
1. Prefers a valid AI-tagged `task.category` (validated against the known category keys).
2. Falls back to `TASK_TYPE_TO_CATEGORY`: `medication`→`medication`, `exercise`/`appointment`/
   `reminder`→`medical` (mirrors the backend's derivation).
3. Defaults to `medical` for unknown/missing types so a task is never dropped.

`groupTasksByCategory` + `buildCategorySections` use this so tasks group correctly today (no
`task.category`) and after the backend tags them. Phase A hiding (`isPlanTaskTypeVisible`) is
applied to `plan.tasks` BEFORE grouping, so hidden types never appear in any category.

## What was reused from v1 (Ken liked it)
- The big editable goal card — title, description, plain-language measure (`formatGoalPlain`),
  progress bar + trend (`formatGoalProgress`, `GOAL_PROGRESS_ENABLED`), priority pill, and the
  per-card **Edit** button — extracted into a `GoalCard` so every category reuses it identically.
- The single **Build / Refresh** primary action with `canGenerate` gating (the screen still owns
  the SCRUM-535 `useFocusEffect` refetch and the shared goal-edit modal — props unchanged).
- The "Personalize your plan" banner, plan-type strip, plan summary card, and the medications
  sections (`MedicationsSection` / `MedicationsReviewPrompt`), all kept.
- Pull-to-refresh, celebration, flag-aware Nutrition handling (via the category registry).

The old top "Your goals" hero + the collapsible "Today's tasks" block + the count strip were
dropped/folded into the category sections, as v1 dropped the old overview.

## Types added (additive, defensive)
`services/api/types.ts`:
- `PlanCategoryStatus { category: string; status: string }` and
  `AiHealthPlan.categoryStatuses?: PlanCategoryStatus[]`.
- `PlanTask.category?: string` (AI-tagged; optional).
Both read optionally — older payloads without them work unchanged.

## Flag-off safety
Gated by the existing, already-live `PLAN_REDESIGN_ENABLED`. The flag-OFF path in
`app/Home/health-plan.tsx` (the original ScrollView) is **untouched** — that file is not in the
change set, so flag OFF = the original Care Plan screen byte-for-byte. The category-first layout
only replaces the v1 redesign CONTENT under the same flag (OTA-ing the build swaps v1→v3).

## OTA-safe
JS/TSX only — no native code, no `app.json`, no deps, no `ios/`/`android/`. No EAS build / OTA was
run. No PHI in logs (status text is rendered, never logged). Accessible (roles/labels/hints on
every interactive element; sub-labels carry uppercase semantic context) and responsive (font
scaling honored throughout via `getScaledFontSize`/`getScaledFontWeight`).

## Tests
Added to `tests/unit/care-plan.test.ts` (pure, node:test-loadable):
- `taskCategoryFor` — AI tag preferred; type fallback; unknown tag/type → safe `medical`.
- `groupTasksByCategory` — registry order, present-only, fallback grouping.
- `getCategoryStatus` — trimmed status present; **graceful absent** (undefined/empty/missing/
  non-array → `null`).
- `buildCategorySections` — STATUS→TASKS→GOALS per category; status-ABSENT graceful path;
  STATUS-only category surfaces; task-only category surfaces; leftover (no/unknown category)
  goals; empty plan → no sections.

`npm test`: **117 pass / 0 fail** (was 106; +11). `npx tsc --noEmit`: clean. `npm run lint`: no
issues in any touched file (the repo's pre-existing errors/warnings are in unrelated files).

---

## Follow-up fixes (COS-404, SCRUM-539) — F1 + F2

Two small SAFE-TO-OTA fixes to `components/health-plan/PlanScreenRedesigned.tsx` (JS/TSX only).

### F1 — Manage-reminders link can disappear (UX regression, FIXED)
The "Manage reminders" row was rendered INSIDE the per-category render, gated on
`CARE_PLAN_V2_ENABLED && section.key === 'medical'`. A plan with no medical-category content
dropped the Medical section entirely, so the link — and its deep-link to
`/Home/reminder-settings` — **vanished**. In the prior v1/flag-off screen it rendered whenever
`CARE_PLAN_V2_ENABLED`, independent of any category.

**Fix:** the in-category reminders Pressable was removed and re-rendered ONCE as a STABLE
trailing block (its own "REMINDERS" sub-labelled section), placed after the category sections +
leftover goals, gated **only** on `CARE_PLAN_V2_ENABLED`. It is now always reachable when v2 is on,
regardless of which categories have content. `onManageReminders` (→ `/Home/reminder-settings`)
wiring unchanged. The TASKS-section visibility gate reverted to `section.tasks.length > 0` (no
longer coupled to the reminders link).

### F2 — within-category task time-sort (restored)
The redesign rendered tasks in raw payload order; the original/flag-off screen sorted each task
group by `scheduledTime`. **Fix:** `visibleTasks` is now sorted ascending by `scheduledTime`
BEFORE grouping (`buildCategorySections` preserves that order within each category, so every
category renders time-ordered). The comparator is null-safe — tasks with a missing/empty
`scheduledTime` are pushed LAST via explicit guards (a naive `'~'` sentinel + `localeCompare`
floated timeless tasks to the top under locale collation; a unit test caught it).

### Optional prune (done — trivial, parent unaffected)
Removed the dead props `tasks`/`completedCount`/`skippedCount`/`progressPct`/`tasksByType` from
`PlanScreenRedesignedProps` and the parent call site in `app/Home/health-plan.tsx`. The screen's
local computations are kept (still used by the flag-off original ScrollView/hero path). The
flag-off path is untouched.

### Verification
- New tests in `tests/unit/care-plan.test.ts`: task time-sort ascending; null-safe (timeless
  last); and the sort flowing through `buildCategorySections` so each category is time-ordered.
- `npm test`: **120 pass / 0 fail** (was 117; +3). `npx tsc --noEmit`: clean. Lint: **0 errors**
  on all touched files (2 pre-existing `toggleTask`/`onSkip` warnings in `health-plan.tsx` predate
  this work).
- OTA-safe: JS/TSX only, no native/deps/config touched. Flag-off (`PLAN_REDESIGN_ENABLED=false`)
  still renders the original screen byte-for-byte; status-absent path unchanged (no crash).
