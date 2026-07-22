/**
 * PlanSkeleton + PlanErrorCard — CHUNK 17 (2026-07-21).
 * Promoted to `components/plan-shared/` in CHUNK 39 (2026-07-21).
 *
 * First-paint placeholder + retryable error card for the plan surfaces.
 * Consumed by:
 *   • PlanScreenV2 (components/unified-plan/v2/PlanScreenV2.tsx) — original
 *     chunk-17 consumer.
 *   • BiopsychosocialPlanScreen (components/health-plan/…) — added in
 *     chunk 39 to replace an <ActivityIndicator size="large"> in BPS's
 *     cold-mount branch (same iOS-26 crash class chunk 17 fixed for v2).
 *
 * WHY: before Chunk 17, if useUnifiedPlan is still loading on cold
 * start, PlanScreenV2 renders WellbeingMapCard + (AISuggestionStrip
 * returns null with no bullets) + BpsAccordion (empty-state italics
 * per section). The screen is largely blank until the network round-
 * trip completes, and once it does the BpsAccordion mounts abruptly —
 * pushing existing content around. This chunk closes that gap with a
 * static 3-block placeholder that matches the BpsAccordion collapsed-
 * header footprint pixel-for-pixel, so the WellbeingMapCard +
 * AISuggestionStrip stack above does NOT jump on data arrival.
 *
 * iOS 26.5 SAFE PRIMITIVES ONLY (reaffirmed for chunk 39 BPS consumer):
 *   View · Text · Pressable · StyleSheet
 * Explicitly avoided (all forbidden per crash rules):
 *   Animated · Reanimated worklets · LayoutAnimation · Modal ·
 *   gesture-handler · BlurView · LinearGradient · Image ·
 *   ActivityIndicator (native, continuously animated).
 *
 * No animation anywhere. No shimmer, no pulse, no opacity fade-in.
 * First-paint is an explicit no-animation path — same mount/unmount
 * pattern as chunks 2/7/8. Only static rgba literals (no color-cycling).
 *
 * BLOCK GEOMETRY (must match BpsAccordion, verified 2026-07-21):
 *   BpsAccordion container: marginTop 20, gap 10 between cards
 *   sectionCard: borderWidth 1, borderRadius 8
 *   headerRow: paddingVertical 14 (× 2 = 28) + iconChip height 34
 *     → row content height 34, total header height with padding = 62
 *     → with 1px top+bottom border = 64px per block
 * PlanSkeleton mirrors those three numbers exactly (SKELETON_BLOCK_HEIGHT,
 * SKELETON_BLOCK_GAP, SKELETON_CONTAINER_MARGIN_TOP, SKELETON_RADIUS).
 * If BpsAccordion ever changes header padding or icon-chip height,
 * update these constants in lockstep or the first-paint jump will
 * come back.
 *
 * CHUNK 39 NOTE: BPS SectionCards are ~74px (iconChip 40 + 2×16 padding
 * + 2×1 border), not 64px. Real BPS content will land with a small
 * vertical jump on data arrival. Non-blocking for crash-fix; a BPS-tuned
 * variant / geometry bump is queued as a follow-up chunk.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

// Pixel-parity constants — see BLOCK GEOMETRY note above.
const SKELETON_CONTAINER_MARGIN_TOP = 20;
const SKELETON_BLOCK_HEIGHT = 64;
const SKELETON_BLOCK_GAP = 10;
const SKELETON_RADIUS = 8;

// Static rgba literal — no hex→rgba conversion at render, no
// Animated.Value driving opacity. slate-400 @ 25%.
const SKELETON_TINT = 'rgba(148,163,184,0.25)';
const SKELETON_TINT_DISABLED = 'rgba(148,163,184,0.15)';

export function PlanSkeleton(): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityLabel="Loading your plan"
      style={styles.skeletonContainer}
    >
      <View style={styles.skeletonBlock} />
      <View style={styles.skeletonBlock} />
      <View style={styles.skeletonBlock} />
    </View>
  );
}

export interface PlanErrorCardProps {
  onRetry: () => void;
  disabled?: boolean;
}

export function PlanErrorCard({
  onRetry,
  disabled = false,
}: PlanErrorCardProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  return (
    <View
      accessible
      accessibilityLabel="Could not load your plan"
      style={[
        styles.errorCard,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(16),
          fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
        }}
      >
        Couldn&apos;t load your plan
      </Text>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(13),
          marginTop: 6,
        }}
      >
        Check your connection and try again.
      </Text>
      <Pressable
        onPress={onRetry}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Retry loading plan"
        accessibilityState={{ disabled }}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        style={({ pressed }) => [
          styles.retryButton,
          {
            backgroundColor: disabled ? SKELETON_TINT_DISABLED : SKELETON_TINT,
            opacity: pressed && !disabled ? 0.8 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          }}
        >
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonContainer: {
    marginTop: SKELETON_CONTAINER_MARGIN_TOP,
    gap: SKELETON_BLOCK_GAP,
  },
  skeletonBlock: {
    height: SKELETON_BLOCK_HEIGHT,
    borderRadius: SKELETON_RADIUS,
    backgroundColor: SKELETON_TINT,
  },
  errorCard: {
    marginTop: SKELETON_CONTAINER_MARGIN_TOP,
    borderWidth: 1,
    borderRadius: SKELETON_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
});
