/**
 * Reschedule sheet (COS-475, Phase 6.4).
 *
 * Presented as an expo-router modal Stack screen — no RN Modal.
 * Reads taskId + scheduledFor + originalTime from route params, lets
 * the user pick a new HH:mm, then calls rescheduleOccurrence.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import {
  rescheduleOccurrence,
  type WrappedApiError,
} from '@/services/api/ai-health-plan';

function fmtHHmm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function parseHHmm(hhmm: string | null | undefined): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  if (!hhmm) return d;
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  if (!Number.isNaN(h)) d.setHours(h);
  if (!Number.isNaN(m)) d.setMinutes(m);
  return d;
}

export default function RescheduleSheet(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { taskId, scheduledFor, originalTime } = useLocalSearchParams<{
    taskId?: string;
    scheduledFor?: string;
    originalTime?: string;
  }>();

  const initial = useMemo(() => parseHHmm(originalTime), [originalTime]);
  const [chosen, setChosen] = useState<Date>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    if (!taskId || !scheduledFor) return;
    setSubmitting(true);
    setError(null);
    try {
      await rescheduleOccurrence(taskId, {
        scheduledFor,
        newTime: fmtHHmm(chosen),
      });
      router.back();
    } catch (err) {
      const code = (err as WrappedApiError)?.code;
      const msg = (err as Error)?.message ?? 'Failed to reschedule';
      setError(code === 'OCCURRENCE_CLOSED' ? "This task's window has closed" : msg);
    } finally {
      setSubmitting(false);
    }
  }, [taskId, scheduledFor, chosen]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={{ padding: Spacing.md }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(15),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
        }}
      >
        New time
      </Text>
      <Text
        style={{
          color: colors.subtext,
          fontSize: getScaledFontSize(12),
          marginTop: 4,
        }}
      >
        Original: {originalTime || '—'}
      </Text>
      <View style={{ marginTop: Spacing.md }}>
        <DateTimePicker
          value={chosen}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_e, d) => {
            if (d) setChosen(d);
          }}
        />
      </View>
      {error ? (
        <Text
          style={{
            color: (colors as unknown as { error?: string }).error ?? '#DC2626',
            fontSize: getScaledFontSize(12),
            marginTop: Spacing.sm,
          }}
        >
          {error}
        </Text>
      ) : null}
      <View style={styles.buttonRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => [
            styles.btn,
            styles.btnSecondary,
            { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
          ]}
          disabled={submitting}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
            }}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel="Confirm reschedule"
          style={({ pressed }) => [
            styles.btn,
            styles.btnPrimary,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}
          disabled={submitting}
          testID="plan-v2-reschedule-submit"
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: getScaledFontSize(14),
                fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
              }}
            >
              Move to {fmtHHmm(chosen)}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  btnPrimary: {},
  btnSecondary: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
});
