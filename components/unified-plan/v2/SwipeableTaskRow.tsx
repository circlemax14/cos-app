/**
 * SwipeableTaskRow (COS-475, Phase 6.4).
 *
 * A single task row with left-swipe-reveals-right actions. Mirrors the
 * classic gesture-handler Swipeable pattern already in the app
 * (see components/calendar/EventListItem.tsx) — no Reanimated 2 API,
 * no new native deps.
 *
 * Actions:
 *   - Skip today   → omitTask (HIDDEN for medication tasks — safety)
 *   - Snooze 1h    → snoozeTask (pinned to 60 minutes by BE)
 *   - Reschedule…  → routes to the modal sheet reschedule.tsx
 *
 * Offline: Swipeable is disabled outright — the row shows a subtle
 * offline dot next to the title so the user knows why gestures no-op.
 *
 * Feature disabled (session breaker): after the first FEATURE_DISABLED
 * response from any swipe handler in the session, the row also collapses
 * back to the plain Pressable — no swipe actions, no network round-trip.
 *
 * Medication rows: long-press bumps the shared MedsSignal counter and
 * routes to /Home/health-plan (deep-link to the Meds section add flow).
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
  omitTask,
  snoozeTask,
} from '@/services/api/ai-health-plan';
import type { UnifiedTask } from '@/services/api/unified-plan';
import { useMedsSignal } from '@/contexts/MedsSignalContext';
import {
  classifySwipeError,
  SUCCESS_COPY,
} from '@/lib/plan-v2/error-copy';
import { usePlanV2Session } from '@/lib/plan-v2/session-state';

type ColorMap = Record<string, string | undefined>;

export interface SwipeableTaskRowProps {
  task: UnifiedTask;
  scheduledFor: string;
  scheduledTime?: string;
  accentColor: string;
  offline: boolean;
  hideReadings: boolean;
  colors: ColorMap;
  getScaledFontSize: (n: number) => number;
  getScaledFontWeight: (n: number) => string;
  onOptimisticSkip?: (taskId: string) => void;
  onRevertSkip?: (taskId: string) => void;
  onToast?: (message: string) => void;
  onRefetch?: () => void;
}

const ACTION_WIDTH = 88;
const CONCURRENT_WRITE_REFETCH_MS = 3000;

function isMedication(task: UnifiedTask): boolean {
  // The unified-plan view doesn't carry `type` on UnifiedTask, but medication
  // rows tag their sourceCategory as 'medication' or 'meds'. Defensive.
  const cat = task.sourceCategory?.toLowerCase();
  return cat === 'medication' || cat === 'meds';
}

export function SwipeableTaskRow(props: SwipeableTaskRowProps): React.JSX.Element {
  const {
    task,
    scheduledFor,
    scheduledTime,
    accentColor,
    offline,
    hideReadings,
    colors,
    getScaledFontSize,
    getScaledFontWeight,
    onOptimisticSkip,
    onRevertSkip,
    onToast,
    onRefetch,
  } = props;

  const swipeRef = useRef<Swipeable | null>(null);
  const [pending, setPending] = useState<'skip' | 'snooze' | null>(null);
  const [locallySkipped, setLocallySkipped] = useState(false);
  const [snoozedTo, setSnoozedTo] = useState<string | null>(null);
  const { bump } = useMedsSignal();
  const {
    featureDisabled,
    markFeatureDisabled,
    setSwipeInFlight,
  } = usePlanV2Session();

  const isMed = isMedication(task);
  const showSkipAction = !isMed;
  const swipeEnabled = !offline && !featureDisabled;
  const text = colors.text ?? '#111827';
  const subtext = colors.subtext ?? '#6B7280';
  const border = colors.border ?? '#D1D5DB';
  const card = colors.card ?? '#FFFFFF';

  const closeSwipe = () => swipeRef.current?.close?.();

  const scheduleDelayedRefetch = useCallback(() => {
    if (!onRefetch) return;
    setTimeout(() => onRefetch(), CONCURRENT_WRITE_REFETCH_MS);
  }, [onRefetch]);

  const handleErrorClassification = useCallback(
    (err: unknown, action: 'skip' | 'snooze', attempt: 1 | 2) => {
      const c = classifySwipeError(err, action, attempt);
      if (c.kind === 'feature-disabled') {
        markFeatureDisabled();
      }
      if (c.toast) onToast?.(c.toast);
      if (c.refetch) {
        if (c.kind === 'concurrent-write') scheduleDelayedRefetch();
        else onRefetch?.();
      }
      return c;
    },
    [markFeatureDisabled, onToast, onRefetch, scheduleDelayedRefetch],
  );

  const doSkip = useCallback(async () => {
    closeSwipe();
    if (offline) return;
    if (featureDisabled) {
      onToast?.('Editing unavailable');
      return;
    }
    setPending('skip');
    setLocallySkipped(true);
    onOptimisticSkip?.(task.id);
    try {
      await omitTask(task.id, { patientLocalDate: getTodayLocalDate() });
      onToast?.(SUCCESS_COPY.skipped);
    } catch (err) {
      const first = classifySwipeError(err, 'skip', 1);
      if (first.kind === 'concurrent-write') {
        // Silent single retry on the first concurrent-write failure.
        try {
          await new Promise((r) => setTimeout(r, 500));
          await omitTask(task.id, { patientLocalDate: getTodayLocalDate() });
          onToast?.(SUCCESS_COPY.skipped);
        } catch (err2) {
          const second = handleErrorClassification(err2, 'skip', 2);
          if (second.revert) {
            setLocallySkipped(false);
            onRevertSkip?.(task.id);
          }
        }
      } else {
        handleErrorClassification(err, 'skip', 1);
        if (first.revert) {
          setLocallySkipped(false);
          onRevertSkip?.(task.id);
        }
      }
    } finally {
      setPending(null);
    }
  }, [
    task.id,
    offline,
    featureDisabled,
    onOptimisticSkip,
    onRevertSkip,
    onToast,
    handleErrorClassification,
  ]);

  const doSnooze = useCallback(async () => {
    closeSwipe();
    if (offline) return;
    if (featureDisabled) {
      onToast?.('Editing unavailable');
      return;
    }
    setPending('snooze');
    try {
      const res = await snoozeTask(task.id, {
        scheduledFor,
        deltaMinutes: 60,
        originalTime: scheduledTime,
      });
      setSnoozedTo(res.snooze.newTime);
      onToast?.(SUCCESS_COPY.snoozed(res.snooze.newTime));
    } catch (err) {
      const first = classifySwipeError(err, 'snooze', 1);
      if (first.kind === 'concurrent-write') {
        try {
          await new Promise((r) => setTimeout(r, 500));
          const res2 = await snoozeTask(task.id, {
            scheduledFor,
            deltaMinutes: 60,
            originalTime: scheduledTime,
          });
          setSnoozedTo(res2.snooze.newTime);
          onToast?.(SUCCESS_COPY.snoozed(res2.snooze.newTime));
        } catch (err2) {
          handleErrorClassification(err2, 'snooze', 2);
        }
      } else {
        handleErrorClassification(err, 'snooze', 1);
      }
    } finally {
      setPending(null);
    }
  }, [
    task.id,
    scheduledFor,
    scheduledTime,
    offline,
    featureDisabled,
    onToast,
    handleErrorClassification,
  ]);

  const doReschedule = useCallback(() => {
    closeSwipe();
    if (offline) return;
    if (featureDisabled) {
      onToast?.('Editing unavailable');
      return;
    }
    router.push({
      pathname: '/Home/(plan)/reschedule' as never,
      params: {
        taskId: task.id,
        scheduledFor,
        originalTime: scheduledTime ?? '',
      },
    } as never);
  }, [task.id, scheduledFor, scheduledTime, offline, featureDisabled, onToast]);

  const onRowPress = useCallback(() => {
    router.push({
      pathname: '/Home/(plan)/task-detail' as never,
      params: { taskId: task.id, scheduledFor },
    } as never);
  }, [task.id, scheduledFor]);

  const onRowLongPress = useCallback(() => {
    if (!isMed) return;
    bump();
    router.push('/Home/health-plan' as never);
  }, [isMed, bump]);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const totalWidth = (showSkipAction ? ACTION_WIDTH : 0) + ACTION_WIDTH * 2;
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [totalWidth, 0],
    });
    return (
      <Animated.View style={[styles.actionsRow, { transform: [{ translateX }] }]}>
        {showSkipAction ? (
          <Pressable
            onPress={doSkip}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: (colors.warning as string) ?? '#B45309', opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Skip today"
            testID={`plan-v2-row-skip-${task.id}`}
          >
            <MaterialIcons name="do-disturb-on" size={getScaledFontSize(16)} color="#FFFFFF" />
            <Text style={styles.actionLabel}>Skip today</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={doSnooze}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: (colors.tint as string) ?? '#008080', opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Snooze 1 hour"
          testID={`plan-v2-row-snooze-${task.id}`}
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
          testID={`plan-v2-row-reschedule-${task.id}`}
        >
          <MaterialIcons name="event" size={getScaledFontSize(16)} color="#FFFFFF" />
          <Text style={styles.actionLabel}>Reschedule</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const rowOpacity = locallySkipped ? 0.5 : 1;

  const inner = (
    <Pressable
      onPress={onRowPress}
      onLongPress={onRowLongPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? (colors.cardBackground as string) ?? card : card,
          borderColor: border,
          opacity: rowOpacity,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}${scheduledTime ? `, ${scheduledTime}` : ''}${locallySkipped ? ', skipped' : ''}`}
      testID={`plan-v2-row-task-${task.id}`}
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
            {task.title}
          </Text>
          {offline ? (
            <View
              style={[styles.offlineDot, { backgroundColor: (colors.warning as string) ?? '#B45309' }]}
              accessibilityLabel="Offline"
            />
          ) : null}
          {pending ? <ActivityIndicator size="small" color={subtext} /> : null}
        </View>
        {scheduledTime ? (
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(11),
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {snoozedTo ? `Snoozed to ${snoozedTo}` : scheduledTime}
          </Text>
        ) : null}
        {!hideReadings && task.description ? (
          <Text
            style={{
              color: subtext,
              fontSize: getScaledFontSize(11),
              marginTop: 2,
              lineHeight: 15,
            }}
            numberOfLines={2}
          >
            {task.description}
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
