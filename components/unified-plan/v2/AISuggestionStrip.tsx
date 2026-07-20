/**
 * AISuggestionStrip (COS-475, Phase 6.4).
 *
 * Horizontal scroller of AISuggestionChips. Auto-hides when the derived
 * items list is empty. Header row includes a "Dismiss all" affordance
 * that snoozes every currently-visible id for 7 days.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Spacing } from '@/constants/design-system';
import type { AISuggestion } from '@/lib/plan-v2/ai-suggestions';

import { AISuggestionChip } from './AISuggestionChip';

type ColorMap = Record<string, string | undefined>;

export interface AISuggestionStripProps {
  items: AISuggestion[];
  onDismissAll: () => void;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

export function AISuggestionStrip({
  items,
  onDismissAll,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: AISuggestionStripProps): React.JSX.Element | null {
  if (!items || items.length === 0) return null;
  const subtext = colors.subtext ?? '#6B7280';
  return (
    <View style={styles.wrap} testID="plan-v2-suggestion-strip">
      <View style={styles.headerRow}>
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            flex: 1,
          }}
        >
          Suggestions from your plan · {items.length}
        </Text>
        <Pressable
          onPress={onDismissAll}
          accessibilityRole="button"
          accessibilityLabel="Dismiss all suggestions"
          hitSlop={8}
          style={styles.dismissBtn}
        >
          <MaterialIcons name="close" size={getScaledFontSize(14)} color={subtext} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.md }}
      >
        {items.map((s) => (
          <AISuggestionChip
            key={s.id}
            suggestion={s}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: 6,
  },
  dismissBtn: {
    padding: 2,
  },
});
