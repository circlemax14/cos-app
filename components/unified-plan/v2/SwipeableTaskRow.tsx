/**
 * SwipeableTaskRow — CHUNK 9 (2026-07-20).
 *
 * Owns per-row swipe + acting state so BpsAccordion stays declarative.
 * Chunk 9 wires ONLY the Skip today handler → legacy skipTask endpoint
 * (POST /v1/patients/me/tasks/:id/skip). Snooze + Reschedule are still
 * visual-only chips; their handlers land in chunk 10 + 11.
 *
 * On successful skip:
 *   - Row is instantly hidden (setLocalSkipped(true)) so Ken sees the
 *     item disappear without waiting for the poll.
 *   - onRefetch fires so the underlying data catches up.
 *
 * On failure (network, 4xx): row un-hides, next poll reconciles. No
 * toast — Alert is a Modal, which is exactly the iOS 26 surface we're
 * avoiding on this build.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { skipTask } from '@/services/api/ai-health-plan';
import type { UnifiedTask } from '@/services/api/unified-plan';

export interface SwipeableTaskRowProps {
  task: UnifiedTask;
  accentColor: string;
  onRefetch?: () => void;
}

function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function SwipeableTaskRow({
  task,
  accentColor,
  onRefetch,
}: SwipeableTaskRowProps): React.JSX.Element | null {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

  const [acting, setActing] = React.useState(false);
  const [locallySkipped, setLocallySkipped] = React.useState(false);
  const swipeableRef = React.useRef<Swipeable | null>(null);

  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped' || locallySkipped;
  if (locallySkipped) return null;

  // CHUNK 9.2 (2026-07-21) — iOS 26.5 SIGABRT fix.
  //
  // Ken's device crashed on Skip tap: firing a fetch inside a
  // gesture-handler tap callback triggers iOS 26.5's TurboModule
  // objc_exception_rethrow. The gesture is safe (chunks 6, 6.1) and
  // the fetch is safe (chunk 3), but running them in the same call
  // stack isn't.
  //
  // Fix: split into two synchronous steps. The tap callback ONLY
  // updates local state + closes the swipeable — no network. A
  // separate effect (deferred via InteractionManager) picks up the
  // pending intent AFTER the gesture stack has fully unwound and
  // fires the actual skipTask. This is the standard RN pattern for
  // gesture-triggered async work; it also improves perceived
  // responsiveness because the row visibly reacts before the
  // network round-trip completes.
  const [pendingSkip, setPendingSkip] = React.useState(false);

  const onSkipTap = React.useCallback(() => {
    if (acting || pendingSkip) return;
    try {
      swipeableRef.current?.close();
    } catch {
      // ignore
    }
    setPendingSkip(true);
  }, [acting, pendingSkip]);

  React.useEffect(() => {
    if (!pendingSkip) return;
    let cancelled = false;
    setActing(true);
    // CHUNK 9.3 — InteractionManager.runAfterInteractions froze on iOS
    // 26.5 (gesture-handler apparently doesn't release its interaction
    // handle after Swipeable closes on this build). Plain setTimeout
    // with a 50ms delay lets the gesture stack fully unwind without
    // depending on the handle-release mechanism.
    const timeoutId = setTimeout(async () => {
      try {
        const res = await skipTask(task.id, todayYYYYMMDD());
        if (cancelled) return;
        if (res.ok) {
          setLocallySkipped(true);
          onRefetch?.();
        }
      } finally {
        if (!cancelled) {
          setActing(false);
          setPendingSkip(false);
        }
      }
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [pendingSkip, task.id, onRefetch]);

  // gesture-handler naming: renderRightActions = actions live on the
  // RIGHT edge of the row = user drags finger LEFT to reveal them.
  // We want "Skip today" on left-swipe (standard iOS Mail pattern) so
  // it goes here.
  const renderRightActions = () => (
    <Pressable
      onPress={onSkipTap}
      accessibilityRole="button"
      accessibilityLabel={`Skip ${task.title} today`}
      style={[styles.swipeAction, { backgroundColor: '#9CA3AF' }]}
    >
      {acting ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={styles.swipeActionText}>Skip today</Text>
      )}
    </Pressable>
  );

  // renderLeftActions = actions on the LEFT edge = user drags finger
  // RIGHT to reveal. Snooze + Reschedule (visual-only for now) go here.
  const renderLeftActions = () => (
    <View style={styles.swipeActionsRight}>
      <View style={[styles.swipeAction, { backgroundColor: '#F59E0B' }]}>
        <Text style={styles.swipeActionText}>Snooze 1h</Text>
      </View>
      <View style={[styles.swipeAction, { backgroundColor: '#3B82F6' }]}>
        <Text style={styles.swipeActionText}>Reschedule</Text>
      </View>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
    >
      <View
        style={[
          styles.taskRow,
          {
            borderColor: colors.border,
            backgroundColor: colors.background,
            opacity: acting ? 0.6 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.taskCheckbox,
            {
              borderColor: isDone ? accentColor : colors.border,
              backgroundColor: isDone ? accentColor : 'transparent',
            },
          ]}
        >
          {isDone ? (
            <MaterialIcons name="check" size={getScaledFontSize(12)} color="#FFFFFF" />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: getScaledFontSize(14),
              fontWeight: getScaledFontWeight(500) as TextStyle['fontWeight'],
              textDecorationLine: isDone || isSkipped ? 'line-through' : 'none',
              opacity: isDone || isSkipped ? 0.6 : 1,
            }}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          {task.description ? (
            <Text
              style={{
                color: colors.subtext,
                fontSize: getScaledFontSize(12),
                marginTop: 2,
              }}
              numberOfLines={2}
            >
              {task.description}
            </Text>
          ) : null}
          {task.source === 'care_manager' ? (
            <Text
              style={{
                color: accentColor,
                fontSize: getScaledFontSize(11),
                marginTop: 4,
              }}
            >
              From your care team
            </Text>
          ) : null}
        </View>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  taskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    minWidth: 88,
  },
  swipeActionsRight: {
    flexDirection: 'row',
  },
  swipeActionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
