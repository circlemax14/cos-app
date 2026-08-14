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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
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

  /**
   * Stack the actions instead of rowing them once the OS text scale is large.
   *
   * PixelRatio.getFontScale() is the RAW OS scale, deliberately — not the
   * app's damped getScaledFontSize. What overflows the card is the width the
   * OS actually renders the button labels at, and Bold Text widens glyphs on
   * top of that, so the raw scale is the honest signal. 1.3 is below the
   * accessibility sizes where the two labels stop fitting side by side on a
   * 390pt-wide phone, and above the ordinary Larger-Text settings where the
   * row is still comfortable.
   */
  const stackActions = PixelRatio.getFontScale() >= 1.3;

  // Ken 2026-08-07: "Couldn't register numbers because keypad blocked submit
  // button." The numeric keypads this modal uses (number-pad / decimal-pad)
  // have NO return or Done key on iOS, so once the keyboard is up there is no
  // way to dismiss it from the keyboard itself. Tapping the backdrop was the
  // only escape — and that used to CANCEL the modal, throwing away whatever
  // had just been typed.
  //
  // So: while the keyboard is up, a backdrop tap dismisses the keyboard
  // instead of cancelling. Once it is down, a backdrop tap cancels as before.
  // A ref, not state, because this is only read inside a handler and the
  // component must not re-render on every keyboard transition.
  const keyboardUp = useRef(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, () => {
      keyboardUp.current = true;
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      keyboardUp.current = false;
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const [raw, setRaw] = useState('');
  // SCRUM-279 (build 49): Ken's ask "we need to record EVERY parameter"
  // — blood pressure was logging only systolic before. Now when the
  // smart detector returns the systolic spec, the modal also collects
  // diastolic in a second input and POSTs both as separate records.
  const isBloodPressure = spec?.type === 'blood_pressure_systolic';
  const [diastolicRaw, setDiastolicRaw] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    if (!spec) return { value: NaN, valid: false, error: '' };
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return { value: NaN, valid: false, error: '' };
    if (n < spec.min) return { value: n, valid: false, error: `Value must be at least ${spec.min}` };
    if (n > spec.max) return { value: n, valid: false, error: `Value must be at most ${spec.max}` };
    return { value: n, valid: true, error: '' };
  }, [raw, spec]);

  // BP-specific: diastolic range 30–160 mmHg (clinically wider than
  // typical to avoid blocking valid emergency readings).
  const diastolicParsed = useMemo(() => {
    if (!isBloodPressure) return { value: NaN, valid: true, error: '' };
    const n = parseFloat(diastolicRaw);
    if (!Number.isFinite(n)) return { value: NaN, valid: false, error: '' };
    if (n < 30) return { value: n, valid: false, error: 'Diastolic must be at least 30' };
    if (n > 160) return { value: n, valid: false, error: 'Diastolic must be at most 160' };
    if (n >= parsed.value) return { value: n, valid: false, error: 'Diastolic should be less than systolic' };
    return { value: n, valid: true, error: '' };
  }, [diastolicRaw, isBloodPressure, parsed.value]);

  const allValid = parsed.valid && diastolicParsed.valid;
  const reset = () => { setRaw(''); setDiastolicRaw(''); setSaving(false); };

  const handleSave = async () => {
    if (!spec || !allValid) return;
    setSaving(true);
    const recordedAt = new Date().toISOString();
    const result = await recordSelfReportedMetric({
      type: spec.type,
      value: parsed.value,
      unit: spec.unit,
      recordedAt,
      sourceTaskId,
    });
    // If it's BP, also POST the diastolic reading. We don't fail the
    // whole flow if the second POST errors — at least systolic landed.
    if (result.ok && isBloodPressure && diastolicParsed.valid) {
      await recordSelfReportedMetric({
        type: 'blood_pressure_diastolic',
        value: diastolicParsed.value,
        unit: 'mmHg',
        recordedAt,
        sourceTaskId,
      });
    }
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

  /**
   * Backdrop tap. With a numeric keypad there is no Done key, so "tap outside"
   * is the instinctive way to put the keyboard away — but that used to cancel
   * the modal and discard the number the patient had just typed.
   *
   * First tap closes the keyboard, second tap cancels. Nothing is lost by
   * reaching for the obvious gesture.
   */
  const handleBackdropPress = () => {
    if (keyboardUp.current) {
      Keyboard.dismiss();
      return;
    }
    handleCancel();
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
      <KeyboardAvoidingView
        style={styles.flex}
        // 'padding' on iOS lifts the card clear of the keyboard; 'height' is
        // the Android equivalent. Without this the card stays centred in the
        // FULL screen and its lower half — including both action buttons —
        // sits behind the keypad. That is the bug Ken hit.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
          {/* Inner pressable blocks the backdrop dismiss when tapping the card. */}
          <Pressable
            onPress={() => {}}
            style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}
          >
            {/* Only the FIELDS scroll. The action row below is pinned outside
                this ScrollView so it can never be scrolled away or covered —
                the structural fix, rather than hoping the content fits. */}
            <ScrollView
              // Without this, the first tap on "Save & complete" is swallowed
              // dismissing the keyboard and nothing happens — which reads as
              // "the button is broken", i.e. Ken's complaint in a new costume.
              keyboardShouldPersistTaps="handled"
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
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
            {isBloodPressure ? 'Systolic' : 'Range'}: {spec.min}–{spec.max} {spec.unit}
          </Text>

          {isBloodPressure ? (
            <>
              <View style={[styles.inputRow, { borderColor: colors.text + '30', marginTop: 16 }]}>
                <TextInput
                  style={[styles.input, { color: colors.text, fontSize: getScaledFontSize(28), fontWeight: getScaledFontWeight(700) as any }]}
                  value={diastolicRaw}
                  onChangeText={setDiastolicRaw}
                  placeholder="e.g. 80"
                  placeholderTextColor={colors.text + '55'}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="Diastolic blood pressure value in mmHg"
                />
                <Text style={[styles.unit, { color: colors.text + 'AA', fontSize: getScaledFontSize(15) }]}>
                  mmHg
                </Text>
              </View>
              {diastolicParsed.error ? (
                <Text style={{ color: '#DC2626', fontSize: getScaledFontSize(12), marginTop: 4 }}>
                  {diastolicParsed.error}
                </Text>
              ) : null}
              <Text style={{ color: colors.text + '88', fontSize: getScaledFontSize(11), marginTop: 4 }}>
                Diastolic: 30–160 mmHg (must be below systolic)
              </Text>
            </>
          ) : null}

            </ScrollView>

          {/* Ken 2026-08-14, Bold Text + Larger Text on: "skip recording button
              is half out of modal".

              The row was flexDirection row + justifyContent flex-end, with a
              minWidth:130 primary. At large accessibility sizes the two
              buttons are wider than the card, and flex-end pushes the
              overflow off the LEFT edge — so the secondary action is the one
              that gets clipped, and "Skip recording" became unreachable.

              Above ~1.3x we stack instead. column-reverse so the DOM order
              (skip, save) renders as save-on-top: the primary action keeps
              the prominent position it has in the row layout, without
              duplicating the JSX to reorder it. */}
          <View style={[styles.buttonRow, stackActions && styles.buttonColumn]}>
            <Pressable
              onPress={handleSkip}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btnGhost,
                stackActions && styles.btnStacked,
                { opacity: pressed ? 0.6 : 1, borderColor: colors.text + '40' },
              ]}
            >
              <Text style={[styles.btnGhostText, { color: colors.text + 'BB', fontSize: getScaledFontSize(13) }]}>
                Skip recording
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!allValid || saving}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.btnPrimary,
                stackActions && styles.btnStacked,
                {
                  opacity: !allValid || saving ? 0.45 : pressed ? 0.85 : 1,
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
      </KeyboardAvoidingView>
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
  flex: { flex: 1 },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    // Bounded so the inner ScrollView has a height to scroll within. Needed
    // for the blood-pressure case (two inputs + two helper lines) on a small
    // phone at large accessibility font sizes, where the fields alone can
    // exceed the space left above the keyboard.
    maxHeight: '85%',
  },
  scrollContent: { gap: 4 },
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
    // Even in row mode the pair must never be able to overflow the card.
    flexWrap: 'wrap',
  },
  // column-reverse: DOM order is (skip, save), rendered order is (save, skip).
  buttonColumn: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  // Full width when stacked, and minWidth released so it cannot force overflow.
  btnStacked: { alignSelf: 'stretch', minWidth: 0, width: '100%' },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    // 44pt is the minimum comfortable target; the ghost button's padding alone
    // does not reach it at default text size.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  btnGhostText: { fontWeight: '600' },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 130,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
