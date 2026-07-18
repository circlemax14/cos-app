/**
 * Read-only task list for the unified BPS plan (COS-467, Phase 2).
 *
 * Clone of `components/health-plan/tasks/TaskListSection` intentionally
 * stripped of the "Add task" affordance + swipe-to-complete row press
 * (`onAddTask`/`onTaskPress` do not exist here). Phase 2 is preview-
 * only; editing lands in Phase 3.
 *
 * Each row displays a `<ProvenanceChip>` when the task did not
 * originate from BPS.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import type { UnifiedTask } from '@/services/api/unified-plan';

import { ProvenanceChip } from './ProvenanceChip';

type ColorMap = Record<string, string | undefined>;

export interface UnifiedTaskListProps {
  tasks: UnifiedTask[];
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
}

function taskSecondary(task: UnifiedTask): string | null {
  if (task.completionStyle === 'measurable' && task.metric?.name) {
    const parts = [task.metric.name];
    if (task.metric.unit) parts.push(task.metric.unit);
    return parts.join(' · ');
  }
  if (task.dueDate) return `Due ${task.dueDate}`;
  return task.description ?? null;
}

export function UnifiedTaskList({
  tasks,
  accentColor,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
}: UnifiedTaskListProps): React.JSX.Element {
  // Default CLOSED to keep first-paint view-tree small — parity with the
  // health-plan SectionCard COS-434 experiment #3 rationale.
  const [open, setOpen] = React.useState(false);
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  const text = colors.text ?? '#111827';
  const card = colors.card ?? '#FFFFFF';

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
          {tasks.length === 0 ? (
            <Text
              style={{
                color: subtext,
                fontSize: getScaledFontSize(12),
                textAlign: 'center',
                fontStyle: 'italic',
                lineHeight: 16,
              }}
            >
              No tasks yet in this section.
            </Text>
          ) : (
            tasks.map((task) => {
              const secondary = taskSecondary(task);
              return (
                <View
                  key={task.id}
                  style={[
                    styles.row,
                    { backgroundColor: card, borderColor: border },
                  ]}
                >
                  <MaterialIcons
                    name="check-box-outline-blank"
                    size={getScaledFontSize(16)}
                    color={accentColor}
                  />
                  <View style={styles.textCol}>
                    <Text
                      style={{
                        color: text,
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
                      }}
                      numberOfLines={2}
                    >
                      {task.title}
                    </Text>
                    {secondary ? (
                      <Text
                        style={{
                          color: subtext,
                          fontSize: getScaledFontSize(12),
                          marginTop: 1,
                        }}
                        numberOfLines={1}
                      >
                        {secondary}
                      </Text>
                    ) : null}
                    <View style={styles.chipRow}>
                      <ProvenanceChip
                        source={task.source}
                        ambiguous={task.ambiguous}
                        editedBy={task.editedBy}
                        sourceCategory={task.sourceCategory}
                        colors={colors}
                        getScaledFontSize={getScaledFontSize}
                        getScaledFontWeight={getScaledFontWeight}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm - 2,
  },
  textCol: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  chipRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
