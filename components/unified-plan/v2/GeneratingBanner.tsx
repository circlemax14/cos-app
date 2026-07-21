/**
 * GeneratingBanner — CHUNK 34 (2026-07-21).
 *
 * Passive amber hairline banner shown when the BE reports
 * `meta.refreshInFlight === true` but the local tap flag is false — i.e.
 * a regeneration was kicked off on ANOTHER device (or from the legacy
 * surface) and this device just observed it via the 60s poll wired in
 * hooks/use-unified-plan.ts (line 64-68).
 *
 * Mirrors the visual shape/tokens of CachedPlanBanner (chunk 26): amber
 * left-border, 10% tint fill, hairline. Different glyph ("autorenew") so
 * the two banners are distinguishable if a future BE bug ever co-fires
 * them (mathematically not co-truthy today — refreshInFlight requires a
 * successful GET while CachedPlanBanner requires isError && failureCount>0;
 * PlanScreenV2 also short-circuits the cached banner when this one is
 * showing, per chunk 34 concern #9).
 *
 * NO relative-time subline: UnifiedPlanMeta exposes `generatedAt` (last
 * successful completion) and `refreshInFlight` (bool) but NO current-job
 * start timestamp. Passing generatedAt as "started X ago" would lie at
 * the moment of tap. Follow-up: file a SCRUM story for BE to add
 * `meta.refreshInFlightStartedAt: string | null`, then re-add a
 * `formatRelative(startedAt)` subline here — same fallback shape BPS
 * already uses when jobStartedAt is missing.
 *
 * Parent controls visibility by mount/unmount. Component also accepts
 * a `visible` prop and early-returns null when false — belt-and-suspenders
 * so a future callsite that gates on state can pass visible={false} and
 * still get the safe no-op.
 *
 * iOS 26.5 SAFE PRIMITIVES ONLY:
 *   View · Text · MaterialIcons · StyleSheet
 * Explicitly avoided (all forbidden per crash rules):
 *   useState · useEffect · useRef · AsyncStorage · setTimeout · setInterval
 *   Animated · Reanimated worklets · LayoutAnimation · Modal ·
 *   gesture-handler · expo-symbols · axios · Pressable (passive banner,
 *   no user action)
 */

import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { FRESHNESS_COLORS } from '@/lib/plan-time';

export interface GeneratingBannerProps {
  visible: boolean;
}

export function GeneratingBanner({ visible }: GeneratingBannerProps): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const scheme = settings.isDarkTheme ? 'dark' : 'light';
  const amber = FRESHNESS_COLORS.aging[scheme];

  // Belt-and-suspenders — parent already gates by mount/unmount, but if
  // a future callsite flips visibility via state, we still no-op safely.
  if (!visible) return null;

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="A plan generation is already in progress. Pull down to refresh once it's done."
      style={[
        styles.banner,
        {
          borderLeftColor: amber,
          backgroundColor: amber + '1A', // 10% alpha tint (matches CachedPlanBanner)
        },
      ]}
    >
      <MaterialIcons name="autorenew" size={18} color={amber} />
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(500) as TextStyle['fontWeight'],
          color: colors.text,
        }}
      >
        A generation is already in progress. Pull down to refresh once it&apos;s done.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
});
