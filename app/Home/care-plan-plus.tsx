/**
 * COS-803 — "Plan+", the entitlement-composed care plan.
 *
 * ─── WHY A SECOND TAB ────────────────────────────────────────────────
 *
 * The entitlement work kept being built ON TOP of the Care Plan tab, and
 * every round broke the one screen every patient already depends on: a price
 * shelf above the daily tasks, then a chooser that was a one-way door, then
 * sections vanishing because no plan granted keys that had only just been
 * invented. Each fix was correct and each one landed on the live surface.
 *
 * So the classic Care Plan tab is now frozen as production ships it — it
 * renders BiopsychosocialPlanScreen with `entitlementGating` ABSENT, so no
 * gate can hide anything there no matter what a plan grants — and the new
 * behaviour lives here, one tab to the right. Same component, same data, same
 * layout. The two can be put side by side, and the half still being figured
 * out cannot take the working half down with it.
 *
 * ─── WHAT IS DIFFERENT HERE ──────────────────────────────────────────
 *
 *   1. The plan chooser (COS-801) is the front door. First arrival shows every
 *      plan; the one you hold is badged and carries a "Go to your plan" button,
 *      and switching to any other closes the chooser automatically.
 *   2. `entitlementGating` is ON, so each section renders only if the plan
 *      grants its key — the composed plan the dashboard is for.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable / ScrollView / ActivityIndicator only, all already
 * used by the screens this mirrors. No new primitive is introduced on what is
 * a cold-mount surface.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { BiopsychosocialPlanScreen } from '@/components/health-plan/BiopsychosocialPlanScreen';
import { BpsWelcomeEmptyState } from '@/components/plan/BpsWelcomeEmptyState';
import PlanStatusSection, {
  usePatientPlans,
  usePlanChoiceControls,
} from '@/components/plan/PlanStatusSection';
import { useBiopsychosocialPlan } from '@/hooks/use-biopsychosocial-plan';
import { usePlanType } from '@/hooks/use-plan-type';
import { useHealthPlanAssignments } from '@/hooks/use-health-plan-assignments';
import { PlanAssessmentGate } from '@/components/plan/PlanAssessmentGate';
import { PlanBuildingBanner } from '@/components/plan/PlanBuildingBanner';
import { usePatientInfo } from '@/hooks/use-patient';
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

/** Pure helper — no hooks — mirrors app/Home/biopsychosocial-plan.tsx's version. */
function firstNameFromPatient(
  patient: { name?: { given?: string[]; family?: string }[] } | undefined,
): string | null {
  const given = patient?.name?.[0]?.given?.[0];
  return given && given.trim() ? given.trim() : null;
}

function CarePlanPlusInner(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const planQuery = useBiopsychosocialPlan();
  const patientQuery = usePatientInfo();
  const planTypeQuery = usePlanType();
  /*
   * COS-822 — poll while a switch is rebuilding.
   *
   * There is no push for this and the window is under a minute, so the screen
   * asks. A blocked screen that needs a manual refresh to leave is worse than
   * a few requests; the interval drops back to nothing the moment it clears.
   */
  const assignmentsQuery = useHealthPlanAssignments();
  const rebuilding = assignmentsQuery.data?.regenPending === true;
  React.useEffect(() => {
    if (!rebuilding) return;
    const id = setInterval(() => void assignmentsQuery.refetch(), 5000);
    return () => clearInterval(id);
  }, [rebuilding, assignmentsQuery]);
  const patientName = firstNameFromPatient(patientQuery.data);

  /*
   * COS-811 — the chooser is a FIRST-RUN door, and it has to remember.
   *
   * COS-801 held the bypass in plain component state, reasoning that
   * re-offering the chooser on a cold start cost one tap. That was wrong twice
   * over. It is not per-launch — this is a tab, and the route remounts every
   * time you switch to it, so the chooser reappeared on EVERY visit, in front
   * of the plan, forever. And even per-launch was more than anyone asked for.
   *
   * The rule now: show it once, ever. After that the tab opens on the plan,
   * and the only way back to the shelf is asking for it — the "switch plan"
   * pill, which sets `reopened` without touching what is on disk.
   *
   * `seen === null` means the read is still in flight. The gate stays shut
   * until it resolves, so nobody sees the plan for a frame and then gets
   * yanked to a price list.
   */
  const CHOOSER_SEEN_KEY = 'care-plan-plus.chooser.seen';
  const [seen, setSeen] = useState<boolean | null>(null);
  const [reopened, setReopened] = useState(false);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const v = await AsyncStorage.getItem(CHOOSER_SEEN_KEY);
        if (alive) setSeen(v === '1');
      } catch {
        // Storage failing must not trap anyone in the chooser. Treat it as
        // seen: the pill still reaches the shelf, and the cost of being wrong
        // this way is one fewer prompt rather than an inescapable screen.
        if (alive) setSeen(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismissChooser = useCallback(() => {
    setReopened(false);
    setSeen(true);
    void (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.setItem(CHOOSER_SEEN_KEY, '1');
      } catch {
        // In-memory state already moved on; the worst case is one more prompt
        // next launch, which is not worth failing the tap over.
      }
    })();
  }, []);

  const patientPlansQuery = usePatientPlans();
  const { canSwitch } = usePlanChoiceControls();
  const showPlanGate =
    canSwitch &&
    (reopened || seen === false) &&
    // No cards means nothing to choose between — a door onto a blank wall is
    // worse than no door.
    (patientPlansQuery.data?.plans?.length ?? 0) > 0;

  if (showPlanGate) {
    return (
      <AppWrapper>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }} testID="care-plan-plus-gate">
          {/* `chooser` keeps the cards up even for a patient who already
              picked — this screen exists to be picked from. */}
          <PlanStatusSection
            variant="chooser"
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onSwitched={dismissChooser}
            /* COS-806 — the exit lives on the card that is already yours,
               instead of a pill in the corner. See PlanStatusSection. */
            onGoToPlan={dismissChooser}
          />
        </ScrollView>
      </AppWrapper>
    );
  }

  // Same three sub-branches as the classic tab's tab-swap arm, so the two
  // surfaces resolve an unknown-plan state identically.
  if (seen === null || planQuery.isLoading) {
    return (
      <AppWrapper>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.subtext, fontSize: getScaledFontSize(14) }]}>
            Loading your plan…
          </Text>
        </View>
      </AppWrapper>
    );
  }

  /*
   * COS-813 — the assessment gate, AFTER the chooser and BEFORE the plan.
   *
   * Order is the whole design. The chooser comes first because a patient who
   * has not picked a plan cannot be gated on that plan's questions. The gate
   * comes before both the empty state and the plan itself, because the plan is
   * built FROM these answers — showing "no plan yet, tap to generate" while
   * refusing to generate would be a dead end wearing a CTA.
   *
   * `canGenerate === false` alone is not enough. It is also false for an
   * advanced-tier patient with nothing assigned, whose answer is "your care
   * team will assign these" and who has nothing to tap. Requiring a non-empty
   * `remaining` means the gate only appears when there is actually something
   * the patient can DO about it.
   *
   * Undefined while loading, so a slow query never flashes the gate.
   */
  /*
   * COS-822 — the rebuild blocks BEFORE the gate and before the plan.
   *
   * It has to outrank both. Behind it sits a complete, confident care plan
   * built for the plan the patient just left; showing that with a banner over
   * it would leave the wrong goals and the wrong tasks tappable underneath.
   */
  if (rebuilding) return <PlanBuildingBanner />;

  const assignments = assignmentsQuery.data;
  const remaining = assignments?.remainingInstrumentIds ?? [];
  if (assignments && assignments.canGenerate === false && remaining.length > 0) {
    return (
      <PlanAssessmentGate
        remaining={remaining}
        completedCount={assignments.completedInstrumentIds.length}
        totalCount={assignments.assignedInstrumentIds.length}
        previousPlanKey={assignments.previousPlanKey ?? null}
      />
    );
  }

  if (planQuery.data?.plan == null) {
    return (
      <AppWrapper>
        <BpsWelcomeEmptyState />
      </AppWrapper>
    );
  }

  return (
    <BiopsychosocialPlanScreen
      currentPlanType={planTypeQuery.planType}
      /*
       * COS-804 — on Plan+ the "switch plan" pill reopens THIS tab's chooser.
       *
       * It was pushing /Home/plan-type-chooser, which is the OTHER plan
       * concept entirely: care plan TYPE (basic / advanced / agency), the
       * thing that decides assessment depth. Tapping "switch plan" on the
       * entitlement surface and landing on the tier picker is just the wrong
       * screen — and it is the one place a patient would look to change the
       * plan they had just chosen from the shelf.
       *
       * The classic Care Plan tab still opens the type chooser from its own
       * pill, unchanged. Two tabs, two meanings of "plan", each pill going
       * where its own surface is about.
       */
      onChangePlanType={() => setReopened(true)}
      /* COS-805 — say what the pill opens. It leads to the entitlement shelf,
         so it names the entitlement plan, not the care plan type. Same query
         the shelf reads, and onSwitch invalidates it before closing the gate,
         so the label is never a switch behind. */
      planLabel={patientPlansQuery.data?.billing?.planName ?? null}
      /* BPS_MODAL_CONSOLIDATION_ENABLED is on, so the child owns the goal
         editor Modal and this callback is dead state — same as the classic
         tab passes. */
      onEditGoal={() => undefined}
      patientName={patientName}
      entitlementGating
    />
  );
}

/**
 * Wrapped INSIDE the tab so a throw here costs this screen, not the app.
 * This is the surface where half-finished entitlement work lands, so it is
 * the tab most likely to throw — and the classic Care Plan tab beside it must
 * survive that.
 */
export default function CarePlanPlus(): React.JSX.Element {
  return (
    <ScreenErrorBoundary screen="care-plan-plus">
      <CarePlanPlusInner />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { marginTop: 4 },
});
