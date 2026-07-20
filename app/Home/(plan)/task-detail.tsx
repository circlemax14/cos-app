/**
 * Task detail sheet (COS-475, Phase 6.4).
 *
 * Full-detail view for a single task with explicit buttons (no swipe).
 * Buttons: Complete, Skip today, Snooze 1h, Reschedule…
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { Radii, Spacing } from '@/constants/design-system';
import { useAccessibility } from '@/stores/accessibility-store';
import { useUnifiedPlan } from '@/hooks/use-unified-plan';
import { useRoutines } from '@/hooks/use-routines';
import {
  completeTask,
  getTodayLocalDate,
  omitTask,
  snoozeTask,
  type WrappedApiError,
} from '@/services/api/ai-health-plan';

type ColorMap = typeof Colors.light;

export default function TaskDetailSheet(): React.JSX.Element {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const { taskId, scheduledFor } = useLocalSearchParams<{
    taskId?: string;
    scheduledFor?: string;
  }>();
  const { data: view, refetch } = useUnifiedPlan();
  const { routines } = useRoutines();

  const task = useMemo(() => {
    if (!taskId || !view) return null;
    const keys: ('biological' | 'psychological' | 'socialSpiritual')[] = [
      'biological',
      'psychological',
      'socialSpiritual',
    ];
    for (const k of keys) {
      const found = view.sections[k]?.tasks?.find((t) => t.id === taskId);
      if (found) return { source: 'plan' as const, task: found };
    }
    const routine = routines.find((r) => r.id === taskId);
    if (routine) return { source: 'routine' as const, task: routine };
    return null;
  }, [taskId, view, routines]);

  const [pending, setPending] = useState<'complete' | 'skip' | 'snooze' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snoozedTo, setSnoozedTo] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const targetScheduledFor = scheduledFor || getTodayLocalDate();

  const doComplete = useCallback(async () => {
    if (!taskId) return;
    setPending('complete');
    setError(null);
    try {
      const res = await completeTask(taskId, {
        scheduledFor: targetScheduledFor,
        patientLocalDate: getTodayLocalDate(),
      });
      if (res.ok) {
        setCompleted(true);
        setTimeout(() => router.back(), 500);
      } else {
        setError(res.message ?? 'Failed to complete');
      }
    } finally {
      setPending(null);
    }
  }, [taskId, targetScheduledFor]);

  const doSkip = useCallback(async () => {
    if (!taskId) return;
    setPending('skip');
    setError(null);
    try {
      await omitTask(taskId, { patientLocalDate: getTodayLocalDate() });
      setSkipped(true);
      setTimeout(() => router.back(), 500);
    } catch (err) {
      setError((err as WrappedApiError)?.message ?? 'Failed to skip');
    } finally {
      setPending(null);
    }
  }, [taskId]);

  const doSnooze = useCallback(async () => {
    if (!taskId) return;
    setPending('snooze');
    setError(null);
    try {
      const res = await snoozeTask(taskId, {
        scheduledFor: targetScheduledFor,
        deltaMinutes: 60,
      });
      setSnoozedTo(res.snooze.newTime);
      void refetch();
    } catch (err) {
      setError((err as WrappedApiError)?.message ?? 'Failed to snooze');
    } finally {
      setPending(null);
    }
  }, [taskId, targetScheduledFor, refetch]);

  const doReschedule = useCallback(() => {
    if (!taskId) return;
    router.push({
      pathname: '/Home/(plan)/reschedule' as never,
      params: {
        taskId,
        scheduledFor: targetScheduledFor,
        originalTime: '',
      },
    } as never);
  }, [taskId, targetScheduledFor]);

  const title = task?.task?.title ?? 'Task';
  const description = task?.task?.description ?? '';

  return (
    <ScrollView
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={{ padding: Spacing.md }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: getScaledFontSize(18),
          fontWeight: getScaledFontWeight(800) as TextStyle['fontWeight'],
        }}
        numberOfLines={3}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={{
            color: colors.subtext,
            fontSize: getScaledFontSize(13),
            marginTop: Spacing.sm,
            lineHeight: 19,
          }}
        >
          {description}
        </Text>
      ) : null}
      {snoozedTo ? (
        <Text
          style={{
            color: colors.tint,
            fontSize: getScaledFontSize(12),
            marginTop: Spacing.sm,
          }}
        >
          Snoozed to {snoozedTo}
        </Text>
      ) : null}
      {completed ? <StatusPill label="Marked complete" tint={(colors as unknown as { success?: string }).success ?? '#059669'} colors={colors} /> : null}
      {skipped ? <StatusPill label="Skipped today" tint={(colors as unknown as { warning?: string }).warning ?? '#B45309'} colors={colors} /> : null}
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

      <View style={{ marginTop: Spacing.lg }}>
        <ActionButton
          onPress={doComplete}
          disabled={!!pending || completed || skipped}
          pending={pending === 'complete'}
          icon="check-circle"
          label="Mark complete"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          bg={colors.tint}
          testID="plan-v2-task-detail-complete"
        />
        <ActionButton
          onPress={doSkip}
          disabled={!!pending || completed || skipped}
          pending={pending === 'skip'}
          icon="do-disturb-on"
          label="Skip today"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          bg={(colors as unknown as { warning?: string }).warning ?? '#B45309'}
        />
        <ActionButton
          onPress={doSnooze}
          disabled={!!pending || completed || skipped}
          pending={pending === 'snooze'}
          icon="schedule"
          label="Snooze 1 hour"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          bg={(colors as unknown as { accent?: string }).accent ?? '#6366F1'}
        />
        <ActionButton
          onPress={doReschedule}
          disabled={!!pending || completed || skipped}
          pending={false}
          icon="event"
          label="Reschedule…"
          colors={colors}
          getScaledFontSize={getScaledFontSize}
          getScaledFontWeight={getScaledFontWeight}
          bg={(colors.subtext as string) ?? '#6B7280'}
        />
      </View>
    </ScrollView>
  );
}

function ActionButton({
  onPress,
  disabled,
  pending,
  icon,
  label,
  colors,
  getScaledFontSize,
  getScaledFontWeight,
  bg,
  testID,
}: {
  onPress: () => void;
  disabled: boolean;
  pending: boolean;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  bg: string;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {pending ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <MaterialIcons name={icon} size={getScaledFontSize(16)} color="#FFFFFF" />
      )}
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: getScaledFontSize(14),
          fontWeight: getScaledFontWeight(700) as TextStyle['fontWeight'],
          marginLeft: 8,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusPill({ label, tint, colors }: { label: string; tint: string; colors: ColorMap }): React.JSX.Element {
  return (
    <View
      style={{
        marginTop: Spacing.sm,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: tint + '1F',
        borderWidth: 1,
        borderColor: tint,
      }}
    >
      <Text style={{ color: tint, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Radii.md,
    marginBottom: Spacing.sm,
  },
});
