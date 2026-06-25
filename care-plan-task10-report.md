# Care Plan Task 10 Report — Category-grouped, editable goals UI (COS-377)

## Imports added to `app/Home/health-plan.tsx`

**React Native core (existing import block extended):**
- `Alert` — for error feedback on save failure
- `Modal` — RN built-in modal used for the goal editor sheet
- `TextInput` — used inside the editor for all editable fields

**New type import:**
- `AiPlanGoal` added to the existing `@/services/api/types` import line

**New module imports:**
```ts
import {
  CARE_PLAN_ENABLED,
  groupGoalsByCategory,
  formatGoalMeasure,
} from '@/lib/care-plan';
import { useUpdatePlanGoal } from '@/hooks/use-health-plan';
```

## How the off-path (flag=false) stays identical

The Goals section is wrapped as:
```tsx
{plan.goals.length > 0 && (
  CARE_PLAN_ENABLED ? (
    /* NEW grouped view */
  ) : (
    /* ORIGINAL flat list — exact original JSX preserved here */
  )
)}
```

Since `CARE_PLAN_ENABLED = false` is a compile-time constant, the JS engine evaluates the ternary at the same place the original block was. The else-branch is a byte-for-byte copy of the original Goals section (lines 843-881 before this change), including the same `styles.*` references, same `PRIORITY_STYLE` usage, and same `{plan.goals.length} Active` count badge. No behavior change is shipped.

The Modal block is additionally wrapped in `{CARE_PLAN_ENABLED && (...)}` so it is entirely absent from the render tree when the flag is off.

## How the edit refreshes plan state

The screen manages plan state via `useState<AiHealthPlan | null>` with setter `setPlan`. The `useUpdatePlanGoal` hook (from `hooks/use-health-plan.ts`) wraps a `useMutation` that calls `updatePlanGoal(goalId, patch)` and on success invalidates the `['ai-health-plan']` React Query key.

Because this screen does NOT use React Query for the plan (it uses `useState` + imperative `fetchAiHealthPlan()` calls), the query invalidation alone would not refresh the UI. Therefore `saveGoalEdit` calls:

```ts
const updatedPlan = await updateGoalMutation.mutateAsync({ goalId: editGoal.id, patch });
setPlan(updatedPlan);
```

The mutation returns the full updated `AiHealthPlan` from the backend. `setPlan(updatedPlan)` updates the screen's local state immediately, so the goal card reflects the new values without a full reload.

## Modal component used

React Native's built-in `Modal` (`react-native` package). No custom BottomSheet component was found in `components/ui/` that was suitable for reuse without additional setup. The `filter-menu.tsx` in `components/ui/` uses `Modal` in the same way. The editor slides up from the bottom (`animationType="slide"`, transparent overlay) and is styled as a bottom sheet via `goalEditorStyles` (a separate `StyleSheet.create` block added at the end of the file, scoped to the care-plan feature).

## Fields supported in the editor

- title (TextInput, max 120)
- description (TextInput multiline, max 300)
- metric (TextInput, max 80)
- baseline (TextInput, max 40)
- target (TextInput, max 40)
- timeframe (TextInput, max 40)
- status (segmented chip: active / achieved / paused / cancelled)

Only changed fields are sent in the patch (compared against original goal values).

## tsc result

`npx tsc --noEmit` — 0 errors, 0 output (clean exit). No pre-existing errors were present on this branch either.
