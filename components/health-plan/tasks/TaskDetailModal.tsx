/**
 * TaskDetailModal (COS-450 / SCRUM-588, Chunk 1c FE).
 *
 * Bottom-sheet Modal showing a single task's details. Header (title + close),
 * body (description + Simple/Measurable + category badges). For measurable
 * tasks, embeds MeasurementLogInput + MeasurementHistoryList. Footer with
 * Delete (confirm Alert → useDeletePlanTask) and Edit (fires onEdit(task)
 * so the parent screen can swap in TaskEditorModal with initialTask).
 *
 * Simple-task completion toggle is intentionally omitted this pass — Ken PDF
 * v7.2 § 18 leaves 'mark done today' to a follow-up; the spec's fallback
 * ("skip completion for now, just show details + Edit + Delete") ships here.
 */

import React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Radii, Spacing } from '@/constants/design-system';
import { useDeletePlanTask } from '@/hooks/use-plan-tasks';
import type { PlanTask } from '@/services/api/types';

import { MeasurementLogInput } from './MeasurementLogInput';
import { MeasurementHistoryList } from './MeasurementHistoryList';

type ColorMap = Record<string, string>;

export interface TaskDetailModalProps {
  visible: boolean;
  onClose: () => void;
  /** null when nothing selected — modal renders null. */
  task: PlanTask | null;
  /** BPS section accent for badge + primary action. */
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
  /** Parent swaps in TaskEditorModal with initialTask=task. */
  onEdit: (task: PlanTask) => void;
  onDeleted?: (task: PlanTask) => void;
}

export function TaskDetailModal(props: TaskDetailModalProps): React.JSX.Element | null {
  const {
    visible,
    onClose,
    task,
    accentColor,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    onEdit,
    onDeleted,
  } = props;

  // Local mirror lets a fresh log-measurement response update the history
  // list without waiting on the plan-refetch round-trip. MeasurementLogInput
  // fires onLogged(updated) with the full PlanTask returned by the endpoint.
  const [localTask, setLocalTask] = React.useState<PlanTask | null>(task);
  React.useEffect(() => {
    setLocalTask(task);
  }, [task]);

  const deleteMut = useDeletePlanTask();

  if (!visible || !localTask) return null;

  const isMeasurable = localTask.completionStyle === 'measurable';
  const measurements = Array.isArray(localTask.measurements) ? localTask.measurements : [];
  const subtextColor = colors.subtext ?? '#6B7280';

  const confirmDelete = (): void => {
    Alert.alert(
      'Delete task?',
      `"${localTask.title}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMut.mutateAsync(localTask.id);
              onDeleted?.(localTask);
              onClose();
            } catch {
              Alert.alert('Delete failed', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
          keyboardVerticalOffset={0}
          pointerEvents="box-none"
        >
        <View style={[styles.sheet, { backgroundColor: colors.card ?? colors.background }]}>
          <View style={styles.header}>
            <Text
              style={{
                color: colors.text,
                fontSize: getScaledFontSize(17),
                fontWeight: getScaledFontWeight(700) as '700',
                flex: 1,
              }}
              numberOfLines={2}
            >
              {localTask.title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close task details"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={22} color={subtextColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 12 }}>
            {!!localTask.description && (
              <Text
                style={{
                  color: subtextColor,
                  fontSize: getScaledFontSize(13),
                  lineHeight: 19,
                  marginBottom: Spacing.md,
                }}
              >
                {localTask.description}
              </Text>
            )}

            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: (isMeasurable ? accentColor : subtextColor) + '22' },
                ]}
              >
                <Text
                  style={{
                    color: isMeasurable ? accentColor : subtextColor,
                    fontSize: getScaledFontSize(10),
                    fontWeight: getScaledFontWeight(700) as '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >
                  {isMeasurable ? 'Measurable' : 'Simple'}
                </Text>
              </View>
              {!!localTask.category && (
                <View style={[styles.badge, { backgroundColor: subtextColor + '14' }]}>
                  <Text
                    style={{
                      color: subtextColor,
                      fontSize: getScaledFontSize(10),
                      fontWeight: getScaledFontWeight(700) as '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}
                  >
                    {localTask.category}
                  </Text>
                </View>
              )}
            </View>

            {isMeasurable && (
              <>
                <MeasurementLogInput
                  task={localTask}
                  accentColor={accentColor}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                  onLogged={(updated) => setLocalTask(updated)}
                />
                <MeasurementHistoryList
                  measurements={measurements}
                  metric={localTask.metric}
                  colors={colors}
                  getScaledFontSize={getScaledFontSize}
                  getScaledFontWeight={getScaledFontWeight}
                  limit={10}
                />
              </>
            )}
          </ScrollView>

          <View style={[styles.actions, { borderTopColor: colors.border ?? 'rgba(0,0,0,0.08)' }]}>
            <TouchableOpacity
              onPress={confirmDelete}
              disabled={deleteMut.isPending}
              accessibilityRole="button"
              accessibilityLabel="Delete this task"
              style={[
                styles.btn,
                styles.btnGhost,
                { borderColor: colors.border, opacity: deleteMut.isPending ? 0.6 : 1 },
              ]}
            >
              <Text
                style={{
                  color: colors.error ?? '#DC2626',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(700) as '700',
                }}
              >
                Delete
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                // Close this modal first; parent re-opens the edit modal on
                // next tick to avoid stacked-Modal glitches on iOS (see
                // BiopsychosocialPlanScreen modal orchestration).
                const editing = localTask;
                onClose();
                onEdit(editing);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit this task"
              style={[styles.btn, styles.btnPrimary, { backgroundColor: accentColor }]}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: getScaledFontSize(14),
                  fontWeight: getScaledFontWeight(700) as '700',
                }}
              >
                Edit
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    maxHeight: '90%',
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  scroll: { paddingHorizontal: Spacing.md },
  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: Spacing.md },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1 },
  btnPrimary: {},
});
