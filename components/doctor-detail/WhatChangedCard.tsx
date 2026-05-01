/**
 * WhatChangedCard — top-of-tab AI deltas pill. Replaces the old "Summary"
 * card. Renders the AI insight summary as a tinted callout (gradient
 * approximation via two stacked tints — keeps RN simple). The backend
 * prompt change to emit deltas instead of paragraph prose ships on a
 * separate cos-backend ticket; this component renders whatever copy the
 * API returns either way.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface ThemeColors {
  text: string;
  subtext: string;
  primary: string;
}

interface WhatChangedCardProps {
  state: { summary: string; loading: boolean; empty: boolean } | undefined;
  colors: ThemeColors;
  getScaledFontSize: (size: number) => number;
  getScaledFontWeight: (weight: number) => string | number;
}

export function WhatChangedCard({
  state,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: WhatChangedCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialIcons
          name="auto-awesome"
          size={getScaledFontSize(14)}
          color="#6D28D9"
        />
        <Text
          style={{
            color: '#6D28D9',
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(700) as any,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          What changed
        </Text>
      </View>

      {!state || state.loading ? (
        <View style={styles.bodyLoadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(13) }}>
            Reading your records…
          </Text>
        </View>
      ) : (
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(13),
            lineHeight: getScaledFontSize(20),
            marginTop: 6,
          }}
        >
          {state.summary}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Approximation of the linear-gradient(135deg,#EEF2FF,#FDF2F8) from the
    // wireframe — RN core has no gradient primitive; a single soft tint is
    // visually close enough and avoids pulling in expo-linear-gradient.
    backgroundColor: '#F3F0FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bodyLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
});
