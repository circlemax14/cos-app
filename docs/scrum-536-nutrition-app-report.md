# SCRUM-536 / COS-399 — Nutrition care-plan category (cos-app)

Mirrors Ken's care-plan structure update on the app side. Ken added a 9th
category, **Nutrition**, at position **#2** (Medical → **Nutrition** → Cognitive
→ …). The backend (COS-398, built separately) adds the `nutrition` category
behind a matching SSM flag and only emits nutrition goals once that flag is on.
This change mirrors that registry in the app's category list, gated behind a
matching client kill-switch.

## What changed

`lib/care-plan.ts`

- **`CarePlanCategoryKey`** — added `'nutrition'` to the union (in Ken's order,
  after `medical`, before `cognitive`).
- **`ALL_CARE_PLAN_CATEGORIES`** (new, module-private) — the full 9-category
  master registry in Ken's order, with Nutrition at index 1 (position #2),
  label `Nutrition`. Keys/labels/order MUST match
  `cos-backend/src/services/care-plan-categories.ts`.
- **`NUTRITION_PLAN_ENABLED`** (new, exported) — `export const NUTRITION_PLAN_ENABLED = false;`
  kill-switch, **default OFF**, with a doc comment. Flip to `true` + OTA to
  surface Nutrition, matching the backend SSM flag rollout. Flip back to `false`
  + OTA to instantly revert.
- **`CARE_PLAN_CATEGORIES`** (exported, behavior change) — now a **flag-aware**
  list: when `NUTRITION_PLAN_ENABLED` is OFF it is
  `ALL_CARE_PLAN_CATEGORIES.filter(c => c.key !== 'nutrition')` (the original 8
  in the original order); when ON it is the full 9 with Nutrition at index 1.
- **`CARE_PLAN_CATEGORY_KEYS`** — unchanged derivation (`.map(c => c.key)` over
  the flag-aware list), so it tracks the flag automatically.
- **`categoryLabel`** — now resolves against the full master registry so a
  `nutrition` label still resolves even with the flag off (defensive; present-
  only grouping won't actually surface it while OFF).

## The flag / flag-off safety

`NUTRITION_PLAN_ENABLED = false` is a static compile-time constant, identical to
the existing `CARE_PLAN_ENABLED` / `GOAL_PROGRESS_ENABLED` / `CARE_PLAN_V2_ENABLED`
kill-switch pattern.

**Flag OFF ⇒ byte-for-byte today's plan.** With the flag off,
`CARE_PLAN_CATEGORIES` filters out `nutrition`, leaving the exact original 8
categories in the exact original order. `groupGoalsByCategory` (the only consumer
in `app/Home/health-plan.tsx`) iterates that flag-aware list and groups
present-only, so the rendered plan is unchanged. The backend also won't emit
nutrition goals while its own flag is off, so this is doubly inert.

**Flag ON (both sides) ⇒ Nutrition at #2.** When the client flag is flipped and
the backend sends nutrition goals, `groupGoalsByCategory` places the Nutrition
section at position #2 (index 1) automatically — no UI/JSX change required, since
`health-plan.tsx` already renders whatever groups `groupGoalsByCategory` returns,
in registry order.

No changes to `app/Home/health-plan.tsx` were needed: it consumes
`groupGoalsByCategory` (not the raw list), which already honors the flag-aware
registry.

## Tests

`tests/unit/care-plan.test.ts` (node:test, pure — no RN imports):

- New: `NUTRITION_PLAN_ENABLED` defaults OFF.
- Rewrote the "category keys" test to be **flag-aware** and assert **both**
  states explicitly: flag OFF ⇒ the original 8 keys in Ken's order (no
  `nutrition`); flag ON ⇒ 9 keys with `nutrition` at index 1 and label
  `Nutrition`.
- New: `categoryLabel('nutrition')` resolves to `Nutrition` even with the flag
  off (defensive lookup).

All 100 unit tests pass. `npx tsc --noEmit` clean. ESLint clean for touched
files (0 errors; the 2 warnings in `health-plan.tsx` are pre-existing and
untouched).

## OTA-safety

Pure JS/TSX change in `lib/care-plan.ts` + tests. No native code, no `app.json`,
no deps, no plugins — OTA-safe. No EAS build / no OTA publish performed.

## Backend contract match

| | key | label | position |
|---|---|---|---|
| App (this change) | `nutrition` | `Nutrition` | #2 (index 1, after `medical`, before `cognitive`) |
| Backend (COS-398) | `nutrition` | `Nutrition` | #2 |

Key, label, and position match the backend contract per the SCRUM-536 spec.
