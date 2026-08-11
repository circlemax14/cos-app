import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import type { PlanTask, TaskType } from '@/services/api/types';

type ColorMap = Record<string, string>;

const TYPE_ICON: Record<TaskType, keyof typeof MaterialIcons.glyphMap> = {
  medication: 'medication',
  exercise: 'directions-walk',
  appointment: 'event',
  reminder: 'notifications',
};

export interface TaskRowProps {
  task: PlanTask;
  /** BPS section accent — passed by SectionCard from SECTION_STYLE[sectionKey].color */
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onPress: (task: PlanTask) => void;
}

export function TaskRow({
  task,
  accentColor,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onPress,
}: TaskRowProps): React.JSX.Element {
  // completionStyle is optional on PlanTask (Chunk 1c back-compat) — undefined defaults to 'simple'.
  const isMeasurable = task.completionStyle === 'measurable';
  const neutral = colors.subtext ?? '#6B7280';
  const badgeBg = isMeasurable ? accentColor + '22' : neutral + '18';
  const badgeColor = isMeasurable ? accentColor : neutral;
  const secondaryBase =
    isMeasurable && task.metric?.name
      ? task.metric.name + (task.metric.unit ? ` · ${task.metric.unit}` : '')
      : task.scheduledTime; // HH:MM 24h — keep as-is for compactness
  const iconName = TYPE_ICON[task.type] ?? 'notifications';

  /**
   * Mid-flight state, set by the optimistic create/delete mutations.
   *
   * Vishal 2026-08-11: "add task directly with a loader ... delete: cross it
   * with a loader". Static icon + dimming rather than ActivityIndicator —
   * BiopsychosocialPlanScreen records that ActivityIndicator was scrubbed
   * from these surfaces for iOS 26.5 (chunk 46.1) and the sanctioned pending
   * affordance is a static one. Dim + strike-through carries the meaning
   * without a native animated view.
   */
  const creating = task.__optimistic === 'creating';
  const deleting = task.__optimistic === 'deleting';
  const busy = creating || deleting;
  // Say what is happening in words too — the dim + icon alone is ambiguous
  // about WHICH direction the row is moving.
  const secondary = creating ? 'Adding…' : deleting ? 'Removing…' : secondaryBase;

  return (
    <Pressable
      // A row that is still being written must not be openable — editing a
      // task the server has not acknowledged would race the write.
      onPress={busy ? undefined : () => onPress(task)}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      accessibilityLabel={
        creating
          ? `Adding task: ${task.title}`
          : deleting
            ? `Removing task: ${task.title}`
            : `Task: ${task.title}, ${isMeasurable ? 'measurable' : 'simple'}`
      }
      style={[
        styles.row,
        { borderColor: colors.border, backgroundColor: colors.card ?? '#FFFFFF' },
        busy ? styles.busy : null,
      ]}
    >
      <MaterialIcons
        name={creating ? 'sync' : deleting ? 'hourglass-empty' : iconName}
        size={getScaledFontSize(16)}
        color={busy ? (colors.subtext ?? '#6B7280') : accentColor}
      />
      <View style={styles.textCol}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            // "cross it ... and then remove it properly" — the row stays put,
            // struck through, until the server confirms.
            ...(deleting ? { textDecorationLine: 'line-through' as const } : {}),
          }}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(12),
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {secondary}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: badgeBg }]}>
        <Text
          style={{
            color: badgeColor,
            fontSize: getScaledFontSize(10),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {isMeasurable ? 'Measurable' : 'Simple'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Sanctioned pending affordance on this screen: opacity, not a spinner.
  busy: { opacity: 0.55 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm - 2,
  },
  textCol: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginLeft: Spacing.sm,
  },
});
