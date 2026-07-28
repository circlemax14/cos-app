/**
 * Read-only intervention/support/recommendation/resource row for the
 * unified BPS plan (COS-467). Optional URL opens via Linking.
 */

import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import type { UnifiedIntervention } from '@/services/api/unified-plan';

type ColorMap = Record<string, string | undefined>;

const KIND_ICON: Record<UnifiedIntervention['kind'], keyof typeof MaterialIcons.glyphMap> = {
  intervention: 'medical-services',
  support: 'volunteer-activism',
  recommendation: 'lightbulb-outline',
  resource: 'menu-book',
};

export interface UnifiedInterventionRowProps {
  item: UnifiedIntervention;
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

export function UnifiedInterventionRow({
  item,
  accentColor,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: UnifiedInterventionRowProps): React.JSX.Element {
  const text = colors.text ?? '#111827';
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  const card = colors.card ?? '#FFFFFF';
  const tint = colors.tint ?? accentColor;
  const hasLink = !!item.link;

  const openLink = React.useCallback(() => {
    if (item.link) {
      Linking.openURL(item.link).catch(() => {
        /* ignore — a dead link shouldn't crash the plan screen */
      });
    }
  }, [item.link]);

  return (
    <Pressable
      onPress={hasLink ? openLink : undefined}
      disabled={!hasLink}
      accessibilityRole={hasLink ? 'link' : 'text'}
      accessibilityLabel={hasLink ? `${item.title}. Opens a link.` : item.title}
      style={[styles.row, { backgroundColor: card, borderColor: border }]}
    >
      <View style={[styles.rail, { backgroundColor: accentColor }]} />
      <MaterialIcons
        name={KIND_ICON[item.kind]}
        size={getScaledFontSize(16)}
        color={accentColor}
        style={{ marginLeft: Spacing.sm }}
      />
      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        {!!item.description && (
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(12),
              marginTop: 2,
              lineHeight: 16,
            }}
            numberOfLines={4}
          >
            {item.description}
          </Text>
        )}
      </View>
      {hasLink && (
        <MaterialIcons
          name="open-in-new"
          size={getScaledFontSize(16)}
          color={tint}
          style={{ marginLeft: Spacing.sm }}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm - 2,
  },
  rail: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
});
