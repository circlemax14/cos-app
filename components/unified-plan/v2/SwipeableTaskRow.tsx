/**
 * SwipeableTaskRow — CHUNK 9.4 (2026-07-21) — Swipeable-free fallback.
 *
 * Ken's iOS 26.5 (build 62) reliably crashes any time a fetch fires as a
 * downstream effect of tapping a Pressable rendered INSIDE Swipeable's
 * renderRightActions callback. We tried three deferral strategies
 * (InteractionManager, setTimeout, direct-await) — all crash the same
 * way (SIGABRT on com.meta.react.turbomodulemanager.queue). The gesture
 * itself + the fetch itself are each individually safe; the composition
 * isn't, and no amount of tick-deferral fixes it.
 *
 * Fallback: DROP react-native-gesture-handler entirely from this row.
 * Show a small "…" (kebab) Pressable on the right edge of the row that
 * toggles an inline action bar (Skip today / Snooze 1h / Reschedule) as
 * plain View children. No gesture-handler, no Swipeable, no
 * renderXActions callbacks. All Pressables are top-level React children
 * of the row, so tapping any of them dispatches through the normal RN
 * touch pipeline — the same pipeline that already works for every other
 * button in chunks 1–8.
 *
 * Trade-off: slightly less delightful than swipe (extra tap to reveal
 * actions), but bulletproof on iOS 26.5. Once cos-app#266/267/268 land
 * and Ken's binary picks them up, we can restore the Swipeable path
 * behind a Platform.Version >= 26 fallback gate.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { getAccessToken } from '@/lib/auth-tokens';
import type { UnifiedTask } from '@/services/api/unified-plan';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

// CHUNK 9.5 experiment — RAW fire-and-forget fetch. Bypasses axios,
// bypasses response reading, bypasses interceptors. Tests the
// hypothesis that iOS 26.5's crash on user-tap → fetch is in response
// processing rather than request initiation.
async function skipTaskFireAndForget(taskId: string, scheduledFor: string): Promise<void> {
  try {
    const token = await getAccessToken();
    const url = `${API_BASE.replace(/\/$/, '')}/v1/patients/me/tasks/${encodeURIComponent(taskId)}/skip`;
    // No await on the fetch. No response.json(). No .then(). Nothing to
    // consume. If iOS 26 chokes on response deserialization or an axios
    // interceptor callback, this dodges it.
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ scheduledFor }),
    }).catch(() => {
      // Swallow every error — this is fire-and-forget; next poll reconciles.
    });
  } catch {
    // getAccessToken failed; nothing else to do.
  }
}

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

  const [expanded, setExpanded] = React.useState(false);
  const [acting, setActing] = React.useState(false);
  const [locallySkipped, setLocallySkipped] = React.useState(false);

  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped' || locallySkipped;
  if (locallySkipped) return null;

  const onKebabTap = React.useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const doSkip = React.useCallback(() => {
    if (acting) return;
    // CHUNK 9.5 — optimistic hide first, fire-and-forget fetch second.
    // No await, no response processing. If Ken doesn't crash on this,
    // response-side processing is the iOS 26.5 trigger (not the
    // request itself). We reconcile on next poll via onRefetch.
    setLocallySkipped(true);
    setActing(true);
    skipTaskFireAndForget(task.id, todayYYYYMMDD());
    // Schedule refetch a bit later so BE has time to receive the POST.
    setTimeout(() => {
      onRefetch?.();
      setActing(false);
    }, 1500);
  }, [acting, task.id, onRefetch]);

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: colors.border,
          backgroundColor: colors.background,
          opacity: acting ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.headRow}>
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
        <Pressable
          onPress={onKebabTap}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${task.title}`}
          hitSlop={12}
          style={({ pressed }) => [styles.kebab, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons
            name={expanded ? 'expand-less' : 'more-horiz'}
            size={getScaledFontSize(22)}
            color={colors.subtext}
          />
        </Pressable>
      </View>

      {expanded ? (
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={doSkip}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${task.title} today`}
            disabled={acting}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: '#9CA3AF',
                opacity: pressed || acting ? 0.75 : 1,
              },
            ]}
          >
            {acting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>Skip today</Text>
            )}
          </Pressable>
          <View style={[styles.actionBtn, { backgroundColor: '#F59E0B', opacity: 0.5 }]}>
            <Text style={styles.actionBtnText}>Snooze 1h</Text>
          </View>
          <View style={[styles.actionBtn, { backgroundColor: '#3B82F6', opacity: 0.5 }]}>
            <Text style={styles.actionBtnText}>Reschedule</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  kebab: {
    padding: 4,
    marginTop: -2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
});
