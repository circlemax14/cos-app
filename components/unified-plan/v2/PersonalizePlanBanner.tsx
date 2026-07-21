/**
 * PersonalizePlanBanner — CHUNK 35 (2026-07-21).
 *
 * Purely-presentational "Personalize your plan" CTA banner. Fires when a
 * non-Basic-tier user (advanced / agency-supported / agency-managed) has
 * NOT completed the assessments the backend requires before generating a
 * plan (SCRUM-254/526 — `assignments.canGenerate === false`). Tapping it
 * routes to /Home/assessments-catalog?source=plan-upgrade, exactly like
 * the legacy `assessmentBanner` block in app/Home/health-plan.tsx
 * (currently at lines 886-904 of that file). Copy is mirrored verbatim
 * from legacy so users see the same wording regardless of which surface
 * they land on during Hybrid Path A.
 *
 * Parent (PlanScreenV2) owns visibility. This component holds no state,
 * no timers, no storage. Same discipline as CachedPlanBanner (chunk 26),
 * PlanTierPill (chunk 33), and RegenerateButton (chunk 34).
 *
 * MUTUAL EXCLUSION: PersonalizePlanBanner and CachedPlanBanner both use
 * accent-left color stripes, so PlanScreenV2 renders at most one at a
 * time. Personalize wins because it's actionable while Cached is
 * informational — see PlanScreenV2 render gate comments.
 *
 * iOS 26.5 SAFE PRIMITIVES ONLY:
 *   View · Text · Pressable · MaterialIcons · StyleSheet
 * Explicitly avoided (all forbidden per crash rules):
 *   useState · useEffect · useRef · AsyncStorage · setTimeout · setInterval
 *   Animated · Reanimated worklets · LayoutAnimation · Modal ·
 *   gesture-handler · expo-symbols (Portal-crash source) · axios
 *
 * COLOR: reuses the same `colors.tint` teal accent as legacy so the two
 * surfaces are visually identical. Backdrop uses a "14" (~8% alpha) tint
 * over the tint color (same pattern as legacy line 891). The chunk-26
 * CachedPlanBanner uses amber; PersonalizePlanBanner uses teal — the two
 * accent surfaces are visually distinct even in the (rare) transient
 * window where both could theoretically render before the render gate
 * evaluates.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export interface PersonalizePlanBannerProps {
  onPress: () => void;
}

export function PersonalizePlanBanner({
  onPress,
}: PersonalizePlanBannerProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const tint = colors.tint as string;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Personalize your plan"
      accessibilityHint="Opens the check-ins catalog"
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: tint + '14',
          borderLeftColor: tint,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <MaterialIcons name="assignment" size={getScaledFontSize(20)} color={tint} />
      <View style={styles.textBlock}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          Personalize your plan
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 2,
          }}
        >
          Finish your health check-in so your AI plan reflects how you&apos;re actually doing.
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  textBlock: {
    flex: 1,
    marginLeft: 10,
  },
});
