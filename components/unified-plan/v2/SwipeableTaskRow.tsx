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
 *
 * CHUNK 22 (2026-07-21) — Skip Undo. Tapping Skip enters a 4s pending state
 * (line-through + inline 'Skipped — undo?' pill). Undo cancels the pending
 * fire-and-forget POST cleanly; timer is cancelled on unmount via useEffect
 * cleanup (same pattern as CareManagerToast chunk 12). Snooze/Reschedule
 * are disabled during the pending window to prevent conflicting actions.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { getAccessToken } from '@/lib/auth-tokens';
import type { UnifiedTask } from '@/services/api/unified-plan';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

// CHUNK 9.5 discovery — raw fire-and-forget fetch dodges the iOS 26.5
// SIGABRT that hits when axios processes a response initiated from a
// user-tap event handler. All Phase 6.1 interactive endpoints (skip,
// snooze, reschedule) route through this helper on this binary until
// cos-app#266/267/268 land + a new binary ships.
type FireAndForgetBody = Record<string, unknown>;
async function fireAndForgetPost(path: string, body: FireAndForgetBody): Promise<void> {
  try {
    const token = await getAccessToken();
    const url = `${API_BASE.replace(/\/$/, '')}${path}`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => {
      // Swallow every error — reconcile on next poll.
    });
  } catch {
    // getAccessToken failed; nothing to do.
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
  const [showReschedulePicker, setShowReschedulePicker] = React.useState(false);
  const [acting, setActing] = React.useState(false);
  const [locallySkipped, setLocallySkipped] = React.useState(false);
  const [locallySnoozed, setLocallySnoozed] = React.useState(false);
  const [locallyRescheduledTo, setLocallyRescheduledTo] = React.useState<string | null>(null);
  const [skipPending, setSkipPending] = React.useState(false);
  const skipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // CHUNK 22 fix (adversarial-verify addendum): track the inner post-fire
  // refetch timer so an unmount between t=4000 and t=5500ms cannot leak
  // an onRefetch call on a dead component (the outer 4s timer already
  // has ref-tracked cleanup below).
  const refetchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (skipTimerRef.current) {
        clearTimeout(skipTimerRef.current);
        skipTimerRef.current = null;
      }
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    },
    [],
  );

  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped' || locallySkipped;

  const onKebabTap = React.useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const doSkip = React.useCallback(() => {
    if (acting || skipPending) return;
    const scheduledFor = todayYYYYMMDD(); // captured at tap-time, not at fire-time
    setSkipPending(true);
    setExpanded(false);
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
    }
    skipTimerRef.current = setTimeout(() => {
      // Idempotency guard: if undoSkip cleared the ref, do nothing.
      // (This branch is defensive — undoSkip also nulls the ref before setSkipPending(false).)
      if (skipTimerRef.current === null) return;
      skipTimerRef.current = null;
      setLocallySkipped(true);
      fireAndForgetPost(
        `/v1/patients/me/tasks/${encodeURIComponent(task.id)}/skip`,
        { scheduledFor },
      );
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        onRefetch?.();
      }, 1500);
    }, 4000);
  }, [acting, skipPending, task.id, onRefetch]);

  const undoSkip = React.useCallback(() => {
    if (skipTimerRef.current) {
      clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
    setSkipPending(false);
  }, []);

  const doSnooze = React.useCallback(() => {
    if (acting) return;
    setLocallySnoozed(true);
    setExpanded(false);
    setActing(true);
    fireAndForgetPost(
      `/v1/patients/me/tasks/${encodeURIComponent(task.id)}/snooze`,
      { scheduledFor: todayYYYYMMDD(), deltaMinutes: 60 },
    );
    setTimeout(() => {
      onRefetch?.();
      setActing(false);
    }, 1500);
  }, [acting, task.id, onRefetch]);

  const onRescheduleTap = React.useCallback(() => {
    setShowReschedulePicker((prev) => !prev);
  }, []);

  const doReschedule = React.useCallback(
    (deltaHours: number, tomorrow = false) => {
      if (acting) return;
      const now = new Date();
      const target = new Date(now.getTime() + deltaHours * 3600_000);
      if (tomorrow) {
        target.setDate(target.getDate() + 1);
        target.setHours(9, 0, 0, 0);
      }
      const hh = String(target.getHours()).padStart(2, '0');
      const mm = String(target.getMinutes()).padStart(2, '0');
      const newTime = `${hh}:${mm}`;
      setLocallyRescheduledTo(newTime);
      setShowReschedulePicker(false);
      setExpanded(false);
      setActing(true);
      fireAndForgetPost(
        `/v1/patients/me/tasks/${encodeURIComponent(task.id)}/reschedule-occurrence`,
        { scheduledFor: todayYYYYMMDD(), newTime },
      );
      setTimeout(() => {
        onRefetch?.();
        setActing(false);
      }, 1500);
    },
    [acting, task.id, onRefetch],
  );

  // CHUNK 22 fix (adversarial-verify addendum): guard moved from above
  // the useCallback declarations to just before the render return. The
  // previous position violated the Rules of Hooks — once chunk 22 first
  // called setLocallySkipped(true) inside the 4s timer, the next render
  // would bail before the 6 useCallback hooks and React would throw
  // "Rendered fewer hooks than expected." Now all hooks always run,
  // and only the render output is conditional. Same visual outcome.
  if (locallySkipped) return null;

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
              textDecorationLine: isDone || isSkipped || skipPending ? 'line-through' : 'none',
              opacity: isDone || isSkipped || skipPending ? 0.6 : 1,
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
          {locallySnoozed ? (
            <Text
              style={{
                color: '#F59E0B',
                fontSize: getScaledFontSize(11),
                marginTop: 4,
                fontWeight: '600',
              }}
            >
              Snoozed 1 hour
            </Text>
          ) : null}
          {locallyRescheduledTo ? (
            <Text
              style={{
                color: '#3B82F6',
                fontSize: getScaledFontSize(11),
                marginTop: 4,
                fontWeight: '600',
              }}
            >
              Rescheduled to {locallyRescheduledTo}
            </Text>
          ) : null}
          {skipPending && !isDone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text
                style={{
                  color: colors.subtext,
                  fontSize: getScaledFontSize(12),
                  fontWeight: '600',
                }}
                accessibilityLabel={`Task will be skipped in 4 seconds. Double tap Undo to cancel.`}
              >
                Skipped — undo?
              </Text>
              <Pressable
                onPress={undoSkip}
                accessibilityRole="button"
                accessibilityLabel={`Undo skip for ${task.title}`}
                accessibilityHint="Cancels the pending skip before it saves"
                hitSlop={10}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.subtext,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ color: colors.text, fontSize: getScaledFontSize(12), fontWeight: '600' }}>
                  Undo
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {/* CHUNK 25 — Labeled "More" affordance pill replacing naked ⋮ kebab.
            Hide gate is intentionally narrow: only `locallySkipped && !skipPending`
            (i.e. after the 4s undo window has expired and the row is already in
            the return-null path via line 212). BE-side completed / skipped rows
            keep the pill so reschedule-on-completed stays reachable — this is the
            conservative variant per plan Step 2 (unknown BE contract). Enum-drift
            discipline: no `task.status !== 'pending'` shortcut — unknown status
            degrades to *showing* the pill. */}
        {locallySkipped && !skipPending ? null : (
          <Pressable
            onPress={onKebabTap}
            accessibilityRole="button"
            accessibilityLabel={
              skipPending
                ? `Skipping ${task.title}`
                : expanded
                ? `Hide actions for ${task.title}`
                : `More actions for ${task.title}`
            }
            accessibilityHint={skipPending ? undefined : 'Skip, snooze, or reschedule'}
            hitSlop={12}
            style={({ pressed }) => [
              styles.kebab,
              {
                borderColor: colors.border,
                opacity: skipPending ? 0.5 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <MaterialIcons
              name={expanded ? 'expand-less' : 'more-horiz'}
              size={getScaledFontSize(18)}
              color={colors.subtext}
            />
            <Text style={[styles.kebabLabel, { color: colors.subtext, fontSize: getScaledFontSize(11) }]}>
              {skipPending ? 'Skipping…' : expanded ? 'Close' : 'More'}
            </Text>
          </Pressable>
        )}
      </View>

      {expanded ? (
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={doSkip}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${task.title} today`}
            disabled={acting || skipPending}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: '#9CA3AF',
                opacity: pressed || acting || skipPending ? 0.75 : 1,
              },
            ]}
          >
            {acting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>Skip today</Text>
            )}
          </Pressable>
          <Pressable
            onPress={doSnooze}
            accessibilityRole="button"
            accessibilityLabel={`Snooze ${task.title} for 1 hour`}
            disabled={acting || locallySnoozed || skipPending}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: '#F59E0B',
                opacity: pressed || acting || locallySnoozed || skipPending ? 0.75 : 1,
              },
            ]}
          >
            <Text style={styles.actionBtnText}>Snooze 1h</Text>
          </Pressable>
          <Pressable
            onPress={onRescheduleTap}
            accessibilityRole="button"
            accessibilityLabel={`Reschedule ${task.title}`}
            disabled={acting || skipPending}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: '#3B82F6',
                opacity: pressed || acting || skipPending ? 0.75 : 1,
              },
            ]}
          >
            <Text style={styles.actionBtnText}>Reschedule</Text>
          </Pressable>
        </View>
      ) : null}

      {expanded && showReschedulePicker ? (
        <View style={[styles.pickerRow, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => doReschedule(1)}
            style={({ pressed }) => [
              styles.pickerBtn,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.pickerBtnText, { color: colors.text }]}>+1 h</Text>
          </Pressable>
          <Pressable
            onPress={() => doReschedule(2)}
            style={({ pressed }) => [
              styles.pickerBtn,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.pickerBtnText, { color: colors.text }]}>+2 h</Text>
          </Pressable>
          <Pressable
            onPress={() => doReschedule(4)}
            style={({ pressed }) => [
              styles.pickerBtn,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.pickerBtnText, { color: colors.text }]}>+4 h</Text>
          </Pressable>
          <Pressable
            onPress={() => doReschedule(0, true)}
            style={({ pressed }) => [
              styles.pickerBtn,
              { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.pickerBtnText, { color: colors.text }]}>Tomorrow</Text>
          </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
    marginTop: -2,
  },
  kebabLabel: {
    fontWeight: '500',
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
  pickerRow: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerBtn: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  pickerBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
