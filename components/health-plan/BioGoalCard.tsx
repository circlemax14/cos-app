/**
 * BioGoalCard (COS-435, experiment #8) — minimal goal card for the
 * Biopsychosocial Care Plan's GOALS group, cut down for the iOS 26.5
 * EXUpdates crash investigation (see project_ios26_biopsychosocial_parked.md
 * and SectionCard.tsx's own COS-434 experiment #3 comment).
 *
 * SAME prop signature as the legacy `GoalCard` export in
 * `PlanScreenRedesignedV2.tsx` — this is a pure symbol swap at the
 * `SectionCard.tsx` call site, trivially revertible by pointing the import
 * back at `GoalCard`.
 *
 * Deliberately DROPS, relative to legacy `GoalCard`:
 *   - the priority-tinted left rail (goalRail View)
 *   - the priority dot + flag icon (goalDot View + MaterialIcons 'flag')
 *   - the priority chip (High/Med/Low badge)
 *   - formatGoalPlain's progress-percent one-liner
 *   - the progress bar (progressRow/progressTrack/progressFill) + % label
 *   - the trend line (arrow + trendColor)
 *
 * KEEPS: title, description, a target+timeframe line (via the existing pure
 * `formatGoalMeasure` helper — no g.progress dependency), the unmodified
 * `SubdomainChipRow` (left as the one deliberately-unchanged variable for
 * experiment #9), and the Edit button (same onEdit callback + a11y label
 * pattern as legacy).
 *
 * Category-tint continuity is preserved via `borderLeftColor` on the outer
 * card View instead of a separate rail child View — one fewer primitive.
 *
 * Same primitives as legacy (Text, View, TouchableOpacity, MaterialIcons) —
 * no new packages, no reanimated, no Modal.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { SubdomainChipRow } from './SubdomainChip';
import { formatGoalMeasure } from '@/lib/care-plan';
import type { AiPlanGoal } from '@/services/api/types';
import { Radii, Spacing } from '@/constants/design-system';

type ColorMap = Record<string, string>;

export function BioGoalCard(props: {
  goal: AiPlanGoal;
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onEdit: (g: AiPlanGoal) => void;
}) {
  const { goal: g, accentColor, colors, getScaledFontSize, getScaledFontWeight, onEdit } = props;
  const text = colors.text;
  const subtext = colors.subtext;
  const border = colors.border;
  const card = colors.card ?? '#FFFFFF';
  const tint = colors.tint;

  const measure = formatGoalMeasure(g);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: card, borderColor: border, borderLeftColor: accentColor },
      ]}
    >
      <Text
        style={{
          color: text,
          fontSize: getScaledFontSize(17),
          fontWeight: getScaledFontWeight(700) as any,
          lineHeight: 22,
        }}
      >
        {g.title}
      </Text>

      {!!g.description && (
        <Text style={{ color: subtext, fontSize: getScaledFontSize(14), lineHeight: 20, marginTop: Spacing.sm - 2 }}>
          {g.description}
        </Text>
      )}

      {!!measure && (
        <Text
          style={{
            color: text,
            fontSize: getScaledFontSize(13),
            fontWeight: getScaledFontWeight(600) as any,
            marginTop: Spacing.sm - 2,
          }}
        >
          {measure}
        </Text>
      )}

      <SubdomainChipRow
        subdomainKeys={g.subdomains}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => onEdit(g)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Edit goal: ${g.title}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.editBtn, { borderColor: border }]}
        >
          <MaterialIcons name="edit" size={getScaledFontSize(15)} color={tint} />
          <Text
            style={{
              color: tint,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(700) as any,
              marginLeft: 5,
            }}
          >
            Edit
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: Radii.lg,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: 1,
    minHeight: 44,
  },
});
