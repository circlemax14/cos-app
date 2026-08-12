/**
 * SCRUM-279 / COS-308 — local notifications for calendar events.
 *
 * Schedules expo-notifications local pushes for upcoming events.
 *
 * iOS LIMIT: 64 pending local notifications per app. Ken's build-30
 * test showed the queue saturating at 64 — every event-creation
 * thereafter silently dropped its schedules because iOS rejected them.
 *
 * Strategy (after the 64-cap discovery):
 *   - Only schedule events in the next 7 days (most users only care
 *     about near-future reminders; longer-horizon events get re-
 *     scheduled when they enter that window on a future sync).
 *   - Max 2 alarms per event (the soonest 2 valid offsets).
 *   - Hard cap total schedules at 50 (leaves 14 slots for test
 *     notifications, push-notification scratch, etc.).
 *   - Cancel ALL csh-tagged schedules at the start (calendar +
 *     test) so the queue starts clean.
 *
 * Per Apple Calendar UX, only events with explicit alarms get
 * notified — the OS already notifies via its own calendar app, so
 * duplicating events without alarms would be noisy.
 */

import * as Notifications from 'expo-notifications'
import type { CalendarEvent } from './calendar'

const NOTIFICATION_DATA_TAG = 'csh-calendar-v1'

// Hard caps so we don't saturate iOS's 64-notification queue.
const NEAR_FUTURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_ALARMS_PER_EVENT = 2
const MAX_TOTAL_SCHEDULES = 50

/**
 * Re-sync the OS notification queue against the current event set.
 * Cancels everything WE previously scheduled, then schedules the new
 * set within the caps above.
 *
 * `notificationDisabledCalendarIds`, if provided, lets the caller suppress
 * notifications for specific source calendars (driven by the per-calendar
 * toggle in calendar-settings.tsx).
 *
 * Safe to call repeatedly; idempotent. Returns a small diagnostic
 * object the calendar-settings test button surfaces in the Alert.
 */
export async function reconcileEventNotifications(
  events: CalendarEvent[],
  notificationDisabledCalendarIds?: Set<string>,
  /**
   * 2026-08-12 — the patient's notification-category preferences.
   *
   * This scheduler was entirely UNGATED: it consulted the per-CALENDAR toggles
   * but never the per-CATEGORY ones, so "Appointments" and "Reminders" in
   * Profile -> Reminders promised something they did not deliver. A patient who
   * switched every category off still received these, which is what was
   * reported ("i disabled all reminders ... but still i am recieving task
   * notifications").
   *
   * Mapping follows the labels the patient actually reads:
   *   iOS Reminders (origin 'reminder') -> "Reminders"
   *   everything else (events, visits)  -> "Appointments"
   *
   * Omitted ⇒ ungated, preserving every existing caller byte-for-byte.
   */
  categoryPrefs?: { appointments?: boolean; reminders?: boolean },
): Promise<{ scheduled: number; skippedDueToCap: number; queueSize: number }> {
  try {
    await cancelAllAppScheduled()
  } catch {
    // continue — even if cancel fails, we'll just have stale schedules
  }

  const now = Date.now()
  const horizon = now + NEAR_FUTURE_WINDOW_MS
  let scheduled = 0
  let skippedDueToCap = 0

  // Sort events by start time so we schedule the soonest-upcoming
  // first — if we hit the cap, distant events fall off the back.
  const sorted = [...events].sort((a, b) =>
    new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  )

  for (const event of sorted) {
    if (scheduled >= MAX_TOTAL_SCHEDULES) break

    // SCRUM-279 (build 50): iPad missing-notification fix.
    // Snapshot events pulled from cos-backend (iPhone uploads → iPad
    // downloads) get rendered with `origin='device'` (from the upload
    // source) and `source.allowsWrite=false` (you can't write to a
    // remote device's calendar). The old guard skipped them, so iPad
    // saw the events but never scheduled local notifications for
    // them — Ken got pings on iPhone but silence on iPad for the
    // same account.
    // Allow snapshot events through; only skip read-only DEVICE
    // calendars (Holidays, sports — non-snapshot origin).
    const isSnapshotEvent = event.source.id === 'csh-snapshot' || event.calendarId === 'csh-snapshot'
    if (event.origin === 'device' && !event.source.allowsWrite && !isSnapshotEvent) continue
    if (event.alarms.length === 0) continue
    if (notificationDisabledCalendarIds?.has(event.source.id)) continue
    // Category gate. `!== false` so an absent pref means enabled — a missing
    // or failed prefs read must never silently suppress a push, matching the
    // fail-open stance at the backend chokepoint.
    if (event.origin === 'reminder') {
      if (categoryPrefs?.reminders === false) continue
    } else if (categoryPrefs?.appointments === false) {
      continue
    }

    const startMs = new Date(event.startDate).getTime()
    if (Number.isNaN(startMs)) continue
    // Skip events outside our 7-day horizon. Long-horizon events get
    // picked up on the next sync once they're closer.
    if (startMs > horizon) continue

    // Soonest-firing first (largest offset = earliest fire-time).
    //
    // SCRUM-279 (build 48): if the alarm time is in the past but the
    // event hasn't started yet, fire ~10 seconds from now instead of
    // dropping it. Ken's repro: at 5:40 he created an event for 5:45
    // with a 5-min alarm — alarm time was 5:40 (already past by the
    // time we scheduled), so the strict `fireAt > now` filter dropped
    // it and he got no notification at all. The 10-second buffer keeps
    // expo-notifications' DATE trigger happy and still gives Ken a
    // useful "starting soon" ping.
    const SCHED_BUFFER_MS = 10_000
    const valid = event.alarms
      .map((m) => {
        const idealFireAt = startMs - m * 60_000
        // If the ideal fire time is in the past but the event itself
        // hasn't started yet, schedule for now + buffer.
        const fireAt = idealFireAt < now && startMs > now
          ? now + SCHED_BUFFER_MS
          : idealFireAt
        return { m, fireAt }
      })
      .filter((a) => a.fireAt > now)
      .sort((a, b) => a.fireAt - b.fireAt)
      .slice(0, MAX_ALARMS_PER_EVENT)

    for (const alarm of valid) {
      if (scheduled >= MAX_TOTAL_SCHEDULES) {
        skippedDueToCap += 1
        break
      }
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: event.title,
            body: formatBody(event, alarm.m),
            data: {
              tag: NOTIFICATION_DATA_TAG,
              eventId: event.id,
              calendarId: event.calendarId,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(alarm.fireAt),
          },
        })
        scheduled += 1
      } catch (err) {
        if (__DEV__) console.warn('[calendar-notifications] schedule failed', event.title, err)
      }
    }
  }

  let queueSize = 0
  try {
    queueSize = (await Notifications.getAllScheduledNotificationsAsync()).length
  } catch { /* non-fatal */ }

  return { scheduled, skippedDueToCap, queueSize }
}

function formatBody(event: CalendarEvent, minutesBefore: number): string {
  const when = minutesBefore === 0
    ? 'starting now'
    : minutesBefore < 60
      ? `in ${minutesBefore} min`
      : minutesBefore < 60 * 24
        ? `in ${Math.round(minutesBefore / 60)} h`
        : `in ${Math.round(minutesBefore / 60 / 24)} d`
  return event.location ? `${when} · ${event.location}` : when
}

/**
 * Cancel every notification we scheduled — calendar OR test ones.
 * "App-tagged" = any notification whose data.tag starts with "csh-".
 * Broader than the prior csh-calendar-v1-only sweep, because Ken's
 * build-30 testing accumulated 64 entries that included stale
 * csh-test schedules from the diagnostic button — those weren't
 * being reclaimed and contributed to the cap.
 */
async function cancelAllAppScheduled(): Promise<void> {
  let scheduled: Notifications.NotificationRequest[] = []
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync()
  } catch {
    return
  }
  for (const req of scheduled) {
    const tag = (req.content.data as { tag?: string } | null)?.tag ?? ''
    if (!tag.startsWith('csh-')) continue
    try {
      await Notifications.cancelScheduledNotificationAsync(req.identifier)
    } catch {
      // ignore
    }
  }
}

/**
 * Wipe the queue — exposed so the calendar-settings diagnostic can
 * reset state when the user reports stuck queues.
 */
export async function clearAllAppNotifications(): Promise<number> {
  let removed = 0
  let scheduled: Notifications.NotificationRequest[] = []
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync()
  } catch {
    return 0
  }
  for (const req of scheduled) {
    const tag = (req.content.data as { tag?: string } | null)?.tag ?? ''
    if (!tag.startsWith('csh-')) continue
    try {
      await Notifications.cancelScheduledNotificationAsync(req.identifier)
      removed += 1
    } catch { /* ignore */ }
  }
  return removed
}
