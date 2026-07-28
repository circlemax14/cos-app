/**
 * PlanTierPill — CHUNK 33 (2026-07-21).
 *
 * Persistent "Plan: {DisplayName}" pill that renders near the top of
 * PlanScreenV2 whenever the user HAS a tier AND has plan content. Taps
 * route to /Home/plan-type-chooser via the parent-supplied `onPress`.
 *
 * DESIGN CONTINUITY
 * -----------------
 * Same visual language as chunk 27's care-team update chip: 12/400 text,
 * subtext color, no fill, hairline row. Explicitly NOT the big teal
 * legacy hero card — v2 keeps top-of-plan signals subtle so the freshness
 * pill remains the primary trust cue.
 *
 * STATE / SIDE-EFFECTS
 * --------------------
 * ZERO. No useState, no useEffect, no useRef, no AsyncStorage, no
 * network, no timers, no AppState listeners. `displayName` is
 * precomputed by the parent via `usePlanTypeDisplayName()` so the pill
 * stays dumb and SCRUM-577's Family Support rename flows through
 * without any hard-coded label strings here.
 *
 * iOS 26.5 SAFETY (project_ios26_biopsychosocial_parked.md)
 * ---------------------------------------------------------
 * NO Reanimated, NO gesture-handler, NO Modal, NO Animated (native or
 * JS driver), NO rotate/scale/skew transforms, NO LayoutAnimation, NO
 * Portal, NO BlurView. Pressable + StyleSheet + MaterialIcons only —
 * same primitives chunk 27's careChip ships with.
 *
 * HOT-REVERT KILL SWITCH
 * ----------------------
 * Set `PLAN_TIER_PILL_ENABLED = false` at the top of this file and
 * publish an OTA — the component early-returns null without touching
 * the parent JSX. ~30s durable revert if this pill surfaces any device-
 * class regression.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { PlanType } from '@/services/api/plan-type';

// One-line hot revert — flip to false + OTA to disable without editing
// the parent PlanScreenV2 gate. See file header for rationale.
const PLAN_TIER_PILL_ENABLED = true;

// MaterialIcons glyph per tier. Verified to resolve in
// @expo/vector-icons/MaterialIcons (NOT MaterialCommunityIcons) — a
// font miss would silently render as a blank box.
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

function tierIcon(planType: PlanType): MaterialIconName {
  switch (planType) {
    case 'advanced':
      return 'auto-awesome';
    case 'agency-supported':
      return 'groups';
    case 'agency-managed':
      return 'medical-services';
    case 'basic':
    default:
      return 'check-circle-outline';
  }
}

export type PlanTierPillProps = {
  planType: PlanType;
  /**
   * Human-readable tier name precomputed by the parent via
   * `usePlanTypeDisplayName()`. Passed in (not derived here) so this
   * component owns zero label strings — SCRUM-577's Family Support
   * rename flows through the hook without touching this file.
   */
  displayName: string;
  onPress: () => void;
};

export function PlanTierPill({
  planType,
  displayName,
  onPress,
}: PlanTierPillProps): React.JSX.Element | null {
  const { settings, getScaledFontSize } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  if (!PLAN_TIER_PILL_ENABLED) return null;

  const icon = tierIcon(planType);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={`Current plan: ${displayName}. Tap to change plan.`}
      accessibilityHint="Opens the plan-type chooser"
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <MaterialIcons name={icon} size={14} color={colors.subtext} />
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          fontWeight: '400',
          flexShrink: 1,
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {`Plan: ${displayName}`}
      </Text>
      <View style={styles.spacer} />
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          fontWeight: '400',
        }}
      >
        Change
      </Text>
      <MaterialIcons name="swap-horiz" size={12} color={colors.subtext} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  spacer: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 8,
  },
});
