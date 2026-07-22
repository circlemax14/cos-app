/**
 * TaskEditorModal (COS-450 / SCRUM-588, Chunk 1c).
 *
 * Modal editor for adding + editing patient-authored tasks. Powers the
 * "+ Add task" affordance on BPS section cards and (later) the Edit
 * action on any task. Ships the essentials:
 *   - Title (with client-side smart-default detection on the fly)
 *   - Type toggle: Simple / Measurable
 *   - Metric picker: preset library dropdown + Custom (name + unit)
 *   - Optional target
 *   - Cadence + time
 *
 * Backed by the useCreatePlanTask / useUpdatePlanTask hooks. On tap,
 * fires the write and closes the modal same-tick (CHUNK 42, 2026-07-21):
 * awaiting an axios response inside a tap handler is the iOS 26.5
 * SIGABRT primitive documented in components/unified-plan/v2/net.ts.
 * Reconcile happens via ai-health-plan query invalidation, not via a
 * response payload. The `onSaved` prop is retained on the interface for
 * back-compat but is no longer invoked.
 *
 * OTA-safe (pure JS, no native fingerprint change).
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { Spacing, Radii } from '@/constants/design-system';
import { useCreatePlanTask, useUpdatePlanTask } from '@/hooks/use-plan-tasks';
import {
  PRESET_METRICS,
  detectCompletionStyleFromTitle,
  findPresetMetric,
  makeCustomMetricKey,
} from '@/lib/task-metrics';
import type {
  PlanTask,
  TaskCompletionStyle,
  TaskMetric,
  TaskRecurrence,
  TaskType,
} from '@/services/api/types';

type ColorMap = Record<string, string>;

export interface TaskEditorModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pre-fill an existing task for editing; undefined = create new. */
  initialTask?: PlanTask;
  /** Pre-fill category (from + Add task in a BPS section). */
  defaultCategory?: string;
  /** Pre-fill semantic type. Defaults to 'reminder' for new tasks. */
  defaultType?: TaskType;
  /**
   * @deprecated CHUNK 42 (2026-07-21): no longer invoked. Save is now
   * fire-and-forget and the modal closes same-tick — reconcile happens
   * via ai-health-plan query invalidation inside useCreatePlanTask /
   * useUpdatePlanTask. Kept in the prop shape to avoid a breaking
   * change for any external caller; safe to drop in a future cleanup
   * once callers stop passing it.
   */
  onSaved?: (task: PlanTask) => void;

  colors: ColorMap;
  isDark: boolean;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TYPE_OPTIONS: { key: TaskType; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: 'reminder', label: 'Reminder', icon: 'notifications' },
  { key: 'medication', label: 'Medication', icon: 'medication' },
  { key: 'exercise', label: 'Exercise', icon: 'directions-walk' },
  { key: 'appointment', label: 'Appointment', icon: 'event' },
];

const CADENCE_OPTIONS: { key: TaskRecurrence; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'once', label: 'Once' },
];

export function TaskEditorModal(props: TaskEditorModalProps): React.JSX.Element | null {
  // CHUNK 42: onSaved intentionally NOT destructured — no longer invoked
  // (see prop @deprecated note). Reconcile via query invalidation inside
  // useCreatePlanTask / useUpdatePlanTask.
  const { visible, onClose, initialTask, defaultCategory, defaultType, colors, getScaledFontSize, getScaledFontWeight } = props;
  const editing = !!initialTask;

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [type, setType] = React.useState<TaskType>('reminder');
  const [completionStyle, setCompletionStyle] = React.useState<TaskCompletionStyle>('simple');
  const [metricKey, setMetricKey] = React.useState<string>(''); // '' = none; preset key; 'custom:*'
  const [customName, setCustomName] = React.useState<string>('');
  const [customUnit, setCustomUnit] = React.useState<string>('');
  const [target, setTarget] = React.useState<string>('');
  const [scheduledTime, setScheduledTime] = React.useState<string>('09:00');
  const [recurrence, setRecurrence] = React.useState<TaskRecurrence>('daily');
  const [manualStyleOverride, setManualStyleOverride] = React.useState(false);

  // Reset when opened / initialTask changes
  React.useEffect(() => {
    if (!visible) return;
    if (initialTask) {
      setTitle(initialTask.title ?? '');
      setDescription(initialTask.description ?? '');
      setType(initialTask.type ?? 'reminder');
      setCompletionStyle(initialTask.completionStyle ?? 'simple');
      setMetricKey(initialTask.metric?.key ?? '');
      setCustomName(initialTask.metric?.key?.startsWith('custom:') ? initialTask.metric.name : '');
      setCustomUnit(initialTask.metric?.key?.startsWith('custom:') ? initialTask.metric.unit : '');
      setTarget(initialTask.metric?.target ?? '');
      setScheduledTime(initialTask.scheduledTime ?? '09:00');
      setRecurrence(initialTask.recurrence ?? 'daily');
      setManualStyleOverride(true); // editing → don't override existing style
    } else {
      setTitle('');
      setDescription('');
      setType(defaultType ?? 'reminder');
      setCompletionStyle('simple');
      setMetricKey('');
      setCustomName('');
      setCustomUnit('');
      setTarget('');
      setScheduledTime('09:00');
      setRecurrence('daily');
      setManualStyleOverride(false);
    }
  }, [visible, initialTask, defaultType]);

  // Smart-default detection: when NOT editing and user hasn't manually
  // touched the type toggle, auto-set completionStyle + preset metric
  // from the title on every keystroke.
  React.useEffect(() => {
    if (editing) return;
    if (manualStyleOverride) return;
    if (title.trim().length === 0) return;
    const detected = detectCompletionStyleFromTitle(title);
    setCompletionStyle(detected.completionStyle);
    if (detected.completionStyle === 'measurable' && detected.metric) {
      setMetricKey(detected.metric.key);
    }
  }, [title, editing, manualStyleOverride]);

  const createMut = useCreatePlanTask();
  const updateMut = useUpdatePlanTask();
  // CHUNK 42 fix (adversarial-verify major): session-scoped saved flag.
  // Original chunk 42 computed `saving = createMut.isPending || updateMut
  // .isPending` — but the hook-level 8s pending-window latch (chunk 40/41
  // pattern) keeps those flags true for 8s AFTER save, and TaskEditorModal
  // is unconditionally mounted by the parent (only `visible` toggles).
  // Result: isPending BLEEDS across modal open/close cycles. User saves
  // a Bio task, ~3s later opens Psy add-task, Save button is stuck
  // disabled with a spinner for another ~5s with no explanation.
  //
  // Fix: track savedThisSession as local state that resets on visible
  // false→true. Multi-tap protection within the SAME session survives
  // (rare — modal closes same-tick on Save anyway) but the flag never
  // leaks to the next session.
  const [savedThisSession, setSavedThisSession] = React.useState(false);
  React.useEffect(() => {
    if (visible) setSavedThisSession(false);
  }, [visible]);
  const saving = savedThisSession;

  const chosenPreset: TaskMetric | undefined = React.useMemo(() => {
    if (!metricKey) return undefined;
    if (metricKey.startsWith('custom:')) {
      return customName.trim() && customUnit.trim()
        ? { key: metricKey, name: customName.trim(), unit: customUnit.trim(), ...(target ? { target } : {}) }
        : undefined;
    }
    const preset = findPresetMetric(metricKey);
    return preset ? { ...preset, ...(target ? { target } : {}) } : undefined;
  }, [metricKey, customName, customUnit, target]);

  const canSave = title.trim().length > 0 && !saving &&
    (completionStyle === 'simple' || !!chosenPreset);

  const handleSave = React.useCallback(() => {
    if (!canSave) return;
    const body = {
      type,
      title: title.trim().slice(0, 120),
      ...(description.trim() ? { description: description.trim() } : {}),
      scheduledTime,
      recurrence,
      startDate: initialTask?.startDate ?? today(),
      ...(defaultCategory && !initialTask ? { category: defaultCategory } : {}),
      completionStyle,
      ...(chosenPreset ? { metric: chosenPreset } : {}),
    };
    // CHUNK 42 (2026-07-21): fire-and-forget then close same tick.
    // - No await: the awaited-inside-tap-handler axios shape is the
    //   iOS 26.5 SIGABRT primitive (see components/unified-plan/v2/net.ts).
    // - No Alert.alert: Alert-over-Modal is a second crash surface on the
    //   same device class.
    // - No onSaved callback: reconcile via ai-health-plan query
    //   invalidation inside useCreatePlanTask / useUpdatePlanTask.
    // BE createPlanTask assigns id server-side (see
    // services/api/plan-tasks.ts + SCRUM-587), so a same-frame double-tap
    // creates at most one extra DDB row — no crash risk.
    setSavedThisSession(true);
    if (editing) {
      updateMut.mutate({ id: initialTask!.id, body });
    } else {
      createMut.mutate(body);
    }
    onClose();
  }, [canSave, type, title, description, scheduledTime, recurrence, initialTask, defaultCategory, completionStyle, chosenPreset, editing, updateMut, createMut, onClose]);

  if (!visible) return null;

  const tint = (colors.tint as string) ?? '#0D9488';
  const detectedActive = !editing && !manualStyleOverride && title.trim().length > 0 && completionStyle === 'measurable';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card ?? colors.background }]}>
          <View style={styles.header}>
            <Text style={{ color: colors.text, fontSize: getScaledFontSize(17), fontWeight: getScaledFontWeight(700) as any, flex: 1 }}>
              {editing ? 'Edit task' : 'New task'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 12 }}>
            {/* TITLE */}
            <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>TASK</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Check blood pressure daily"
              placeholderTextColor={colors.subtext}
              maxLength={120}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {detectedActive ? (
              <View style={[styles.detectedTape, { backgroundColor: (colors.tint as string) + '22' }]}>
                <Text style={{ fontSize: 14 }}>✨</Text>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(12), flex: 1 }}>
                  <Text style={{ fontWeight: '700' }}>Detected as Measurable</Text>
                  {chosenPreset ? ` — ${chosenPreset.name} preselected` : ''}
                </Text>
                <TouchableOpacity onPress={() => setManualStyleOverride(true)}>
                  <Text style={{ color: tint, fontSize: getScaledFontSize(12), fontWeight: '700' }}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* TYPE (semantic) */}
            <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>KIND</Text>
            <View style={styles.chipRow}>
              {TYPE_OPTIONS.map((opt) => {
                const active = type === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setType(opt.key)}
                    style={[
                      styles.chipBtn,
                      { borderColor: active ? tint : colors.border, backgroundColor: active ? (tint + '18') : 'transparent' },
                    ]}
                  >
                    <MaterialIcons name={opt.icon} size={14} color={active ? tint : colors.text} />
                    <Text style={{ color: active ? tint : colors.text, fontSize: getScaledFontSize(12), fontWeight: '600' }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* COMPLETION STYLE */}
            <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>HOW YOU COMPLETE IT</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => { setCompletionStyle('simple'); setManualStyleOverride(true); }}
                style={[styles.styleBtn, {
                  borderColor: completionStyle === 'simple' ? tint : colors.border,
                  backgroundColor: completionStyle === 'simple' ? (tint + '18') : 'transparent',
                }]}
              >
                <Text style={{ fontSize: 22, marginBottom: 3 }}>✓</Text>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: '700' }}>Simple</Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10), textAlign: 'center', marginTop: 2 }}>Just mark it done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setCompletionStyle('measurable'); setManualStyleOverride(true); }}
                style={[styles.styleBtn, {
                  borderColor: completionStyle === 'measurable' ? tint : colors.border,
                  backgroundColor: completionStyle === 'measurable' ? (tint + '18') : 'transparent',
                }]}
              >
                <Text style={{ fontSize: 22, marginBottom: 3 }}>📊</Text>
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(13), fontWeight: '700' }}>Measurable</Text>
                <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(10), textAlign: 'center', marginTop: 2 }}>Log a value each time</Text>
              </TouchableOpacity>
            </View>

            {/* METRIC (only if measurable) */}
            {completionStyle === 'measurable' ? (
              <>
                <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>METRIC</Text>
                <View style={styles.chipRowWrap}>
                  {PRESET_METRICS.map((preset) => {
                    const active = metricKey === preset.key;
                    return (
                      <TouchableOpacity
                        key={preset.key}
                        onPress={() => setMetricKey(preset.key)}
                        style={[
                          styles.chipBtn,
                          { borderColor: active ? tint : colors.border, backgroundColor: active ? (tint + '18') : 'transparent' },
                        ]}
                      >
                        <Text style={{ color: active ? tint : colors.text, fontSize: getScaledFontSize(12), fontWeight: '600' }}>
                          {preset.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => setMetricKey(makeCustomMetricKey(customName || 'metric'))}
                    style={[
                      styles.chipBtn,
                      {
                        borderColor: metricKey.startsWith('custom:') ? tint : colors.border,
                        backgroundColor: metricKey.startsWith('custom:') ? (tint + '18') : 'transparent',
                        borderStyle: 'dashed',
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontSize: getScaledFontSize(12), fontWeight: '600' }}>Custom…</Text>
                  </TouchableOpacity>
                </View>

                {metricKey.startsWith('custom:') ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput
                      value={customName}
                      onChangeText={(v) => { setCustomName(v); setMetricKey(makeCustomMetricKey(v)); }}
                      placeholder="Metric name (e.g. Steps AM)"
                      placeholderTextColor={colors.subtext}
                      maxLength={80}
                      style={[styles.input, { flex: 2, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                    <TextInput
                      value={customUnit}
                      onChangeText={setCustomUnit}
                      placeholder="Unit"
                      placeholderTextColor={colors.subtext}
                      maxLength={24}
                      style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                  </View>
                ) : null}

                <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11), marginTop: 12 }]}>TARGET (OPTIONAL)</Text>
                <TextInput
                  value={target}
                  onChangeText={setTarget}
                  placeholder="e.g. below 130/80"
                  placeholderTextColor={colors.subtext}
                  maxLength={120}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                />
              </>
            ) : null}

            {/* CADENCE */}
            <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>HOW OFTEN</Text>
            <View style={styles.chipRowWrap}>
              {CADENCE_OPTIONS.map((opt) => {
                const active = recurrence === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setRecurrence(opt.key)}
                    style={[
                      styles.chipBtn,
                      { borderColor: active ? tint : colors.border, backgroundColor: active ? (tint + '18') : 'transparent' },
                    ]}
                  >
                    <Text style={{ color: active ? tint : colors.text, fontSize: getScaledFontSize(12), fontWeight: '600' }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* TIME */}
            <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>TIME (HH:MM 24h)</Text>
            <TextInput
              value={scheduledTime}
              onChangeText={setScheduledTime}
              placeholder="09:00"
              placeholderTextColor={colors.subtext}
              maxLength={5}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background, width: 100 }]}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />

            {description ? null : null /* skip description input for compactness — can be added later */}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text, fontSize: getScaledFontSize(14), fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave}
              style={[styles.btn, styles.btnPrimary, { backgroundColor: canSave ? tint : (colors.subtext as string) }]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ color: '#FFFFFF', fontSize: getScaledFontSize(14), fontWeight: '700' }}>{editing ? 'Save changes' : 'Add task'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
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
  label: {
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chipRowWrap: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 999,
  },
  styleBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detectedTape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
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
