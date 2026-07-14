/**
 * MeasurementLogInput (COS-450 / SCRUM-588, Chunk 1c FE).
 *
 * Value entry + Log button for a measurable task. Fires
 * useLogTaskMeasurement({ id, body: { value, source: 'manual' } }). Blood
 * pressure (metric.key === 'blood_pressure') is the one preset with a
 * two-field payload {systolic, diastolic}; every other preset + custom
 * metric ships a single-field {value} payload.
 *
 * On success, clears inputs and calls onLogged(updatedTask) with the full
 * PlanTask returned by the endpoint so the parent detail modal can update
 * its measurement history immediately instead of waiting on the
 * ['ai-health-plan'] invalidation round-trip.
 */

import React from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/design-system';
import { useLogTaskMeasurement } from '@/hooks/use-plan-tasks';
import type { PlanTask } from '@/services/api/types';

type ColorMap = Record<string, string>;

export interface MeasurementLogInputProps {
  task: PlanTask;
  accentColor: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string | number;
  /** Fired with the updated PlanTask returned by the log endpoint. */
  onLogged?: (task: PlanTask) => void;
}

// Only preset with a two-field payload shape. If a future BP-like preset
// lands (dual-value pain-and-location, etc.), this file + MeasurementHistoryList
// both need updating — there is no generic multi-field detection today.
const BP_KEY = 'blood_pressure';

export function MeasurementLogInput({
  task,
  accentColor,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  onLogged,
}: MeasurementLogInputProps): React.JSX.Element {
  const metric = task.metric;
  const isBp = metric?.key === BP_KEY;
  const [primary, setPrimary] = React.useState(''); // BP=systolic, others=value
  const [secondary, setSecondary] = React.useState(''); // BP=diastolic only
  const [error, setError] = React.useState<string | null>(null);
  const logMut = useLogTaskMeasurement();
  const canLog = isBp
    ? primary.trim().length > 0 && secondary.trim().length > 0
    : primary.trim().length > 0;

  // Strict numeric coercion. Handles European locale comma as decimal
  // separator. Returns NaN on invalid input so callers can reject the log
  // instead of silently shipping a string to a Number-shaped metric.
  const parseNum = (s: string): number => {
    const normalized = s.trim().replace(',', '.');
    return parseFloat(normalized);
  };

  const onPrimaryChange = React.useCallback((s: string) => {
    setPrimary(s);
    if (error) setError(null);
  }, [error]);

  const onSecondaryChange = React.useCallback((s: string) => {
    setSecondary(s);
    if (error) setError(null);
  }, [error]);

  const onLog = React.useCallback(async () => {
    if (!canLog) return;
    let value: Record<string, number | string>;
    if (isBp) {
      const sys = parseNum(primary);
      const dia = parseNum(secondary);
      if (Number.isNaN(sys) || Number.isNaN(dia)) {
        setError('Please enter a number');
        return;
      }
      value = { systolic: sys, diastolic: dia };
    } else {
      const v = parseNum(primary);
      if (Number.isNaN(v)) {
        setError('Please enter a number');
        return;
      }
      value = { value: v };
    }
    try {
      const saved = await logMut.mutateAsync({ id: task.id, body: { value, source: 'manual' } });
      setPrimary('');
      setSecondary('');
      setError(null);
      onLogged?.(saved);
    } catch {
      Alert.alert('Log failed', 'Please try again in a moment.');
    }
  }, [canLog, isBp, primary, secondary, task.id, logMut, onLogged]);

  const labelName = metric?.name ?? 'Value';
  const unit = metric?.unit ? ` (${metric.unit})` : '';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>
        LOG {labelName.toUpperCase()}{unit}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          value={primary}
          onChangeText={onPrimaryChange}
          keyboardType="decimal-pad"
          placeholder={isBp ? 'Systolic' : 'Value'}
          placeholderTextColor={colors.subtext}
          style={[
            styles.input,
            { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
          ]}
        />
        {isBp ? (
          <>
            <Text style={{ color: colors.subtext, fontSize: getScaledFontSize(14) }}>/</Text>
            <TextInput
              value={secondary}
              onChangeText={onSecondaryChange}
              keyboardType="decimal-pad"
              placeholder="Diastolic"
              placeholderTextColor={colors.subtext}
              style={[
                styles.input,
                { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
            />
          </>
        ) : null}
        <TouchableOpacity
          onPress={onLog}
          disabled={!canLog || logMut.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Log ${labelName}`}
          accessibilityState={{ disabled: !canLog || logMut.isPending, busy: logMut.isPending }}
          style={[
            styles.btn,
            {
              backgroundColor: canLog ? accentColor : (colors.subtext ?? '#9CA3AF'),
              opacity: logMut.isPending ? 0.7 : 1,
            },
          ]}
        >
          {logMut.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: getScaledFontSize(13),
                fontWeight: getScaledFontWeight(700) as '700',
              }}
            >
              Log
            </Text>
          )}
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={[styles.errorText, { fontSize: getScaledFontSize(12) }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  label: { fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  btn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#DC2626', marginTop: 6 },
});
