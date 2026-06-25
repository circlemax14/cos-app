# Task 8 — goal-card progress UI (COS-382, SCRUM-523)

## What was added

**File:** `app/Home/health-plan.tsx`

### 1. Import additions (lines 44-49)

```ts
import {
  CARE_PLAN_ENABLED,
  GOAL_PROGRESS_ENABLED,        // ← new
  groupGoalsByCategory,
  formatGoalMeasure,
  formatGoalProgress,           // ← new
} from '@/lib/care-plan';
```

### 2. Progress row block (added after the measurable-line `{!!measure && ...}` in the grouped goal card)

```tsx
{/* COS-382: goal-progress row — flag-gated, inert when GOAL_PROGRESS_ENABLED=false */}
{GOAL_PROGRESS_ENABLED && g.progress && (() => {
  const prog = formatGoalProgress(g);
  if (!prog) return null;
  const trendColor =
    prog.trendSymbol === '↑' ? colors.tint
    : prog.trendSymbol === '↓' ? (colors as any).error ?? '#E53E3E'
    : colors.subtext;
  return (
    <View style={styles.progressRow}>
      {prog.barFraction != null && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(1, Math.max(0, prog.barFraction)) * 100}%` as any,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>
      )}
      {!!prog.trendSymbol && !!prog.line && (
        <Text style={[styles.goalDesc, { color: trendColor, fontSize: getScaledFontSize(11), fontWeight: getScaledFontWeight(600) as any }]} numberOfLines={1}>
          {prog.trendSymbol} {prog.line}
        </Text>
      )}
    </View>
  );
})()}
```

### 3. StyleSheet additions (after `goalDesc`)

```ts
// COS-382: goal-progress row styles (inert when GOAL_PROGRESS_ENABLED=false)
progressRow: { marginTop: 6, gap: 4 },
progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
progressFill: { height: 4, borderRadius: 2 },
```

## How the off-path stays identical

- `GOAL_PROGRESS_ENABLED = false` (in `lib/care-plan.ts`, unchanged from Task 7).
- The entire block is `{false && g.progress && ...}` — React short-circuits to `false`, which renders nothing.
- No existing markup was altered. Only the new IIFE block was inserted between the measurable-line and the closing `</View>` of `goalBody`.
- The legacy flat-list branch (`CARE_PLAN_ENABLED = false`) is completely untouched — the progress row is only inside the `CARE_PLAN_ENABLED` grouped branch.
- `npx tsc --noEmit` → 0 errors. `npm test` (node --test) → 89/89 pass.
