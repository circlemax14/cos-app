/**
 * WellbeingMapCard (COS-475, Phase 6.4).
 *
 * Direct visual port of BiopsychosocialPlanScreen's mapCard pattern
 * (lines 521-577) — Radii.xl card + tinted 14/33 backgrounds, 40x40
 * hub-icon chip Radii.md with tint+'22', title 15pt/700, subtitle,
 * chevron-right trailer. Guards Ken-visible drift.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Radii, Spacing } from '@/constants/design-system';

type ColorMap = Record<string, string | undefined>;

export interface WellbeingMapCardProps {
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

export function WellbeingMapCard({
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: WellbeingMapCardProps): React.JSX.Element {
  const tint = (colors.tint as string) ?? '#008080';
  return (
    <Pressable
      onPress={() => router.push('/Home/wellbeing-map' as never)}
      accessibilityRole="button"
      accessibilityLabel="Open your Wellbeing map"
      accessibilityHint="Shows how your goals cluster across the NovoPsych model"
      style={({ pressed }) => [
        styles.mapCard,
        {
          backgroundColor: tint + '14',
          borderColor: tint + '33',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      testID="plan-v2-wellbeing-map-card"
    >
      <View style={[styles.mapIconChip, { backgroundColor: tint + '22' }]}>
        <MaterialIcons name="hub" size={getScaledFontSize(22)} color={tint} />
      </View>
      <View style={{ flex: 1, marginLeft: Spacing.md - 4 }}>
        <Text
          style={{
            color: colors.text ?? '#111827',
            fontSize: getScaledFontSize(15),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
        >
          Your Wellbeing map
        </Text>
        <Text
          style={{
            color: colors.subtext ?? '#6B7280',
            fontSize: getScaledFontSize(12),
            marginTop: 2,
            lineHeight: 17,
          }}
        >
          See how your goals cluster across body, mind, and social wellbeing — and which areas may need attention.
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={getScaledFontSize(22)} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  mapIconChip: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
