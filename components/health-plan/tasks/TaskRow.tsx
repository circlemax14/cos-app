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
  const secondary =
    isMeasurable && task.metric?.name
      ? task.metric.name + (task.metric.unit ? ` · ${task.metric.unit}` : '')
      : task.scheduledTime; // HH:MM 24h — keep as-is for compactness
  const iconName = TYPE_ICON[task.type] ?? 'notifications';

  return (
    <Pressable
      onPress={() => onPress(task)}
      accessibilityRole="button"
      accessibilityLabel={`Task: ${task.title}, ${isMeasurable ? 'measurable' : 'simple'}`}
      style={[
        styles.row,
        { borderColor: colors.border, backgroundColor: colors.card ?? '#FFFFFF' },
      ]}
    >
      <MaterialIcons name={iconName} size={getScaledFontSize(16)} color={accentColor} />
      <View style={styles.textCol}>
        <Text
          style={{
            color: colors.text,
            fontSize: getScaledFontSize(14),
            fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
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
