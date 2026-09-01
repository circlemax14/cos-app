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
 *      plan with the current one badged; "Go to your plan" skips it in one tap
 *      and switching a plan closes it automatically.
 *   2. `entitlementGating` is ON, so each section renders only if the plan
 *      grants its key — the composed plan the dashboard is for.
 *
 * ─── iOS 26 ENVELOPE ─────────────────────────────────────────────────
 *
 * View / Text / Pressable / ScrollView / ActivityIndicator only, all already
 * used by the screens this mirrors. No new primitive is introduced on what is
 * a cold-mount surface.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

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
  const patientName = firstNameFromPatient(patientQuery.data);

  /*
   * COS-801, moved here from the classic tab.
   *
   * `canSwitch` is `selfSwitch && !canPay` — payments parked AND free
   * switching on, which is exactly the window this door is for. Enable a
   * gateway and it stops appearing on its own, with buying moving to Billing.
   *
   * Bypass is per-launch and deliberately not persisted: while nobody has paid
   * for anything, re-offering the chooser on a cold start costs one tap and
   * keeps the door from quietly disappearing again.
   */
  const [planGateBypassed, setPlanGateBypassed] = useState(false);
  const patientPlansQuery = usePatientPlans();
  const { canSwitch } = usePlanChoiceControls();
  const showPlanGate =
    canSwitch &&
    !planGateBypassed &&
    // No cards means nothing to choose between — a door onto a blank wall is
    // worse than no door.
    (patientPlansQuery.data?.plans?.length ?? 0) > 0;

  if (showPlanGate) {
    return (
      <AppWrapper>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }} testID="care-plan-plus-gate">
          {/* The skip, first and compact. Below the shelf it would sit under
              several hundred points of cards; as a full-width button it would
              compete with the heading and make choosing look optional. */}
          <View style={{ alignItems: 'flex-end' }}>
            <Pressable
              onPress={() => setPlanGateBypassed(true)}
              accessibilityRole="button"
              accessibilityLabel="Go to your plan"
              accessibilityHint="Skips the plan chooser and opens your care plan"
              style={({ pressed }) => [
                styles.skipPill,
                {
                  backgroundColor: (colors.tint as string) + '14',
                  borderColor: (colors.tint as string) + '33',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.tint as string,
                  fontSize: getScaledFontSize(13),
                  fontWeight: getScaledFontWeight(700) as never,
                }}
              >
                Go to your plan
              </Text>
              <MaterialIcons
                name="arrow-forward"
                size={getScaledFontSize(16)}
                color={colors.tint as string}
                style={{ marginLeft: 6 }}
              />
            </Pressable>
          </View>

          {/* `chooser` keeps the cards up even for a patient who already
              picked — this screen exists to be picked from. */}
          <PlanStatusSection
            variant="chooser"
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onSwitched={() => setPlanGateBypassed(true)}
          />
        </ScrollView>
      </AppWrapper>
    );
  }

  // Same three sub-branches as the classic tab's tab-swap arm, so the two
  // surfaces resolve an unknown-plan state identically.
  if (planQuery.isLoading) {
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
      onChangePlanType={() => setPlanGateBypassed(false)}
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
  skipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 12,
  },
});
