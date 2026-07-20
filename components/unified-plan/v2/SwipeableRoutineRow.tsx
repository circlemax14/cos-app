/**
 * SwipeableRoutineRow (COS-475, Phase 6.4).
 *
 * Routine sibling to SwipeableTaskRow. Right-actions: Snooze 1h,
 * Reschedule, Edit. Tap opens the routine editor sheet for full edit.
 *
 * Round 2: snooze/reschedule now forward `originalTime` (the row's
 * scheduledTime HH:mm) so the BE can begin disambiguating routines
 * that recur multiple times per day. Follow-up ticket queued to widen
 * BE /snooze + /reschedule-occurrence to honor the field.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

import { Radii, Spacing } from '@/constants/design-system';
import {
  getTodayLocalDate,
  snoozeTask,
} from '@/services/api/ai-health-plan';
import type { RoutineRow } from '@/services/api/types';
import {
  classifySwipeError,
  SUCCESS_COPY,
} from '@/lib/plan-v2/error-copy';
import { usePlanV2Session } from '@/lib/plan-v2/session-state';

type ColorMap = Record<string, string | undefined>;

export interface SwipeableRoutineRowProps {
  routine: RoutineRow;
  accentColor: string;
  offline: boolean;
  hideReadings: boolean;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onToast?: (message: string) => void;
  onRefetch?: () => void;
}

const ACTION_WIDTH = 88;
const CONCURRENT_WRITE_REFETCH_MS = 3000;

export function SwipeableRoutineRow(props: SwipeableRoutineRowProps): React.JSX.Element {
  const {
    routine,
    accentColor,
    offline,
    hideReadings,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    onToast,
    onRefetch,
  } = props;

  const swipeRef = useRef<Swipeable | null>(null);
  const [pending, setPending] = useState(false);
  const [snoozedTo, setSnoozedTo] = useState<string | null>(null);
  const {
    featureDisabled,
    markFeatureDisabled,
    setSwipeInFlight,
  } = usePlanV2Session();
  const text = colors.text ?? '#111827';
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  const card = colors.card ?? '#FFFFFF';

  const swipeEnabled = !offline && !featureDisabled;

  const openEdit = useCallback(() => {
    swipeRef.current?.close?.();
    router.push({
      pathname: '/Home/(plan)/routine-editor' as never,
      params: { id: routine.id },
    } as never);
  }, [routine.id]);

  const scheduleDelayedRefetch = useCallback(() => {
    if (!onRefetch) return;
    setTimeout(() => onRefetch(), CONCURRENT_WRITE_REFETCH_MS);
  }, [onRefetch]);

  const handleErrorClassification = useCallback(
    (err: unknown, attempt: 1 | 2) => {
      const c = classifySwipeError(err, 'snooze', attempt);
      if (c.kind === 'feature-disabled') markFeatureDisabled();
      if (c.toast) onToast?.(c.toast);
      if (c.refetch) {
        if (c.kind === 'concurrent-write') scheduleDelayedRefetch();
        else onRefetch?.();
      }
      return c;
    },
    [markFeatureDisabled, onToast, onRefetch, scheduleDelayedRefetch],
  );

  const doSnooze = useCallback(async () => {
    swipeRef.current?.close?.();
    if (offline) return;
    if (featureDisabled) {
      onToast?.('Editing unavailable');
      return;
    }
    setPending(true);
    try {
      const res = await snoozeTask(routine.id, {
        scheduledFor: getTodayLocalDate(),
        deltaMinutes: 60,
        originalTime: routine.scheduledTime,
      });
      setSnoozedTo(res.snooze.newTime);
      onToast?.(SUCCESS_COPY.snoozed(res.snooze.newTime));
    } catch (err) {
      const first = classifySwipeError(err, 'snooze', 1);
      if (first.kind === 'concurrent-write') {
        try {
          await new Promise((r) => setTimeout(r, 500));
          const res2 = await snoozeTask(routine.id, {
            scheduledFor: getTodayLocalDate(),
            deltaMinutes: 60,
            originalTime: routine.scheduledTime,
          });
          setSnoozedTo(res2.snooze.newTime);
          onToast?.(SUCCESS_COPY.snoozed(res2.snooze.newTime));
        } catch (err2) {
          handleErrorClassification(err2, 2);
        }
      } else {
        handleErrorClassification(err, 1);
      }
    } finally {
      setPending(false);
    }
  }, [
    routine.id,
    routine.scheduledTime,
    offline,
    featureDisabled,
    onToast,
    handleErrorClassification,
  ]);

  const doReschedule = useCallback(() => {
    swipeRef.current?.close?.();
    if (offline) return;
    if (featureDisabled) {
      onToast?.('Editing unavailable');
      return;
    }
    router.push({
      pathname: '/Home/(plan)/reschedule' as never,
      params: {
        taskId: routine.id,
        scheduledFor: getTodayLocalDate(),
        originalTime: routine.scheduledTime ?? '',
      },
    } as never);
  }, [routine.id, routine.scheduledTime, offline, featureDisabled, onToast]);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const totalWidth = ACTION_WIDTH * 3;
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [totalWidth, 0],
    });
    return (
      <Animated.View style={[styles.actionsRow, { transform: [{ translateX }] }]}>
        <Pressable
          onPress={doSnooze}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: (colors.tint as string) ?? '#008080', opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Snooze 1 hour"
        >
          <MaterialIcons name="schedule" size={getScaledFontSize(16)} color="#FFFFFF" />
          <Text style={styles.actionLabel}>Snooze 1h</Text>
        </Pressable>
        <Pressable
          onPress={doReschedule}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: (colors.accent as string) ?? '#6366F1', opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Reschedule"
        >
          <MaterialIcons name="event" size={getScaledFontSize(16)} color="#FFFFFF" />
          <Text style={styles.actionLabel}>Reschedule</Text>
        </Pressable>
        <Pressable
          onPress={openEdit}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: (colors.subtext as string) ?? '#6B7280', opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Edit routine"
        >
          <MaterialIcons name="edit" size={getScaledFontSize(16)} color="#FFFFFF" />
          <Text style={styles.actionLabel}>Edit</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const inner = (
    <Pressable
      onPress={openEdit}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? (colors.cardBackground as string) ?? card : card,
          borderColor: border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${routine.title}${routine.scheduledTime ? `, ${routine.scheduledTime}` : ''}`}
      testID={`plan-v2-row-routine-${routine.id}`}
    >
      <View style={[styles.rail, { backgroundColor: accentColor + 'CC' }]} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={{
              color: text,
              fontSize: getScaledFontSize(13),
              fontWeight: getScaledFontWeight(600) as TextStyle['fontWeight'],
              flex: 1,
            }}
            numberOfLines={2}
          >
            {routine.title}
          </Text>
          {offline ? (
            <View
              style={[styles.offlineDot, { backgroundColor: (colors.warning as string) ?? '#B45309' }]}
              accessibilityLabel="Offline"
            />
          ) : null}
          {pending ? <ActivityIndicator size="small" color={subtext} /> : null}
        </View>
        {routine.scheduledTime ? (
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(11),
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {snoozedTo ? `Snoozed to ${snoozedTo}` : `${routine.scheduledTime} · ${routine.recurrence}`}
          </Text>
        ) : null}
        {!hideReadings && routine.description ? (
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(11),
              marginTop: 2,
              lineHeight: 15,
            }}
            numberOfLines={2}
          >
            {routine.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  if (!swipeEnabled) return inner;

  return (
    <Swipeable
      ref={(r) => {
        swipeRef.current = r as Swipeable | null;
      }}
      enabled={swipeEnabled}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
      onSwipeableWillOpen={() => setSwipeInFlight(true)}
      onSwipeableWillClose={() => setSwipeInFlight(false)}
    >
      {inner}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm - 2,
    alignItems: 'stretch',
  },
  rail: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  body: {
    flex: 1,
    marginLeft: Spacing.sm + 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
});
