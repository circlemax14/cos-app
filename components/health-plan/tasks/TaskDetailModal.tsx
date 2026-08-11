/**
 * TaskDetailModal (COS-450 / SCRUM-588, Chunk 1c FE).
 *
 * Bottom-sheet Modal showing a single task's details. Header (title + close),
 * body (description + Simple/Measurable + category badges). For measurable
 * tasks, embeds MeasurementLogInput + MeasurementHistoryList. Footer with
 * Delete (inline two-step confirm → fireAndForgetDelete; iOS 26.5 safe per
 * v2/net + chunk 9.5) and Edit (fires onEdit(task) so the parent screen can
 * swap in TaskEditorModal with initialTask).
 *
 * Simple-task completion toggle is intentionally omitted this pass — Ken PDF
 * v7.2 § 18 leaves 'mark done today' to a follow-up; the spec's fallback
 * ("skip completion for now, just show details + Edit + Delete") ships here.
 */

import React from 'react';
import {
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
import { useQueryClient } from '@tanstack/react-query';

import { Radii, Spacing } from '@/constants/design-system';
import { fireAndForgetDelete } from '@/components/unified-plan/v2/net';
import type { AiHealthPlan, PlanTask } from '@/services/api/types';

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

/**
 * CHUNK 53 (2026-07-22): bodyless variant props. Identical to
 * TaskDetailModalProps minus `visible`. Used by the consolidated BPS Modal
 * so the interior can be re-hosted without stacking multiple
 * <Modal transparent> nodes on iOS 26.5.
 */
export type TaskDetailBodyProps = Omit<TaskDetailModalProps, 'visible'>;

export function TaskDetailModal(props: TaskDetailModalProps): React.JSX.Element | null {
  const { visible, ...bodyProps } = props;
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={bodyProps.onClose}>
      <TaskDetailBody {...bodyProps} />
    </Modal>
  );
}

/**
 * CHUNK 53 (2026-07-22): interior-only. Contains the overlay, backdrop tap,
 * KeyboardAvoidingView, sheet, log/history and Delete/Edit footer — every
 * primitive TaskDetailModal had minus the outer <Modal>. Behavior identical:
 * two-step inline delete, arm-time debounce, auto-revert timer, no
 * Alert.alert, fire-and-forget delete via v2/net.
 */
export function TaskDetailBody(props: TaskDetailBodyProps): React.JSX.Element | null {
  const {
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
  // Two-step inline confirm state — first Delete tap flips this true so the
  // footer morphs to Cancel + "Really delete?" (no Alert.alert; presenting a
  // native alert over a React Modal is the iOS 26.5 SIGABRT class per
  // chunk 9.5).
  const [confirming, setConfirming] = React.useState(false);
  // CHUNK 38 fix (adversarial-verify major #1): arm-time debounce. A
  // finger already in motion toward Edit could otherwise land on the
  // freshly-swapped "Really delete?" button within 50-100ms and delete
  // without the user perceiving the confirm state. Reject the confirm
  // tap if it arrives within 400ms of arming.
  const armedAtRef = React.useRef<number>(0);
  React.useEffect(() => {
    setLocalTask(task);
    setConfirming(false);
  }, [task]);
  // CHUNK 53: Body is only mounted while visible, so mount = fresh open →
  // confirming already starts false (useState default). Wrapper mode also
  // gets equivalent behavior via the `if (!visible) return null` guard in
  // TaskDetailModal above. The prior `[visible]` effect became dead code
  // once Body carries no visible prop.
  // Auto-revert the confirming state after a short window so a user who
  // taps Delete, gets interrupted, and returns minutes later has to re-read
  // the confirm before the second tap fires.
  React.useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const qc = useQueryClient();

  if (!localTask) return null;

  const isMeasurable = localTask.completionStyle === 'measurable';
  const measurements = Array.isArray(localTask.measurements) ? localTask.measurements : [];
  const subtextColor = colors.subtext ?? '#6B7280';

  // Inline two-step delete. First tap arms the confirming state; second tap
  // (a) drops the row from the parent's list optimistically, (b) closes the
  // Modal on the same synchronous tick so unmount starts before any fetch
  // is scheduled, (c) fires the DELETE with no await via v2/net's
  // fireAndForgetDelete (raw fetch, swallow errors, reconcile on next
  // plan refetch), (d) invalidates the plan query so the next foreground
  // reconciles server state. NO Alert.alert, NO await, NO Modal over Modal.
  const handleDeletePress = (): void => {
    if (!confirming) {
      setConfirming(true);
      armedAtRef.current = Date.now();
      return;
    }
    // Reject taps arriving within the arm window — protects against
    // an in-flight finger from the first tap landing on the confirm.
    if (Date.now() - armedAtRef.current < 400) return;
    const removed = localTask;
    if (!removed) return;
    onDeleted?.(removed);
    onClose();

    // Optimistic strike-through. Vishal 2026-08-11: "when we delete any task
    // then cross it with a loader and then we receive response from backend
    // then remove it properly".
    //
    // Mark the row rather than dropping it: removing it here would be a lie
    // if the DELETE fails, and the task would silently reappear later with no
    // explanation. TaskRow renders __optimistic:'deleting' dimmed, struck
    // through, "Removing…".
    qc.setQueryData<AiHealthPlan | null>(['ai-health-plan'], (prev) =>
      prev?.tasks
        ? {
            ...prev,
            tasks: prev.tasks.map((t): PlanTask =>
              t.id === removed.id ? { ...t, __optimistic: 'deleting' } : t,
            ),
          }
        : prev,
    );

    void fireAndForgetDelete(
      `/v1/patients/me/health-plan/tasks/${encodeURIComponent(removed.id)}`,
    );

    // The invalidate used to fire on this same line, SYNCHRONOUSLY — before
    // the fire-and-forget DELETE could possibly have landed. The refetch then
    // returned the task still present, which both wiped the strike-through
    // and made the row look like the delete had failed. That is why delete
    // "wasn't working" while add was.
    //
    // Two passes: one after a single DDB round trip, one with headroom for a
    // cold Lambda. Cheap, and the second covers a slow first.
    setTimeout(() => qc.invalidateQueries({ queryKey: ['ai-health-plan'] }), 2_500);
    setTimeout(() => qc.invalidateQueries({ queryKey: ['ai-health-plan'] }), 6_000);
  };

  return (
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
            {confirming ? (
              <>
                {/*
                  CHUNK 38 fix (adversarial-verify major #2): "Really
                  delete?" occupies the LEFT slot — same position the
                  Delete button was in before the tap. This means the
                  user's second tap consciously falls where their first
                  tap did (they see the label change but hit the same
                  slot). Cancel takes the RIGHT slot where Edit used to
                  live — muscle memory going right hits the safe action.
                */}
                <Pressable
                  onPress={handleDeletePress}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm delete this task"
                  accessibilityHint="This permanently removes the task"
                  style={[
                    styles.btn,
                    styles.btnPrimary,
                    { backgroundColor: colors.error ?? '#DC2626' },
                  ]}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(700) as '700',
                    }}
                  >
                    Really delete?
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirming(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel delete"
                  style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: getScaledFontSize(14),
                      fontWeight: getScaledFontWeight(700) as '700',
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={handleDeletePress}
                  accessibilityRole="button"
                  accessibilityLabel="Delete this task"
                  style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]}
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
                </Pressable>
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
              </>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
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
