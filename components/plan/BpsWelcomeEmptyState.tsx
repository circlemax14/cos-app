/**
 * ADR-0005 P0 — welcome empty state for the tab-swap BPS surface.
 *
 * When `EXPO_PUBLIC_TAB_SWAP_BPS_ENABLED` is ON and the user has no
 * biopsychosocial plan record yet, the Care Plan tab renders this
 * screen instead of the legacy Care Plan render (which is what would
 * appear with the flag OFF). Ken's Q3 DECIDED shape: "Tap to
 * regenerate" — one primary CTA that fires the BPS regen mutation,
 * matching the visual weight and copy discipline of
 * `components/health-plan/TryNewPlanCta.tsx` (which is the existing
 * opt-in path on the legacy screen for the same regen).
 *
 * Deliberate reuse: this component wraps `TryNewPlanCta` for the CTA
 * body instead of re-implementing the confirm modal + mutation wiring.
 * TryNewPlanCta already self-gates on `useBiopsychosocialPlanFlag()`
 * AND `hasBioPlan`, so it renders its own banner exactly when we want
 * it here (flag on, no plan). Once regen lands, `useBiopsychosocialPlan`
 * invalidates and the parent (`health-plan.tsx` tab-swap branch) flips
 * over to render `BiopsychosocialPlanScreen` — this empty state simply
 * unmounts, same lifecycle discipline as PlanScreenRedesignedV2.
 *
 * iOS 26.5 primitive envelope (see project_ios26_biopsychosocial_parked.md):
 *   - This wrapper renders only View + Text.
 *   - `TryNewPlanCta` itself uses Pressable + Modal, both proven safe on
 *     iPhone 14 iOS 26.5 build 62 (currently shipping in prod on the
 *     legacy screen).
 *   - No ActivityIndicator, no Portal, no Animated in this wrapper.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { TryNewPlanCta } from '@/components/health-plan/TryNewPlanCta';

export function BpsWelcomeEmptyState(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="bps-welcome-empty-state"
    >
      <View style={styles.headerBlock}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(24),
            fontWeight: getScaledFontWeight(700) as any,
            textAlign: 'left',
            marginBottom: Spacing.sm,
          }}
        >
          Your Care Plan
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(15),
            lineHeight: 22,
            textAlign: 'left',
          }}
        >
          Generate a personalized plan organized across Biological,
          Psychological, and Social & Spiritual sections. Tap the banner
          below to build yours — takes about a minute.
        </Text>
      </View>

      {/*
        Reuse TryNewPlanCta rather than re-authoring the confirm sheet +
        regen wiring. Its self-gate (flag on AND no bio plan) matches
        this screen's own precondition, so it always renders here.
        Once regen succeeds, useBiopsychosocialPlan invalidates and the
        parent tab-swap branch flips to BiopsychosocialPlanScreen — this
        component unmounts naturally.
      */}
      <TryNewPlanCta />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Spacing.lg,
  },
  headerBlock: {
    paddingHorizontal: Spacing.md + 4,
    paddingBottom: Spacing.md,
  },
});
