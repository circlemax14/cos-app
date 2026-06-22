/**
 * Local notification scheduler for AI plan tasks (SCRUM-279, build 51).
 *
 * Ken's feedback after build 50:
 *   "I am not getting notifications for task and these task
 *    notifications should have 15 min window too."
 *
 * The existing calendar notifications cover *calendar events + iOS
 * Reminders*. AI plan tasks (medication, vitals checks, exercise)
 * live in a separate planTasks array and never made it into the
 * notification queue. This module fixes that, mirroring the calendar
 * notification approach (cancel-all + reschedule, hard caps so we
 * don't blow past iOS's 64-notification cap).
 *
 * Notification pair per task (matches Ken's "15-min window" spec):
 *   - 15 minutes before scheduledTime
 *   - At scheduledTime
 *
 * Coexists with calendar-notifications.ts: it cancels only PLAN-TASK
 * tagged notifications (`csh-plan-task-v1`), leaves the calendar
 * ones (`csh-calendar-v1`) alone. Both share the 50-schedule
 * combined cap by reading the live queue size first.
 */

import * as Notifications from 'expo-notifications';
import type { TaskOccurrence } from '@/services/api/types';

const PLAN_TASK_TAG = 'csh-plan-task-v1';

// Hard caps so the combined queue (plan + calendar + reminders)
// doesn't saturate iOS's 64-notification cap.
const NEAR_FUTURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_TOTAL_PLAN_SCHEDULES = 30;

// COS-363 / SCRUM-506 (Bug #4): scheduling a local notification while iOS
// notification authorization is still `notDetermined` makes the OS implicitly
// present the permission prompt. That surfaced as a surprise "Allow
// Notifications" dialog the moment Today's Schedule mounted (the user read it
// as a "health app" prompt). We now only schedule when permission is ALREADY
// granted — the read-only getPermissionsAsync below never prompts. The actual
// REQUEST stays in onboarding / an explicit opt-in. Kill-switch: set false to
// restore the previous always-schedule behaviour.
const SCHEDULE_ONLY_WHEN_GRANTED = true;

/**
 * Convert "HH:MM" + a YYYY-MM-DD date into a JS Date in LOCAL time.
 * Used to anchor plan-task notifications to the patient's wall clock,
 * not UTC.
 */
function localTimeForDate(yyyymmdd: string, hhmm: string): Date {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

async function cancelAllPlanTaskScheduled(): Promise<void> {
  let scheduled: Notifications.NotificationRequest[] = [];
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return;
  }
  for (const req of scheduled) {
    const tag = (req.content.data as { tag?: string } | null)?.tag ?? '';
    if (tag !== PLAN_TASK_TAG) continue;
    try {
      await Notifications.cancelScheduledNotificationAsync(req.identifier);
    } catch {
      // ignore
    }
  }
}

export interface PlanNotificationOutcome {
  scheduled: number;
  skipped: number;
}

/**
 * Schedule a 15-min-before + at-time pair of local notifications for
 * each non-completed plan task in `tasks`. Idempotent — cancels every
 * existing plan-task-tagged schedule first, then re-schedules.
 *
 * SCRUM-279 (build 51): mirrors the calendar-notification "fire near-
 * past alarms shortly from now" trick so a task created at 5:40 for
 * 5:45 still pings at 5:40:10.
 */
export async function reconcilePlanTaskNotifications(
  tasks: TaskOccurrence[],
): Promise<PlanNotificationOutcome> {
  // COS-363 (Bug #4): never let scheduling implicitly prompt for notification
  // permission. getPermissionsAsync is READ-ONLY (never prompts); if auth isn't
  // already granted we bail without scheduling, so Today's Schedule can't
  // trigger a surprise OS dialog on mount. Granted users are unaffected.
  if (SCHEDULE_ONLY_WHEN_GRANTED) {
    let granted = false;
    try {
      const perms = await Notifications.getPermissionsAsync();
      granted = perms.granted;
    } catch {
      granted = false;
    }
    if (!granted) {
      return { scheduled: 0, skipped: tasks.length };
    }
  }

  try {
    await cancelAllPlanTaskScheduled();
  } catch {
    // continue
  }

  const now = Date.now();
  const horizon = now + NEAR_FUTURE_WINDOW_MS;
  const SCHED_BUFFER_MS = 10_000;
  let scheduled = 0;
  let skipped = 0;

  // Skip already-completed / skipped tasks; the user has dealt with them.
  const open = tasks.filter((t) => t.status === 'pending');

  // Sort by scheduled time so the soonest-firing reservations win
  // when we hit the cap.
  const sorted = [...open].sort((a, b) => {
    const ta = localTimeForDate(a.scheduledFor, a.scheduledTime).getTime();
    const tb = localTimeForDate(b.scheduledFor, b.scheduledTime).getTime();
    return ta - tb;
  });

  for (const task of sorted) {
    if (scheduled >= MAX_TOTAL_PLAN_SCHEDULES) {
      skipped += 1;
      continue;
    }
    const startMs = localTimeForDate(task.scheduledFor, task.scheduledTime).getTime();
    if (Number.isNaN(startMs)) continue;
    if (startMs > horizon) continue;

    // Build the 15-before + at-time pair.
    const fireTimes: number[] = [];
    for (const offsetMin of [15, 0]) {
      const ideal = startMs - offsetMin * 60_000;
      // Near-past alarm but task hasn't started → fire shortly from now
      // (matches calendar-notifications.ts build-48 behaviour).
      const fireAt = ideal < now && startMs > now ? now + SCHED_BUFFER_MS : ideal;
      if (fireAt > now) fireTimes.push(fireAt);
    }
    // Dedup any duplicate fire times that the near-past clamp produced.
    const uniqueFires = Array.from(new Set(fireTimes)).sort((a, b) => a - b);

    for (const fireAt of uniqueFires) {
      if (scheduled >= MAX_TOTAL_PLAN_SCHEDULES) {
        skipped += 1;
        break;
      }
      const minutesBefore = Math.max(0, Math.round((startMs - fireAt) / 60_000));
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: task.title,
            body: formatBody(task, minutesBefore),
            data: {
              tag: PLAN_TASK_TAG,
              taskId: task.id,
              scheduledFor: task.scheduledFor,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(fireAt),
          },
        });
        scheduled += 1;
      } catch (err) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[plan-task-notifications] schedule failed', task.title, err);
        }
      }
    }
  }

  return { scheduled, skipped };
}

function formatBody(task: TaskOccurrence, minutesBefore: number): string {
  const when = minutesBefore === 0
    ? 'starting now'
    : minutesBefore < 60
      ? `in ${minutesBefore} min`
      : `at ${task.scheduledTime}`;
  const typeHint =
    task.type === 'medication' ? 'Time to take your medication' :
    task.type === 'exercise' ? 'Time to move' :
    task.type === 'appointment' ? 'Appointment reminder' :
    'Reminder';
  return `${typeHint} · ${when}`;
}
