/**
 * TasksBucket (COS-475, Phase 6.4).
 *
 * Collapsible group inside a BPS section panel — shows today's tasks
 * for the section. Empty state is a dashed CTA prompt.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import type { UnifiedTask } from '@/services/api/unified-plan';

import { CollapsibleGroup } from '../CollapsibleGroup';
import { SwipeableTaskRow } from './SwipeableTaskRow';

type ColorMap = Record<string, string | undefined>;

export interface TasksBucketProps {
  tasks: UnifiedTask[];
  scheduledFor: string;
  accentColor: string;
  offline: boolean;
  hideReadings: boolean;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onToast?: (message: string) => void;
  onRefetch?: () => void;
}

export function TasksBucket({
  tasks,
  scheduledFor,
  accentColor,
  offline,
  hideReadings,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onToast,
  onRefetch,
}: TasksBucketProps): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const [locallySkipped, setLocallySkipped] = useState<Set<string>>(new Set());

  const visible = tasks.filter((t) => !locallySkipped.has(t.id));

  return (
    <CollapsibleGroup
      label="Today's tasks"
      icon="task-alt"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      colors={colors}
      getScaledFontSize={getScaledFontSize}
      getScaledFontWeight={getScaledFontWeight}
      count={visible.length}
    >
      {visible.length === 0 ? (
        <View
          style={[
            styles.empty,
            {
              borderColor: accentColor + '55',
              backgroundColor: accentColor + '10',
            },
          ]}
        >
          <MaterialIcons name="task-alt" size={getScaledFontSize(14)} color={accentColor} />
          <Text
            style={{
              color: accentColor,
              fontSize: getScaledFontSize(12),
              fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              marginLeft: 6,
              flex: 1,
            }}
          >
            No tasks in this area today
          </Text>
        </View>
      ) : (
        visible.map((task) => (
          <SwipeableTaskRow
            key={task.id}
            task={task}
            scheduledFor={scheduledFor}
            accentColor={accentColor}
            offline={offline}
            hideReadings={hideReadings}
            colors={colors}
            getScaledFontSize={getScaledFontSize}
            getScaledFontWeight={getScaledFontWeight}
            onOptimisticSkip={(id) => {
              setLocallySkipped((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
              });
            }}
            onRevertSkip={(id) => {
              setLocallySkipped((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }}
            onToast={onToast}
            onRefetch={onRefetch}
          />
        ))
      )}
    </CollapsibleGroup>
  );
}

// Kept for visual parity with UnifiedGoalRow's dashed empty state
// (feature: unused import cleanup guard).
export const __TasksBucketPressable = Pressable;

const styles = StyleSheet.create({
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm + 2,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
