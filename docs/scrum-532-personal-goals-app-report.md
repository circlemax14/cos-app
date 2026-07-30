# SCRUM-532 / COS-405 — Patient-facing personal-goal authoring (cos-app)

Patient side of Ken's plan structure: in each care-plan category's GOALS
section, the patient can ADD / EDIT / DELETE their own measurable goals (with
metrics), alongside the AI-suggested goals. Dark behind a new client flag
`PERSONAL_GOALS_ENABLED` (default **false**), OTA-safe (JS/TSX only).

## Service + hooks

**`services/api/personal-goals.ts`** — talks to the backend contract through the
centralized `apiClient` (no inline fetch):

- `GET    /v1/me/personal-goals` → `fetchPersonalGoals()`
- `POST   /v1/me/personal-goals` → `createPersonalGoal(category, body)`
- `PUT    /v1/me/personal-goals/:id` → `updatePersonalGoal(id, body)`
- `POST   /v1/me/personal-goals/:id/reflection` → `addPersonalGoalReflection(id, input)`
- `DELETE /v1/me/personal-goals/:id` → `deletePersonalGoal(id)`

**404-graceful:** the GET is wrapped in `try/catch` and resolves to `[]` on ANY
failure — a 404 (backend `CARE_PLAN_V2_ENABLED` off / route not shipped), a
FEATURE_DISABLED code, a network error, or a malformed body. So the plan renders
exactly as today's v3 (no personal goals, no error spam) and the AI goals still
render. The response is run through the pure `normalizePersonalGoals` normalizer,
which drops malformed rows and coerces bad enums/numbers defensively. No PHI is
logged.

**`hooks/use-personal-goals.ts`** — one query (`['personal-goals']`) +
create/update/delete/reflection mutations (each invalidates the list). The list
query is `enabled: PERSONAL_GOALS_ENABLED`, so **with the flag off the hook makes
ZERO network calls** and returns a stable empty list.

## Per-category add/edit UI

**`components/health-plan/PersonalGoalsSection.tsx`** — mounted once per category
inside `PlanScreenRedesigned`'s GOALS section. It:

- renders the patient's personal goals for that category as cards (reusing the
  v3 goal-card styling: title, plain measure, progress bar, Edit button),
- shows an unmistakable dashed **"+ Add goal"** affordance,
- self-gates: returns `null` and makes no API calls when the flag is off.

Wired into **`components/health-plan/PlanScreenRedesigned.tsx`**: the GOALS
sub-section now renders when `section.goals.length > 0 || PERSONAL_GOALS_ENABLED`
— with the flag off this collapses to `section.goals.length > 0`, i.e.
byte-for-byte today's v3. Patient authoring is scoped to the 8 real categories;
the legacy leftover "Your Goals" bucket stays AI-only.

## Qual/quant + cadence form

**`components/health-plan/PersonalGoalSheet.tsx`** — slide-up add/edit sheet
reusing the existing goal-editor modal pattern. Fields: **type** (Quantitative /
Qualitative, segmented), **cadence** (Monthly / Quarterly / Biannual / Yearly,
chips), **title**, **description**; quantitative → **target** + **unit** +
starting value (baseline); qualitative → an **initial status**. Submit runs the
pure `validatePersonalGoalDraft` (title required ≤120; quantitative target
required + numeric; baseline numeric if given) → POST/PUT. **Delete** (edit mode)
is confirmed via an `Alert` before firing.

**`components/health-plan/PersonalGoalReflectionSheet.tsx`** — qualitative goals
show a status chip + an **"Add reflection"** action → note + optional 1–5 star
rating → the reflection endpoint. Quantitative goals show the measure line +
progress bar.

## Flag-off / graceful / OTA-safe

- **Flag OFF ⇒ today's v3, byte-for-byte:** the only plan-screen condition change
  degenerates to the original; `PersonalGoalsSection` returns null; the query is
  `enabled`-gated so no API calls fire.
- **Flag ON + backend absent:** GET 404 → `[]` → only the "+ Add goal"
  affordance shows, no error spam.
- **OTA-safe:** JS/TSX only — no native, app.json, or dependency changes.
- Accessible (roles/labels on all controls, focus-trapping Modal), responsive
  (font-scaling via `getScaledFontSize/Weight`).

## Tests

`tests/unit/personal-goals.test.ts` (19 tests, all pure `lib/care-plan` logic):
flag default OFF; quantitative/qualitative validation (target/baseline parsing,
title rules, cadence fallback, empty-optional dropping); the 404-graceful
normalizer path (missing/non-array/malformed body ⇒ `[]`, malformed rows
dropped); measure + progress helpers. Full suite: **139 passing** (120 existing +
19 new). `npx tsc --noEmit` clean; eslint clean on touched files.
