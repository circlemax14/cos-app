import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import type { PlanTask } from '@/services/api/types';

import { TaskRow } from './TaskRow';

type ColorMap = Record<string, string>;

export interface TaskListSectionProps {
  tasks: PlanTask[];
  /** BPS section accent — SectionCard passes SECTION_STYLE[sectionKey].color */
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  /** Opens TaskEditorModal in create mode with defaultCategory for this section. */
  onAddTask: () => void;
  /** Opens TaskDetailModal for the tapped task. */
  onTaskPress: (task: PlanTask) => void;
}

export function TaskListSection({
  tasks,
  accentColor,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onAddTask,
  onTaskPress,
}: TaskListSectionProps): React.JSX.Element {
  // COS-434 experiment #3: default CLOSED to keep first-paint view-tree small,
  // matches bullets/interventions/goals CollapsibleGroups in SectionCard.
  const [open, setOpen] = React.useState(false);
  const subtext = colors.subtext;
  const border = colors.border;
  const count = tasks.length;
  const label = count ? `Tasks (${count})` : 'Tasks';

  return (
    <View style={[styles.group, { borderTopColor: border }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${open ? 'expanded' : 'collapsed'}`}
        accessibilityHint="Double tap to toggle this section"
        style={styles.header}
        hitSlop={6}
      >
        <MaterialIcons name="task-alt" size={getScaledFontSize(14)} color={subtext} />
        <Text
          style={{
            color: subtext,
            fontSize: getScaledFontSize(11),
            fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
            marginLeft: 6,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            flex: 1,
          }}
        >
          {label}
        </Text>
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={getScaledFontSize(20)}
          color={subtext}
        />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              accentColor={accentColor}
              colors={colors}
              getScaledFontSize={getScaledFontSize}
              getScaledFontWeight={getScaledFontWeight}
              onPress={onTaskPress}
            />
          ))}
          {tasks.length === 0 ? (
            <Text
              style={[
                styles.emptyHint,
                {
                  color: subtext,
                  fontSize: getScaledFontSize(12),
                },
              ]}
            >
              No tasks yet — add one below to track a habit or measurement.
            </Text>
          ) : null}
          <Pressable
            onPress={onAddTask}
            accessibilityRole="button"
            accessibilityLabel="Add a task to this section"
            style={({ pressed }) => [
              styles.addBtn,
              { borderColor: accentColor + '55', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialIcons name="add" size={getScaledFontSize(16)} color={accentColor} />
            <Text
              style={{
                color: accentColor,
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                marginLeft: 4,
              }}
            >
              Add task
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  body: {
    marginTop: Spacing.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: Radii.md,
    borderStyle: 'dashed',
    marginTop: Spacing.sm - 2,
  },
  emptyHint: {
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 16,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm - 2,
  },
});
