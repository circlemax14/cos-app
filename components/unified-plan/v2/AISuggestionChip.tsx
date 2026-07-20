/**
 * AISuggestionChip (COS-475, Phase 6.4).
 *
 * A single suggestion card inside the horizontal AISuggestionStrip.
 * Two actions: primary "Add to my plan" pill (routes to the routine
 * editor with prefill), and an overflow menu that opens a small sheet
 * with Snooze/Dismiss options.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Radii, Spacing } from '@/constants/design-system';
import { sectionKeyToPrimaryDomain } from '@/lib/plan-v2/section-config';
import type { AISuggestion } from '@/lib/plan-v2/ai-suggestions';

type ColorMap = Record<string, string | undefined>;

export interface AISuggestionChipProps {
  suggestion: AISuggestion;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

export function AISuggestionChip({
  suggestion,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: AISuggestionChipProps): React.JSX.Element {
  const tint = (colors.tint as string) ?? '#008080';
  const text = colors.text ?? '#111827';
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  const card = colors.card ?? '#FFFFFF';

  const onAdd = () => {
    const bpsDomain = sectionKeyToPrimaryDomain(suggestion.sectionKey);
    router.push({
      pathname: '/Home/(plan)/routine-editor' as never,
      params: {
        prefillTitle: suggestion.title,
        bpsDomain,
        suggestionId: suggestion.id,
      },
    } as never);
  };

  const onOverflow = () => {
    router.push({
      pathname: '/Home/(plan)/suggestion-actions' as never,
      params: { id: suggestion.id },
    } as never);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: card, borderColor: border },
      ]}
      accessibilityLabel={`Suggestion: ${suggestion.title}`}
      testID={`plan-v2-suggestion-${suggestion.id}`}
    >
      <View style={styles.headerRow}>
        <MaterialIcons name="auto-awesome" size={getScaledFontSize(14)} color={tint} />
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(10),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            marginLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            flex: 1,
          }}
        >
          Suggestion
        </Text>
        <Pressable
          onPress={onOverflow}
          accessibilityRole="button"
          accessibilityLabel="More actions"
          hitSlop={8}
        >
          <MaterialIcons name="more-horiz" size={getScaledFontSize(16)} color={subtext} />
        </Pressable>
      </View>
      <Text
        style={{
          color: text,
          fontSize: getScaledFontSize(13),
          fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
          marginTop: 4,
          lineHeight: 18,
        }}
        numberOfLines={2}
      >
        {suggestion.title}
      </Text>
      <View style={styles.footerRow}>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add to my plan"
          style={({ pressed }) => [
            styles.addPill,
            { backgroundColor: tint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: getScaledFontSize(11),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            }}
          >
            Add to my plan
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 220,
    maxWidth: 260,
    padding: Spacing.md - 2,
    borderRadius: Radii.lg,
    borderWidth: 1,
    marginRight: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerRow: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
});
