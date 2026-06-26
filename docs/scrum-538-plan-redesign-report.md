# Care Plan Screen Redesign — COS-402 / SCRUM-538

Goals-first, decluttered redesign of the Care Plan screen (`app/Home/health-plan.tsx`),
gated behind a new **default-OFF** kill-switch so the live app is unchanged until we
flip it on.

Stakeholder brief (Ken): the plan screen is too crowded — make it clean, beautiful, and
dead-simple ("a 5-year-old can understand it"). Goals are editable, but the Edit
affordance was so subtle he pressed it by accident; editing must be unmistakable.

---

## The flag

`PLAN_REDESIGN_ENABLED` — new constant in `lib/care-plan.ts`, **default `false`**.

- **OFF (today):** the screen renders **exactly as before, byte-for-byte**. See the
  flag-off safety reasoning below.
- **ON:** the Plan tab renders the redesigned `PlanScreenRedesigned` component.

Flip the constant to `true` (and OTA-publish) to turn the redesign on; flip back to
`false` to instantly revert. Presentation-only — no data or behavior changes either way.

---

## What's new vs. reused

### New
- `components/health-plan/PlanScreenRedesigned.tsx` — a **presentation-only** component.
  It owns no data and no business logic; everything is passed in as props.
- `lib/care-plan.ts`:
  - `PLAN_REDESIGN_ENABLED` kill-switch (default `false`).
  - `formatGoalPlain(goal)` — pure helper producing the plain-language measure line
    ("You're at 72% toward <7.0%", "From 7.8% to <7.0% over 3 months", "Aiming for
    8,000 steps"). Clamps/rounds the live progress percent; returns `''` when nothing
    is measurable so the card omits the line.
- `tests/unit/care-plan.test.ts` — 4 new tests: the flag defaults OFF, and
  `formatGoalPlain` across progress / baseline-target / empty cases.

### Reused (not duplicated — lifted/shared from the screen)
- **Plan data** (`plan`, `tasks`, `tasksByType`, counts) — passed as props.
- **Build/Refresh** — `onGenerate(true)` + the existing `canGeneratePlan` gating
  (SCRUM-526) wired to the single primary button.
- **`useFocusEffect` refetch** (SCRUM-535) — untouched on the screen; fires for both
  render paths.
- **Goal editing** — `openGoalEditor` (the screen's existing handler) + the shared
  `<Modal>` goal editor stay at the screen level, used by both paths.
- **Goal progress** (COS-382) — `GOAL_PROGRESS_ENABLED` + `formatGoalProgress` reused
  for the (calmer) progress bar + trend line.
- **Category grouping** — `groupGoalsByCategory` reused (flag-aware Nutrition included
  via the shared categories list).
- **Phase A** (COS-391/SCRUM-532) — `isPlanTaskTypeVisible` + `CARE_PLAN_V2_ENABLED`
  reused, so reminders/visits stay off the task list and the "Manage reminders" link is
  kept.
- **Medications** — `MedicationsSection` + `MedicationsReviewPrompt` rendered inside the
  new component; the scroll-to/deep-link ref + signal are still owned by the screen and
  passed through (so `?focus=medications` deep-link, COS-361, keeps working).
- **Notifications/celebration** — all notification + completion behavior lives in shared
  hooks/handlers; presentation-only change preserves it.

---

## Flag-OFF safety reasoning (byte-for-byte)

`git diff HEAD -- app/Home/health-plan.tsx` is **purely additive** — 0 removed lines.
The only changes to the screen are:
1. Two new imports (`PLAN_REDESIGN_ENABLED`, `PlanScreenRedesigned`).
2. A new ternary branch inserted **above** the existing Plan-tab `<ScrollView>`:
   `activeTab === 'progress' ? <ProgressTab/> : PLAN_REDESIGN_ENABLED ? <PlanScreenRedesigned/> : (<ScrollView>…original…</ScrollView>)`.

Because `PLAN_REDESIGN_ENABLED === false`, the new branch is **never taken**, so the
original `<ScrollView>` block runs exactly as before. The original JSX is unmodified
(no lines removed). Importing the new component is a no-op until it's instantiated.
Therefore: **flag OFF ⇒ today's screen, byte-for-byte.** The goal-edit modal and the
Progress tab are outside the branch and shared by both paths.

`lib/care-plan.ts` and `tests/unit/care-plan.test.ts` are also purely additive
(no existing export or test changed).

---

## What each redesign move did

1. **Lead with GOALS, not counts.** The big "COMPLETE PLAN OVERVIEW" KPI count card is
   gone from the redesign; in its place is a tiny one-line "N tasks in your plan" strip
   near the bottom. The header reads **"Your goals"** and goal cards are the hero.
2. **Big, clean goal cards** — one goal per card, generous padding (18pt), large title
   (18pt/700), a plain-language measure line via `formatGoalPlain`, a calmer 8pt progress
   bar + trend line, a priority pill, and an **unmistakable "Edit" button** (pencil icon +
   the word "Edit", outlined, 44pt min hit area) in each card footer. Plus a one-line
   "You can change any goal — tap Edit." hint above the list. Grouped by category with
   plain 18pt category headers.
3. **Collapse the daily-task list.** "FULL PLAN" becomes a secondary **"Today's tasks"**
   toggle (collapsed by default) showing "X of Y done" — expands to the grouped task list
   and the "Manage reminders" link. Stops crowding the goals.
4. **One primary action.** A single full-width **"Refresh my plan" / "Build my plan"**
   button (keeps `canGenerate` gating; disabled + dimmed when generating or not allowed).
5. **Bigger type, more spacing, simpler words, calmer color.** 14–18pt body/title type,
   16–22pt margins, accessible labels/roles/hints, ≥44pt hit areas, AA-contrast tint on
   white/dark. Color is used sparingly (priority pills, progress fill) instead of the busy
   multi-color count grid.

---

## Layout, in words (flag ON)

```
[ Medications review prompt — only if needed ]
[ Personalize-your-plan banner — only if check-ins incomplete ]

Your goals
Updated Jun 26  ·  4 goals

[  Refresh my plan  ]            ← single full-width primary button

[ tune ] Plan type: Advanced              Change   ← thin strip

┌ YOUR PLAN, IN SHORT ──────────────┐
│ <plan.summary>                    │
│ AI citations (compact)            │
└───────────────────────────────────┘

[ Medications section — self-gating ]

  edit  You can change any goal — tap Edit.

Medical, Nursing & Physical Therapy
┌───────────────────────────────────┐
│ 🚩  Walk more each day            │
│     Build up your daily steps.    │
│     You're at 72% toward 8,000    │
│     ▓▓▓▓▓▓▓░░░  (calm bar)        │
│     ↑ 5,200 → 5,800 → 8,000       │
│     [HIGH PRIORITY]   [ ✏ Edit ]  │
└───────────────────────────────────┘
   …more goal cards, grouped by category…

[ checklist  6 tasks in your plan ]       ← tiny strip

[ today  Today's tasks            ⌄ ]      ← collapsed by default
   (expand → progress bar, Manage reminders, grouped task rows)
```

---

## Verification

- `npx tsc --noEmit` → clean (exit 0).
- `npm test` → **106 pass / 0 fail** (was 102; +4 new for the flag default + helper).
- `npx eslint` on touched files → **0 errors** (2 pre-existing `toggleTask`/`onSkip`
  unused-var warnings, present at HEAD, not introduced here).
- Diff is purely additive (130 insertions, 0 deletions across the 3 modified files).
- OTA-safe: only `.ts`/`.tsx` changed; no `app.json`, `Info.plist`, `ios/`, `android/`,
  native modules, or deps. No EAS build / OTA publish performed.
