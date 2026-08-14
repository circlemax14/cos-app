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

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import type { MetricType } from '../lib/vitals-red-flag-rules';

const TAG = 'csh-vitals-recheck-v1';

// Hard cap so vitals reminders can never saturate the shared iOS
// 64-notification queue that plan-task + calendar reminders also use.
// Six is enough to cover the current metric set (bp / glucose / steps /
// hr / hrv / spo2) once each per reconciliation.
const MAX_TOTAL_SCHEDULES = 6;

// COS-363 / SCRUM-506 (Bug #4): scheduling a local notification while iOS
// notification authorization is still `notDetermined` makes the OS
// implicitly present the permission prompt. That surfaced once already as a
// surprise "Allow Notifications" dialog when a plan-task queue was written
// on mount. We NEVER call requestPermissionsAsync from here — the actual
// REQUEST stays in onboarding / explicit opt-in. Kill-switch: set to false
// to restore always-schedule behaviour.
const SCHEDULE_ONLY_WHEN_GRANTED = true;

// Per-day dedupe key format. Once we've scheduled (or fired) a recheck for
// a given metric on a given YYYY-MM-DD, we do not schedule another for that
// metric until the day rolls over — this is what stops the "60s from now"
// spam loop that reported on 2026-07-16 (each app open re-created a
// near-immediate ping for the same stale flag).
const dedupeKey = (m: MetricType, day: string) => `csh-vitals-recheck:${m}:${day}`;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

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

/**
 * Schedule one recheck reminder per active flag whose reading is still
 * inside its recheck window AND whose per-day dedupe key is unset.
 *
 * Design (post-2026-07-16 spam-loop fix):
 *  - NO cancel-by-tag. The prior cancel-then-reschedule dance turned into
 *    spam: every observer run cancelled the pending schedule and, for
 *    flags with an old `observedAt`, immediately created a fresh
 *    `now + 60s` schedule (because `idealFireAt` was in the past). On a
 *    stale amber flag, opening the app twice = two "recheck your …"
 *    pings within a minute of each other.
 *  - Freshness gate: if `observedAt + hoursFor(metric)` is already in the
 *    past, the recheck moment has passed. We do NOT ping the user for a
 *    reading we already missed the window on.
 *  - Per-day dedupe: once we've persisted a `csh-vitals-recheck:<metric>:<day>`
 *    key, we never re-schedule that metric until the calendar day rolls.
 *
 * Idempotent, safe to call on every trends update. Returns silently on
 * missing notifications permission, empty input, storage failure, or a
 * scheduling throw (best-effort throughout).
 */
/**
 * Cancel every notification this module scheduled, by tag.
 *
 * The file header has claimed "cancel-by-tag reconciliation" since HS-3b, but
 * no such function existed — the scheduler only ever ADDED, relying on a
 * per-day AsyncStorage dedupe key to avoid repeats. That was survivable while
 * nothing could turn the feature off; it is not survivable now that "Health
 * alerts" can be switched off, because the already-queued alerts would keep
 * firing for their full cooldown window.
 *
 * Tag-scoped on purpose: plan-task and calendar reminders live in the same iOS
 * queue and must not be touched.
 */
export async function cancelAllVitalsScheduled(): Promise<void> {
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
      // ignore — best effort
    }
  }
}

export async function reconcileVitalsRecheckNotifications(
  active: ActiveFlag[],
  /**
   * 2026-08-12 — the "Health alerts" notification category.
   *
   * This scheduler was entirely ungated: a patient who switched every toggle
   * off still received vitals rechecks, which is what was reported
   * ("i disabled all reminders ... but still i am recieving task
   * notifications"). It now has its own category rather than borrowing one —
   * `otherTask` defaults OFF and would have silenced the most clinically
   * urgent alert we send, and `nudges` promises AI-informed prompts while
   * these are rule-based.
   *
   * FAILS OPEN: only an explicit `false` suppresses, so a missing or failed
   * prefs read can never swallow a "recheck your blood pressure".
   */
  healthAlertsEnabled?: boolean,
): Promise<void> {
  if (healthAlertsEnabled === false) {
    // Cancel anything already queued, then stop. Turning the switch off has
    // to clear the existing queue, not merely stop adding to it — otherwise
    // alerts scheduled earlier keep firing for their full cooldown window.
    await cancelAllVitalsScheduled().catch(() => { /* non-fatal */ });
    return;
  }
  if (SCHEDULE_ONLY_WHEN_GRANTED && !(await isGranted())) return;

  const now = Date.now();
  const today = dayKey(now);

  for (const flag of active.slice(0, MAX_TOTAL_SCHEDULES)) {
    const observedMs = Date.parse(flag.observedAt);
    if (Number.isNaN(observedMs)) continue;

    const idealFireAt = observedMs + hoursFor(flag.metricType) * 3600_000;
    // Freshness gate — if the recheck window is already past, skip. Better
    // to under-nag than to spam a "60s from now" ping every time the app
    // opens.
    if (idealFireAt <= now) continue;

    // Per-day dedupe — if we've already scheduled this metric today, skip.
    // The key persists after the schedule fires, so re-opens don't
    // re-schedule the same day.
    const key = dedupeKey(flag.metricType, today);
    let already: string | null = null;
    try {
      already = await AsyncStorage.getItem(key);
    } catch {
      // Best-effort dedupe: a storage read failure means we may schedule
      // twice today. Still bounded by MAX_TOTAL_SCHEDULES and by the
      // freshness gate — not a spam loop.
    }
    if (already) continue;

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
          date: new Date(idealFireAt),
        },
      });
      // Mark the day AFTER a successful schedule — a failed schedule
      // should be retried on the next reconcile, not silently dropped.
      try {
        await AsyncStorage.setItem(key, '1');
      } catch {
        // Best-effort persistence — worst case we schedule again on the
        // next reconcile, still bounded by freshness + MAX_TOTAL_SCHEDULES.
      }
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
