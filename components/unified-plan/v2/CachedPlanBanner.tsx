/**
 * CachedPlanBanner — CHUNK 26 (2026-07-21).
 *
 * Purely-presentational "Couldn't refresh — showing your saved plan" banner
 * that appears above WellbeingMapCard when a background refetch fails BUT
 * we still have cached plan data to render. Symmetric complement to the
 * chunk-17 PlanErrorCard, which owns the no-cache case.
 *
 * Parent (PlanScreenV2) controls visibility by mount/unmount via a react-
 * query state gate — this component holds no state, no timers, no storage.
 *
 * iOS 26.5 SAFE PRIMITIVES ONLY:
 *   View · Text · Pressable · MaterialIcons · StyleSheet
 * Explicitly avoided (all forbidden per crash rules):
 *   useState · useEffect · useRef · AsyncStorage · setTimeout · setInterval
 *   Animated · Reanimated worklets · LayoutAnimation · Modal ·
 *   gesture-handler · axios
 *
 * COLOR: reuses FRESHNESS_COLORS.aging from chunk 18 (amber) so the banner
 * threads through the same visual grammar as the "aging" pill state. When
 * the plan is BOTH aging and its refetch just failed, two amber elements
 * stack — intentional "old AND we tried, sorry" story, not a bug.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { FRESHNESS_COLORS } from '@/lib/plan-time';

export interface CachedPlanBannerProps {
  onRetry: () => void;
  disabled: boolean;
}

export function CachedPlanBanner({
  onRetry,
  disabled,
}: CachedPlanBannerProps): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const scheme = settings.isDarkTheme ? 'dark' : 'light';
  const amber = FRESHNESS_COLORS.aging[scheme];

  // Belt-and-suspenders: RN Pressable can occasionally deliver a tap during
  // the ~1 frame between refetch start and isRefetching → true. Explicit
  // no-op inside onPress prevents a duplicate refetch on top of the
  // Pressable `disabled` prop. Same pattern as chunk 22's Skip guard.
  const handlePress = React.useCallback(() => {
    if (disabled) return;
    onRetry();
  }, [disabled, onRetry]);

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="Couldn't refresh, showing your saved plan"
      style={[
        styles.banner,
        {
          borderLeftColor: amber,
          backgroundColor: amber + '1A', // 10% alpha tint (chunk-24 pill pattern)
        },
      ]}
    >
      <MaterialIcons name="cloud-off" size={18} color={amber} />
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(500) as TextStyle['fontWeight'],
          color: colors.text,
        }}
      >
        Couldn&apos;t refresh — showing your saved plan
      </Text>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Retry loading your plan"
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.retry,
          {
            borderColor: amber,
            opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text
          style={{
            fontSize: getScaledFontSize(12),
            fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
            color: amber,
          }}
        >
          Retry
        </Text>
      </Pressable>
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
  retry: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
