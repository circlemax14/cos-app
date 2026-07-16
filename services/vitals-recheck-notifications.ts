/**
 * Local notification scheduler for vitals recheck reminders (HS-3b).
 *
 * When a vital transitions into amber/red (BP, glucose, resting HR, HRV,
 * SpO2, or a daily-steps shortfall) we schedule a single local reminder
 * asking the patient to recheck the affected metric after a reasonable
 * cooldown window. The observer hook (hooks/use-vitals-red-flag-notifications)
 * feeds this module the active flags; this module owns the expo-notifications
 * side of things.
 *
 * Copies the shape of services/plan-task-notifications.ts VERBATIM:
 *   - SCHEDULE_ONLY_WHEN_GRANTED permission gate (COS-363: never trigger
 *     an implicit "Allow Notifications" prompt from a background observer).
 *   - Cancel-by-tag reconciliation so we only ever touch our own
 *     schedules — plan-task and calendar reminders are left alone.
 *   - Hard self-cap (MAX_TOTAL_SCHEDULES = 6) so we never eat into the
 *     shared iOS 64-notification budget (plan tasks reserve 30, calendar
 *     reserves more).
 *
 * Content copy rule (per the non-fasting HK caveat documented on
 * VitalsRedFlagSection): the glucose recheck copy MUST NOT say "fasting".
 * Apple Health glucose samples are not fast/fed-annotated, so the app
 * only ever displays non-fasting ranges — a "recheck fasting glucose"
 * ping would be clinically wrong.
 */

import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import type { MetricType } from '../lib/vitals-red-flag-rules';

const TAG = 'csh-vitals-recheck-v1';

// Hard cap so vitals reminders can never saturate the shared iOS
// 64-notification queue that plan-task + calendar reminders also use.
// Six is enough to cover the current metric set (bp / glucose / steps /
// hr / hrv / spo2) once each per reconciliation.
const MAX_TOTAL_SCHEDULES = 6;

// Small buffer so a "recheck should have fired already" reminder still
// pings a few seconds from now instead of being dropped by iOS.
const SCHED_BUFFER_MS = 60 * 1000;

// COS-363 / SCRUM-506 (Bug #4): scheduling a local notification while iOS
// notification authorization is still `notDetermined` makes the OS
// implicitly present the permission prompt. That surfaced once already as a
// surprise "Allow Notifications" dialog when a plan-task queue was written
// on mount. We NEVER call requestPermissionsAsync from here — the actual
// REQUEST stays in onboarding / explicit opt-in. Kill-switch: set to false
// to restore always-schedule behaviour.
const SCHEDULE_ONLY_WHEN_GRANTED = true;

export interface ActiveFlag {
  metricType: MetricType;
  observedAt: string;
}

async function isGranted(): Promise<boolean> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    return perms.granted === true;
  } catch {
    return false;
  }
}

async function cancelOurTag(): Promise<void> {
  let scheduled: Notifications.NotificationRequest[] = [];
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return;
  }
  for (const req of scheduled) {
    const tag = (req.content.data as { tag?: string } | null)?.tag ?? '';
    if (tag !== TAG) continue;
    try {
      await Notifications.cancelScheduledNotificationAsync(req.identifier);
    } catch {
      // ignore — best-effort cancel
    }
  }
}

/**
 * Cancel every existing vitals-recheck schedule and re-schedule one
 * recheck reminder per active flag (capped at MAX_TOTAL_SCHEDULES).
 *
 * Idempotent — safe to call on every trends update. Returns silently when
 * notifications are not granted, when the flag list is empty, or when
 * scheduling throws (best-effort throughout: a scheduling failure must
 * never take down the caller).
 */
export async function reconcileVitalsRecheckNotifications(active: ActiveFlag[]): Promise<void> {
  if (SCHEDULE_ONLY_WHEN_GRANTED && !(await isGranted())) return;

  try {
    await cancelOurTag();
  } catch {
    // continue — cancel is best-effort
  }

  const now = Date.now();

  for (const flag of active.slice(0, MAX_TOTAL_SCHEDULES)) {
    const observedMs = Date.parse(flag.observedAt);
    if (Number.isNaN(observedMs)) continue;

    const idealFireAt = observedMs + hoursFor(flag.metricType) * 3600_000;
    const fireAt = idealFireAt < now ? now + SCHED_BUFFER_MS : idealFireAt;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: titleFor(flag.metricType),
          body: bodyFor(flag.metricType),
          data: {
            tag: TAG,
            type: 'vitals-recheck',
            metricType: flag.metricType,
          },
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
        },
      });
    } catch (err) {
      if (__DEV__) {
        // No PHI in log strings — metricType is a taxonomy label, not a value.
        // eslint-disable-next-line no-console
        console.warn('[vitals-recheck-notifications] schedule failed', flag.metricType, err);
      }
    }
  }
}

/**
 * Cooldown window (in hours) before a recheck ping fires after the
 * flagged sample was observed. BP normalises fastest, glucose next,
 * everything else is a next-day check.
 */
function hoursFor(m: MetricType): number {
  if (m === 'bp') return 6;
  if (m === 'glucose') return 4;
  return 24;
}

function titleFor(m: MetricType): string {
  switch (m) {
    case 'bp':
      return 'Recheck your blood pressure';
    case 'glucose':
      return 'Recheck your blood glucose';
    case 'steps':
      return 'Get your steps in today';
    case 'hr':
      return 'Recheck your resting heart rate';
    case 'hrv':
      return 'Check in on your heart rate variability';
    case 'spo2':
      return 'Recheck your blood oxygen';
    default:
      return 'Recheck your vitals';
  }
}

/**
 * Body copy per metric.
 *
 * IMPORTANT — glucose copy MUST NOT say "fasting". Apple Health glucose
 * samples are not fast/fed-annotated, so the app only ever applies
 * non-fasting ranges (see the "Non-fasting ranges applied" subtitle on
 * VitalsRedFlagSection). Suggesting a fasting recheck would be
 * clinically wrong for a sample we can't confirm was taken fasted.
 */
function bodyFor(m: MetricType): string {
  switch (m) {
    case 'bp':
      return 'Take a fresh reading now that you have had some time to rest.';
    case 'glucose':
      return 'Take a fresh reading when you are ready — no fasting required.';
    case 'steps':
      return 'A short walk can help you close the gap before the day ends.';
    case 'hr':
      return 'Take a resting measurement after a few minutes of calm.';
    case 'hrv':
      return 'Open the Health app and see how your HRV is trending today.';
    case 'spo2':
      return 'Take a fresh measurement — sit still and try again.';
    default:
      return 'Take a fresh reading when you are ready.';
  }
}
