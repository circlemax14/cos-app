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
  /**
   * Bump to force the accordion open.
   *
   * Vishal 2026-08-11: adding a nutrition suggestion said "added to your plan"
   * and nothing visibly moved, because tasks default to COLLAPSED. The parent
   * increments this after a task is created so the patient is shown where it
   * landed instead of being told.
   *
   * A counter, not a boolean: two adds in a row must both re-open a section
   * the patient may have collapsed in between.
   */
  openSignal?: number;
  /** Task to flash briefly so the eye lands on the new row. */
  highlightTaskId?: string | null;
  /**
   * Ref callback for the highlighted row's wrapper.
   *
   * The parent owns the ScrollView, so it measures this node against the
   * scroll content and scrolls to the ROW. Scrolling to the section instead
   * lands on the section header with the task still below the fold — which
   * is exactly what Vishal reported ("i was scrolled to beginning of task").
   */
  onHighlightRef?: (node: View | null) => void;
}

export function TaskListSection({
  tasks,
  accentColor,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onAddTask,
  onTaskPress,
  openSignal,
  highlightTaskId,
  onHighlightRef,
}: TaskListSectionProps): React.JSX.Element {
  // COS-434 experiment #3: default CLOSED to keep first-paint view-tree small,
  // matches bullets/interventions/goals CollapsibleGroups in SectionCard.
  const [open, setOpen] = React.useState(false);

  // Open on every bump. Deliberately one-way: it never force-CLOSES, so the
  // patient's own toggle is only ever overridden in the direction that
  // reveals something.
  const lastSignal = React.useRef(openSignal);
  React.useEffect(() => {
    if (openSignal !== undefined && openSignal !== lastSignal.current) {
      lastSignal.current = openSignal;
      setOpen(true);
    }
  }, [openSignal]);
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
            /* Wrapper, not a TaskRow prop: the highlight is a transient
               attention cue owned by this list, and TaskRow stays a pure
               presentation of a task. */
            <View
              key={t.id}
              ref={highlightTaskId && t.id === highlightTaskId ? onHighlightRef : undefined}
              style={
                highlightTaskId && t.id === highlightTaskId
                  ? [styles.highlight, { borderColor: accentColor, backgroundColor: `${accentColor}1F` }]
                  : undefined
              }
            >
              <TaskRow
                task={t}
                accentColor={accentColor}
                colors={colors}
                getScaledFontSize={getScaledFontSize}
                getScaledFontWeight={getScaledFontWeight}
                onPress={onTaskPress}
              />
            </View>
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
  // Transient cue after a task is added. A tinted well + accent border rather
  // than an animation — the iOS 26.5 envelope on this screen excludes
  // Animated, and a static flash cleared on a timer reads just as clearly.
  highlight: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 4,
    marginVertical: 2,
  },
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
