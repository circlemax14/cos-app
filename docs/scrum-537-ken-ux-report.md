# SCRUM-537 — Ken UX fixes (COS-401)

Two small, OTA-safe (JS/TSX-only) cos-app changes from Ken's testing feedback.
Branch: `COS-401/ken-ux-fixes` (off `main`). LIVE app. No native files touched.

---

## Change 1 — Goal-edit discoverability cue

Ken: "I saw you can edit goals — found by accident. It doesn't instruct that
goal metrics can be added." The care-plan goal cards were already editable
(title / description / target / metrics via `openGoalEditor`), but there was no
visible affordance — discovered only by accident.

**File:** `app/Home/health-plan.tsx` (the `CARE_PLAN_ENABLED` category-grouped
goal view — the editable branch).

Added two tasteful, accessible cues:

1. **Section helper line** (above the goal groups): a small pencil + one-liner
   "Tap a goal to edit its target & metrics" in the existing `colors.subtext`
   token. Labeled for screen readers (`accessibilityRole="text"`).
2. **Per-card "Edit" affordance**: a small pencil + "Edit" in `colors.tint`,
   stacked under the existing priority pill (new `goalTrailing` wrapper). It is
   decorative and hidden from screen readers (`accessibilityElementsHidden` +
   `importantForAccessibility="no-hide-descendants"`) to avoid a double read,
   since the whole card is now an explicitly-labeled button.
3. The goal card `TouchableOpacity` gained `accessibilityRole="button"`,
   `accessibilityLabel={`Edit goal: ${title}`}`, and an `accessibilityHint`
   ("Opens the goal editor to change its target and metrics"). Adequate hit area
   (the whole card was already the tap target).

The edit **functionality is unchanged** — this is signposting only. All new
styling reuses existing tokens (`colors.subtext`, `colors.tint`,
`getScaledFontSize`) and matches card layout.

Only the `CARE_PLAN_ENABLED=true` branch is touched; the legacy flat-list branch
is byte-for-byte unchanged.

---

## Change 2 — Screenshot un-block toggle

The app blocks screenshots/screen-recording app-wide to protect PHI. Ken needs
to send screenshots while testing.

**Mechanism found:** `app/_layout.tsx` `RootLayout` effect calling
`ScreenCapture.preventScreenCaptureAsync()` (expo-screen-capture, SCRUM-368 /
MOBILE-003). This is the **JS expo-screen-capture path** — so it is
**OTA-controllable; no native rebuild required.** (On Android the JS call sets
`FLAG_SECURE` at runtime via the library, and on iOS it wires the
capture-notification listener — both are driven from this single JS effect,
which is why gating it in JS is sufficient. There is no separate hardcoded
`FLAG_SECURE` in the Android manifest that would need a build.)

**New flag:** `SCREENSHOTS_BLOCKED` in `lib/screenshot-policy.ts`
(RN-import-free, node:test-loadable, mirrors `lib/care-plan.ts`).

- **Default `true` (SECURE — screenshots blocked, today's behavior).**
- Pure helper `shouldPreventScreenCapture(blocked = SCREENSHOTS_BLOCKED)` so the
  default-secure invariant is unit-testable without mounting RN.
- Wiring in `_layout.tsx`:
  - flag `true`  → `preventScreenCaptureAsync()` (block — current behavior).
  - flag `false` → `allowScreenCaptureAsync()` (stop preventing capture — OTA
    path for testers).

**HIPAA note** (in code, in both files): flipping `SCREENSHOTS_BLOCKED` to
`false` removes a PHI safeguard for **all** users on that build/OTA — intended
only as a temporary, deliberate testing toggle. Flip back to `true` and OTA
before real users see PHI on that build.

**To let Ken screenshot:** set `SCREENSHOTS_BLOCKED = false` → OTA → collect →
set back to `true` → OTA. No binary cut needed.

---

## Verification

- `npx tsc --noEmit` — clean (exit 0).
- `npm test` (node --test) — **102 pass / 0 fail**, including 4 new
  `screenshot-policy` tests asserting the default-secure invariant and both
  toggle paths.
- Lint on touched files — 0 new errors / 0 new warnings (pre-existing
  `toggleTask`/`onSkip` unused-var warnings in health-plan.tsx are unrelated).
- Diff is **TS/TSX only** — no `app.json` / `Info.plist` / `ios/` / `android/` /
  native. **OTA-safe.**

Files:
- `app/Home/health-plan.tsx` (cue)
- `app/_layout.tsx` (flag wiring)
- `lib/screenshot-policy.ts` (new flag + pure helper)
- `tests/unit/screenshot-policy.test.ts` (new tests)
