/**
 * OfflineBanner (COS-475, Phase 6.4).
 *
 * Thin 36px top banner shown when useOfflineStatus reports offline.
 * Non-dismissable — the swipe-action guard depends on the user seeing
 * *why* their gestures are paused.
 */

import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Spacing } from '@/constants/design-system';

type ColorMap = Record<string, string | undefined>;

export function OfflineBanner({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}): React.JSX.Element {
  const warn = (colors.warning as string) ?? '#B45309';
  const bg = warn + '1F';
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="You're offline — swipe actions are paused"
      style={[styles.banner, { backgroundColor: bg, borderColor: warn + '55' }]}
      testID="plan-v2-offline-banner"
    >
      <MaterialIcons name="cloud-off" size={getScaledFontSize(14)} color={warn} />
      <Text
        style={{
          color: warn,
          fontSize: getScaledFontSize(12),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          marginLeft: 6,
          flex: 1,
        }}
        numberOfLines={2}
      >
        You&apos;re offline — swipe actions are paused. Your plan is still readable.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
