/**
 * Inline metric capture modal — opens when the user taps the
 * checkmark on a daily task that the smart detector flagged as
 * "recordable" (e.g. blood glucose, weight, BP).
 *
 * Build 45 (SCRUM-279). Ken: "if we are giving user task to check
 * blood glucose level then we should take initiative to record it".
 *
 * Behaviour:
 *  1. Modal opens with the metric spec (label + unit + bounds).
 *  2. User types a numeric value. Real-time bounds validation.
 *  3. "Save" calls POST /v1/patients/me/self-reported-metrics, then
 *     marks the underlying task as completed via the caller's
 *     onConfirmComplete().
 *  4. "Skip recording" still completes the task without saving a value
 *     — sometimes the patient prefers not to share or already logged
 *     it elsewhere.
 *  5. "Cancel" leaves task pending and closes the modal.
 *
 * Stateless presentation: parent owns task state. This component
 * only handles the input lifecycle and POSTs.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import type { MetricInputSpec } from '@/services/smart-task-detection';
import { recordSelfReportedMetric } from '@/services/api/self-reported-metrics';

export interface RecordMetricModalProps {
  visible: boolean;
  spec: MetricInputSpec | null;
  taskTitle: string;
  sourceTaskId?: string;
  onClose: () => void;
  /** Called after a successful save OR a deliberate "Skip recording".
   *  Parent should mark its task completed in response. */
  onConfirmComplete: (savedValue?: number) => void;
}

export function RecordMetricModal(props: RecordMetricModalProps) {
  const { visible, spec, taskTitle, sourceTaskId, onClose, onConfirmComplete } = props;
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    if (!spec) return { value: NaN, valid: false, error: '' };
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return { value: NaN, valid: false, error: '' };
    if (n < spec.min) return { value: n, valid: false, error: `Value must be at least ${spec.min}` };
    if (n > spec.max) return { value: n, valid: false, error: `Value must be at most ${spec.max}` };
    return { value: n, valid: true, error: '' };
  }, [raw, spec]);

  const reset = () => { setRaw(''); setSaving(false); };

  const handleSave = async () => {
    if (!spec || !parsed.valid) return;
    setSaving(true);
    const result = await recordSelfReportedMetric({
      type: spec.type,
      value: parsed.value,
      unit: spec.unit,
      recordedAt: new Date().toISOString(),
      sourceTaskId,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert(
        "Couldn't save",
        result.message ?? 'Try again in a moment.',
      );
      return;
    }
    reset();
    onConfirmComplete(parsed.value);
  };

  const handleSkip = () => {
    reset();
    onConfirmComplete(undefined);
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  if (!spec) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        {/* Inner pressable blocks the backdrop dismiss when tapping the card. */}
        <Pressable
          onPress={() => {}}
          style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}
        >
          <Text style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(18), fontWeight: getScaledFontWeight(700) as any }]}>
            Record {spec.label.toLowerCase()}
          </Text>
          <Text style={[styles.subtitle, { color: colors.text + 'AA', fontSize: getScaledFontSize(13) }]} numberOfLines={2}>
            From task: {taskTitle}
          </Text>

          <View style={[styles.inputRow, { borderColor: colors.text + '30' }]}>
            <TextInput
              style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(28), fontWeight: getScaledFontWeight(700) as any }]}
              value={raw}
              onChangeText={setRaw}
              placeholder={spec.placeholder}
              placeholderTextColor={colors.text + '55'}
              keyboardType={spec.precision === 0 ? 'number-pad' : (Platform.OS === 'ios' ? 'decimal-pad' : 'numeric')}
              autoFocus
              maxLength={6}
              accessibilityLabel={`${spec.label} value in ${spec.unit}`}
            />
            <Text style={[styles.unit, { color: colors.text + 'AA', fontSize: getScaledFontSize(15) }]}>
              {spec.unit}
            </Text>
          </View>
          {parsed.error ? (
            <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), marginTop: 4 }}>
              {parsed.error}
            </Text>
          ) : null}
          <Text style={{ color: colors.text + '88', fontSize: getScaledFontSize(11), marginTop: 4 }}>
            Range: {spec.min}–{spec.max} {spec.unit}
          </Text>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleSkip}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btnGhost, { opacity: pressed ? 0.6 : 1, borderColor: colors.text + '40' }]}
            >
              <Text style={[styles.btnGhostText, { color: colors.text + 'BB', fontSize: getScaledFontSize(13) }]}>
                Skip recording
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!parsed.valid || saving}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btnPrimary,
                {
                  opacity: !parsed.valid || saving ? 0.45 : pressed ? 0.85 : 1,
                  backgroundColor: colors.tint || '#008080',
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.btnPrimaryText, { fontSize: getScaledFontSize(14) }]}>
                  Save & complete
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    gap: 4,
  },
  title: { letterSpacing: 0.2 },
  subtitle: { marginBottom: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginTop: 8,
  },
  input: { flex: 1, padding: 0, minHeight: 40 },
  unit: { fontWeight: '600' },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnGhostText: { fontWeight: '600' },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
