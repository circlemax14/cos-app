/**
 * CollapsibleGroup — extracted from UnifiedSectionCard so v2 buckets
 * (TasksBucket, RoutinesBucket) can reuse the same expand/collapse shell
 * without duplicating markup or duplicating a11y contract.
 *
 * COS-475, Phase 6.4. Behavior byte-for-byte identical to the previous
 * inline helper.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Spacing } from '@/constants/design-system';

type ColorMap = Record<string, string | undefined>;

export interface CollapsibleGroupProps {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  open: boolean;
  onToggle: () => void;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  children: React.ReactNode;
  /** Optional trailing element rendered inside the header row. */
  headerRight?: React.ReactNode;
  /** Optional count pill shown next to the label. */
  count?: number;
}

export function CollapsibleGroup({
  label,
  icon,
  open,
  onToggle,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  children,
  headerRight,
  count,
}: CollapsibleGroupProps): React.JSX.Element {
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  return (
    <View style={[styles.collapsible, { borderTopColor: border }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${open ? 'expanded' : 'collapsed'}`}
        accessibilityHint="Double tap to toggle this section"
        style={styles.collapsibleHeader}
        hitSlop={6}
      >
        <MaterialIcons name={icon} size={getScaledFontSize(14)} color={subtext} />
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
            marginLeft: 6,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {label}
        </Text>
        {typeof count === 'number' && count > 0 ? (
          <View style={[styles.countPill, { backgroundColor: (colors.border ?? '#D1D5DB') + '55' }]}>
            <Text
              style={{
                color: subtext,
                fontSize: getScaledFontSize(10),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              {count}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {headerRight ? <View style={{ marginRight: Spacing.sm }}>{headerRight}</View> : null}
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={getScaledFontSize(20)}
          color={subtext}
        />
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsible: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm + 2,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  collapsibleBody: {
    marginTop: Spacing.sm,
  },
  countPill: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
