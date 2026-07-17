/**
 * Read-only goal row for the unified BPS plan (COS-467, Phase 2).
 *
 * Slim, non-pressable presentation only — deliberately does NOT reuse
 * `BioGoalCard`, which owns edit affordances that belong to Phase 3.
 * Renders a `<ProvenanceChip>` at the end whenever the goal did not
 * originate from the BPS record.
 */

import React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Radii, Spacing } from '@/constants/design-system';
import type { UnifiedGoal } from '@/services/api/unified-plan';

import { ProvenanceChip } from './ProvenanceChip';

type ColorMap = Record<string, string | undefined>;

export interface UnifiedGoalRowProps {
  goal: UnifiedGoal;
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function alpha(hex: string, hh: string): string {
  return hex.length === 7 && hex.startsWith('#') ? hex + hh : hex;
}

function metricLine(goal: UnifiedGoal): string | null {
  const parts: string[] = [];
  if (goal.metric) parts.push(goal.metric);
  if (goal.baseline || goal.target) {
    parts.push(
      `${goal.baseline ?? '—'} → ${goal.target ?? '—'}`,
    );
  }
  if (goal.timeframe) parts.push(goal.timeframe);
  return parts.length ? parts.join(' · ') : null;
}

export function UnifiedGoalRow({
  goal,
  accentColor,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: UnifiedGoalRowProps): React.JSX.Element {
  const secondary = metricLine(goal);
  const text = colors.text ?? '#111827';
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  const card = colors.card ?? '#FFFFFF';

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: card,
          borderColor: border,
        },
      ]}
    >
      <View style={[styles.rail, { backgroundColor: alpha(accentColor, 'CC') }]} />
      <View style={styles.body}>
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          }}
          numberOfLines={3}
        >
          {goal.title}
        </Text>
        {!!goal.description && (
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(12),
              marginTop: 2,
              lineHeight: 16,
            }}
            numberOfLines={4}
          >
            {goal.description}
          </Text>
        )}
        {secondary ? (
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(11),
              marginTop: 4,
              letterSpacing: 0.2,
            }}
            numberOfLines={1}
          >
            {secondary}
          </Text>
        ) : null}
        <View style={styles.chipRow}>
          <ProvenanceChip
            source={goal.source}
            ambiguous={goal.ambiguous}
            editedBy={goal.editedBy}
            sourceCategory={goal.sourceCategory}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm - 2,
    alignItems: 'stretch',
  },
  rail: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  body: {
    flex: 1,
    marginLeft: Spacing.sm + 2,
  },
  chipRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
