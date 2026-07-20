/**
 * HideReadingsToggle (COS-475, Phase 6.4).
 *
 * Small pill in a bucket header that toggles per-section visibility of
 * the last-reading line on task/routine rows. Persists via
 * lib/plan-v2/hide-readings.ts.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Spacing } from '@/constants/design-system';

type ColorMap = Record<string, string | undefined>;

export function HideReadingsToggle({
  value,
  onChange,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}): React.JSX.Element {
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={value ? 'Show readings' : 'Hide readings'}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <MaterialIcons
        name={value ? 'visibility-off' : 'visibility'}
        size={getScaledFontSize(12)}
        color={subtext}
      />
      <Text
        style={{
          color: subtext,
          fontSize: getScaledFontSize(10),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          marginLeft: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        }}
      >
        {value ? 'Show readings' : 'Hide readings'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginRight: Spacing.sm,
  },
});
