# Care Plan v2 — Phase A (Plan-View Cleanups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind a dark-launch flag, stop the Care Plan view from rendering the **reminders** and **visits** task groups (and their overview counts), and add a "Manage reminders" deep-link to the existing reminder settings — without changing any data.

**Architecture:** Add a static client flag `CARE_PLAN_V2_ENABLED` + a pure visibility helper in `lib/care-plan.ts` (unit-tested), then consume it in `app/Home/health-plan.tsx` to filter the FULL PLAN task groups + overview counts and render a "Manage reminders" affordance. Flag OFF ⇒ byte-for-byte today's plan.

**Tech Stack:** React Native / Expo, TypeScript, expo-router, `node --test` (pure-function unit tests in `tests/unit/`).

## Global Constraints
- App is LIVE. Additive + backward-compatible. Flag `CARE_PLAN_V2_ENABLED` default **`false`** (dark) — flag OFF renders the plan exactly as today (medication, exercise, **Visits**, **Reminders** groups + their counts all present).
- **OTA-safe / JS-only.** No `app.json`/Info.plist/`ios`/`android`/plugin/native changes. Do NOT trigger any EAS build or publish any OTA update.
- Do NOT delete reminder/visit data — only stop the plan view from rendering those groups. Calendar appointments (`app/Home/appointments.tsx`, unified feed) are a separate surface and are untouched.
- HIPAA: no PHI in logs.

## File Structure
- Modify: `lib/care-plan.ts` — add `CARE_PLAN_V2_ENABLED` + `PLAN_TASK_TYPES_HIDDEN_IN_V2` + `isPlanTaskTypeVisible()`.
- Modify: `tests/unit/care-plan.test.ts` — add tests for the helper.
- Modify: `app/Home/health-plan.tsx` — gate the FULL PLAN groups (lines ~1044-1113), the overview Visits/Reminders counts (lines ~879-894), and add the "Manage reminders" affordance (route `/Home/reminder-settings`).

---

### Task 1: Flag + pure visibility helper (TDD)

**Files:**
- Modify: `lib/care-plan.ts`
- Test: `tests/unit/care-plan.test.ts`

**Interfaces:**
- Produces: `CARE_PLAN_V2_ENABLED: boolean`; `PLAN_TASK_TYPES_HIDDEN_IN_V2: readonly string[]`; `isPlanTaskTypeVisible(type: string, v2Enabled: boolean): boolean`.

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/care-plan.test.ts`:

```typescript
import {
  CARE_PLAN_V2_ENABLED,
  isPlanTaskTypeVisible,
} from '../../lib/care-plan.ts';

test('CARE_PLAN_V2_ENABLED defaults OFF (Phase A dark-launch)', () => {
  assert.equal(CARE_PLAN_V2_ENABLED, false);
});

test('isPlanTaskTypeVisible: flag OFF shows every task type', () => {
  for (const t of ['medication', 'exercise', 'appointment', 'reminder']) {
    assert.equal(isPlanTaskTypeVisible(t, false), true);
  }
});

test('isPlanTaskTypeVisible: flag ON hides reminders + visits(appointment), keeps the rest', () => {
  assert.equal(isPlanTaskTypeVisible('reminder', true), false);
  assert.equal(isPlanTaskTypeVisible('appointment', true), false);
  assert.equal(isPlanTaskTypeVisible('medication', true), true);
  assert.equal(isPlanTaskTypeVisible('exercise', true), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `CARE_PLAN_V2_ENABLED`/`isPlanTaskTypeVisible` not exported.

- [ ] **Step 3: Implement** — add to `lib/care-plan.ts` (near the existing `CARE_PLAN_ENABLED`/`GOAL_PROGRESS_ENABLED` constants):

```typescript
// SCRUM-532 Phase A — Care Plan v2 plan-view cleanups. Dark-launch: default OFF;
// flip to true + OTA to enable. When ON, the plan view hides the reminders +
// visits task groups (reminders move to Notifications/Reminders settings; visits
// live on the Calendar). Flag OFF = today's plan exactly.
export const CARE_PLAN_V2_ENABLED = false;

// Full-Plan task types hidden when Care Plan v2 is on.
export const PLAN_TASK_TYPES_HIDDEN_IN_V2: readonly string[] = ['reminder', 'appointment'];

export function isPlanTaskTypeVisible(type: string, v2Enabled: boolean): boolean {
  if (!v2Enabled) return true;
  return !PLAN_TASK_TYPES_HIDDEN_IN_V2.includes(type);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all existing + the 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/care-plan.ts tests/unit/care-plan.test.ts
git commit -m "feat(care-plan-v2): CARE_PLAN_V2_ENABLED flag + plan-task visibility helper (COS-391, SCRUM-532 Phase A)"
```

---

### Task 2: Wire the helper into the plan view

**Files:**
- Modify: `app/Home/health-plan.tsx`

**Interfaces:**
- Consumes: `CARE_PLAN_V2_ENABLED`, `isPlanTaskTypeVisible` from `lib/care-plan.ts`.

- [ ] **Step 1: Import the flag + helper** — extend the existing import from `@/lib/care-plan` (around line 45-50) to include `CARE_PLAN_V2_ENABLED` and `isPlanTaskTypeVisible`.

- [ ] **Step 2: Filter the FULL PLAN task groups.** In the FULL PLAN block (~line 1046), change the group filter from:

```tsx
{tasksByType
  .filter((g) => g.tasks.length > 0)
  .map((group) => {
```
to:
```tsx
{tasksByType
  .filter((g) => g.tasks.length > 0 && isPlanTaskTypeVisible(g.type, CARE_PLAN_V2_ENABLED))
  .map((group) => {
```

- [ ] **Step 3: Gate the overview Visits + Reminders counts.** In the COMPLETE PLAN OVERVIEW card, wrap the Visits count cell (~lines 879-885) and the Reminders count cell (~lines 888-894) so they render only when their type is visible, e.g. wrap each in `{isPlanTaskTypeVisible('appointment', CARE_PLAN_V2_ENABLED) && ( ...Visits cell... )}` and `{isPlanTaskTypeVisible('reminder', CARE_PLAN_V2_ENABLED) && ( ...Reminders cell... )}`. (Keep the medication + exercise cells unconditional.)

- [ ] **Step 4: Add the "Manage reminders" affordance.** When `CARE_PLAN_V2_ENABLED`, render a single tappable row/button (reuse the screen's existing row styling) labeled "Manage reminders" that calls `router.push('/Home/reminder-settings' as never)` (the same deep-link already used at ~line 811). Place it where the reminders group used to appear (e.g. just below the FULL PLAN header). Render nothing extra when the flag is OFF.

- [ ] **Step 5: Verify (typecheck + tests + manual reasoning)**

Run: `npx tsc --noEmit` → expect clean.
Run: `npm test` → expect PASS.
Manual reasoning to confirm in the diff: with `CARE_PLAN_V2_ENABLED === false` the JSX is byte-for-byte today's (helper returns true for all types, the affordance block is not rendered); with it `true`, the reminder + appointment groups + their overview counts disappear and the "Manage reminders" row appears. No other plan content changes.

- [ ] **Step 6: Commit**

```bash
git add app/Home/health-plan.tsx
git commit -m "feat(care-plan-v2): hide reminders/visits from plan view + Manage reminders link, flag-gated (COS-391, SCRUM-532 Phase A)"
```

---

## Self-Review
- **Spec coverage:** Spec §2 (reminders off the plan → Manage reminders affordance; visits out, keep calendar) → Tasks 1-2. Flag-gating (CARE_PLAN_V2_ENABLED default OFF) → Task 1. Backward-compat (flag OFF = today) → the helper's `if (!v2Enabled) return true` + manual verify in Task 2 Step 5. No spec gap for Phase A.
- **Placeholder scan:** none — exact files, code, and commands given.
- **Type consistency:** `isPlanTaskTypeVisible(type, v2Enabled)` and `CARE_PLAN_V2_ENABLED` used identically in Tasks 1 + 2.
- **OTA-safety:** all edits are TS/TSX; no native/app.json. Implementer must not run EAS/OTA.
