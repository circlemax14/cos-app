/**
 * SCRUM-279 / COS-308 — local notifications for calendar events.
 *
 * Schedules one expo-notifications local notification per event-alarm
 * combo. We dedupe by event id so reschedule is idempotent — when the
 * background sync (or foreground refresh) brings in new event data, we
 * cancel any stale schedules for events that have changed/disappeared
 * and schedule the current set.
 *
 * Per Apple Calendar UX, only events with explicit alarms get notified
 * (we don't second-guess by adding default alarms). The OS already
 * notifies via its own calendar app, so duplicating would be noisy.
 *
 * Future v2 hook (per user spec): per-calendar opt-in toggle in
 * Settings. For v1 we notify for every event whose source calendar
 * `allowsWrite` (i.e. user's own calendars, not subscribed read-only
 * holiday/birthday/sports feeds).
 */

import * as Notifications from 'expo-notifications'
import type { CalendarEvent } from './calendar'

const NOTIFICATION_DATA_TAG = 'csh-calendar-v1'

/**
 * Re-sync the OS notification queue against the current event set.
 * Cancels everything we previously scheduled, then schedules the new set.
 *
 * Safe to call repeatedly; idempotent.
 */
export async function reconcileEventNotifications(events: CalendarEvent[]): Promise<void> {
  try {
    await cancelAllAppScheduled()
  } catch {
    // continue — even if cancel fails, we'll just have stale schedules
  }

  const now = Date.now()
  for (const event of events) {
    if (event.origin !== 'device') continue
    if (!event.source.allowsWrite) continue // skip subscribed read-only calendars
    if (event.alarms.length === 0) continue

    const startMs = new Date(event.startDate).getTime()
    if (Number.isNaN(startMs)) continue

    for (const minutesBefore of event.alarms) {
      const fireAt = startMs - minutesBefore * 60_000
      if (fireAt <= now) continue // skip past alarms

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: event.title,
            body: formatBody(event, minutesBefore),
            data: {
              tag: NOTIFICATION_DATA_TAG,
              eventId: event.id,
              calendarId: event.calendarId,
            },
          },
          trigger: { date: new Date(fireAt) } as Notifications.NotificationTriggerInput,
        })
      } catch {
        // ignore individual scheduling failures — one bad event shouldn't
        // wipe out the queue for the rest.
      }
    }
  }
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

async function cancelAllAppScheduled(): Promise<void> {
  let scheduled: Notifications.NotificationRequest[] = []
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync()
  } catch {
    return
  }
  for (const req of scheduled) {
    const tag = (req.content.data as { tag?: string } | null)?.tag
    if (tag !== NOTIFICATION_DATA_TAG) continue
    try {
      await Notifications.cancelScheduledNotificationAsync(req.identifier)
    } catch {
      // ignore
    }
  }
}
