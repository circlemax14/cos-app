# Fix A/B Report — SCRUM-524 & SCRUM-526

## Fix A — SCRUM-524: Stuck blank modal on plan-type → Basic

**File:** `components/health-plan/PlanTypeChooser.tsx`

**Root cause:** The `onSuccess` handler dismissed both the inner (consent) modal and the outer (pageSheet) modal in the same render commit. On iOS, simultaneous nested-Modal dismissals collide, leaving an orphaned blank pageSheet. For the Basic case this was visible because no subsequent `router.push` masked it.

**Before (lines 141-150):**
```tsx
setPendingType(null)
setConsentAck(false)
onClose()
if (type !== 'basic') {
  router.push('/Home/assessments-catalog?source=plan-upgrade' as never)
}
```

**After:**
```tsx
// SCRUM-524: close inner consent modal immediately, then defer the
// outer pageSheet dismissal one frame so iOS doesn't collide the
// two nested-Modal dismissals (which left a blank orphaned sheet).
setConsentAck(false)
setPendingType(null)            // close inner consent modal now
requestAnimationFrame(() => {   // defer outer-sheet dismissal one frame so iOS
  onClose()                     // doesn't collide the two nested-Modal dismissals
  if (type !== 'basic') {
    router.push('/Home/assessments-catalog?source=plan-upgrade' as never)
  }
})
```

---

## Fix B — SCRUM-526: Reload/regenerate button not gated by canGeneratePlan

**File:** `app/Home/health-plan.tsx`

**Root cause:** The refresh button was only `disabled={generating}`. A non-basic user with incomplete assigned check-ins could tap the button even though `canGeneratePlan` was `false`, triggering a plan generation request that would fail or produce an incomplete plan.

`canGeneratePlan` is computed at line ~253:
```tsx
const canGeneratePlan = assignments?.canGenerate ?? (currentPlanType === 'basic');
```

**Before (line ~632):**
```tsx
disabled={generating}
```

**After:**
```tsx
disabled={generating || !canGeneratePlan} {/* SCRUM-526: also gate when check-ins are incomplete */}
```

---

## Verification

- `npx tsc --noEmit`: clean (no errors)
- `npm test` (node --test): 89/89 pass, 0 fail
