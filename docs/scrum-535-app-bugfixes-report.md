# COS-397 / SCRUM-535 — App test bugfixes

Two bugs reported while testing cos-app. Both fixes are JS/TSX-only (OTA-safe).
No native/app.json/Info.plist/ios/android changes. No EAS build or OTA publish
performed.

---

## Bug 1 — "Build my plan" stale completion gate

### Repro
Health Plan screen → tap the reload/regenerate icon next to "Your Plan" →
backend says the plan can't be generated yet → user routed to check-ins →
completes ALL check-ins → taps "Build my plan" → still gets
"complete all your check-ins" even though they're all done.

### Root cause
The Build CTA (in `components/health-plan/AssessmentCatalogContent.tsx`) gates on
the backend `canGenerate` via `useHealthPlanAssignments` (query key
`['health-plan-assignments']`, `staleTime: 60s`). The assessment stepper DOES
invalidate that key on the final check-in submit — but
`queryClient.invalidateQueries` only triggers an immediate refetch for queries
that have an **active (mounted) observer** at that moment. During the
submit → celebration → `router.replace` flow the screen holding the gate is
unmounted/backgrounded, and there is no focus-driven refetch anywhere. So when
the user returns, React Query re-serves the cached `canGenerate = false`
snapshot (still within stale time) and Build stays blocked. A stale gate, not a
wrong gate.

### Fix
Force the gate inputs to refetch whenever the relevant screen regains focus, so
the Build enablement + error copy always reflect the live backend `canGenerate`:

- `components/health-plan/AssessmentCatalogContent.tsx`: `useFocusEffect` →
  `assignmentsQuery.refetch()` + `assessmentsQuery.refetch()`.
- `app/Home/health-plan.tsx`: `useFocusEffect` → refetch the assignments +
  assessments queries (covers the reload icon gate and the "Personalize your
  plan" banner).

The stepper's existing invalidation on submit is left in place (correct at the
source); the focus refetch closes the cross-route gap where invalidation can't
reach an unmounted observer. Pure gate logic (`lib/build-plan-gate.ts`) was
already unit-tested and is unchanged.

---

## Bug 2 — Health Trends ignores the Apple Health disable

### Repro
User enables Apple Health (`app/Home/apple-health.tsx`), then DISABLES it, then
opens Health Trends — the Apple Health trends are still shown.

### Cause
`hooks/use-healthkit-trends.ts` fetched HealthKit data based only on
`Platform.OS === 'ios'`, ignoring the persisted app-preference
(`services/apple-health-preference.ts`). iOS can't reliably revoke its own
HealthKit read grant, so the app preference must be authoritative — but the data
source never consulted it.

### Fix — gate at the data source so all surfaces respect it
- `lib/apple-health-gate.ts` (new, pure): `shouldFetchAppleHealthTrends` +
  `resolveAppleHealthTrendsState` — the disabled preference is authoritative;
  iOS-only.
- `hooks/use-apple-health-preference.ts` (new): reactive React Query read of the
  preference (`staleTime: 0`, iOS-only), key `['apple-health-preference']`.
- `hooks/use-healthkit-trends.ts`: reads the preference; when disabled (or not
  iOS) the underlying query is disabled and `data` is forced to `[]`, and a new
  `disabled` flag is exposed. The query key includes the resolved preference so
  flipping it re-evaluates and never serves a stale enabled snapshot.
- `app/Home/health-trends.tsx`: consumes `disabled`; when off it hides the Apple
  Health carousel and renders an "Apple Health is turned off" card with a
  "Turn on Apple Health" button → `router.push('/Home/apple-health')`. Refetches
  the preference on focus + on pull-to-refresh. The generic empty card drops its
  Apple-Health mention when the off-card is shown.
- `app/Home/apple-health.tsx`: invalidates `['apple-health-preference']` +
  `['healthkit-trends']` after every preference write so other surfaces update
  without a manual refresh.

Gating at the single data source means any future consumer (`app/Home/index.tsx`,
`app/Home/today-schedule.tsx`) that adopts `useHealthKitTrends` inherits the
behavior automatically — they do not consume HealthKit trends today, so they
already show nothing for Apple Health. Android is unaffected (preference query
disabled; `disabled` is always false off-iOS).

---

## Files changed
- `app/Home/health-plan.tsx` (Bug 1)
- `components/health-plan/AssessmentCatalogContent.tsx` (Bug 1)
- `app/Home/health-trends.tsx` (Bug 2)
- `app/Home/apple-health.tsx` (Bug 2)
- `hooks/use-healthkit-trends.ts` (Bug 2)
- `hooks/use-apple-health-preference.ts` (new, Bug 2)
- `lib/apple-health-gate.ts` (new, pure, Bug 2)
- `tests/unit/apple-health-gate.test.ts` (new tests, Bug 2)

## Verification
- `npx tsc --noEmit`: clean (exit 0).
- `npm test` (node --test): 98 pass / 0 fail, including 7 new
  `apple-health-gate` tests and the existing `build-plan-gate` tests.
- `eslint` on touched files: 0 errors. The only 2 warnings (`toggleTask`,
  `onSkip` unused in `health-plan.tsx`) are pre-existing on main.

## OTA-safety
Diff is TS/TSX only — no `app.json`, `Info.plist`, `ios/`, `android/`,
`*.pbxproj`, `Podfile`, `eas.json`, or any native artifact touched. Native
fingerprint unchanged → safe to ship via OTA. No EAS build / OTA publish was run.
