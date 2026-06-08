/**
 * SCRUM-279 / COS-308 — background sync task.
 *
 * Wakes the app every 15 minutes (best-effort on iOS, more reliable on
 * Android) so we can:
 *   1. Refresh our in-memory event cache (so the next foreground open
 *      shows already-up-to-date data, no spinner).
 *   2. Compute notifications for events the user opted into per-calendar
 *      and schedule local notifications via expo-notifications.
 *
 * iOS BackgroundFetch caveat:
 *   `minimumInterval: 900` is a HINT. iOS decides the actual fire
 *   cadence based on app usage, battery, and the user's prior interaction
 *   patterns. The 15-minute target may stretch to 30 min - 2 hours in
 *   practice. Android (WorkManager) honors the interval much more closely.
 *   See the SCRUM-279 pros/cons doc for the recommended user-facing
 *   expectation.
 *
 * Defensive coding (matches services/calendar.ts):
 *   Every native bridge call is wrapped in try/catch. The TaskManager
 *   `defineTask` runs at module load; if its native bridge isn't ready
 *   (mis-configured native build, mismatched runtime), throwing here
 *   would crash app launch BEFORE any UI renders. We silently no-op
 *   instead — worst case the hourly background sync doesn't register,
 *   which is already a best-effort feature.
 */

import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { readEvents, readReminders } from './calendar'
import { uploadCalendarSnapshot, type SnapshotEventPayload } from './api/calendar'

export const CALENDAR_SYNC_TASK = 'csh-calendar-sync-v1'

/**
 * Compute a cheap content hash so the backend can dedup unchanged
 * events on repeated uploads. SHA-1 quality not required — just a
 * stable digest that flips when something the user cares about
 * changes (title / time / location). Pure JS so it runs in the
 * background task without native deps.
 */
function contentHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(16)
}

/**
 * Module-load registration. Must run synchronously at import time so the
 * native side knows about the task before any background wake delivery.
 * The body itself is what runs when iOS/Android wakes us.
 */
/**
 * Pull device events + reminders for the next 60 days and POST a
 * snapshot to cos-backend. Returns the number of rows uploaded.
 *
 * Pulled out into its own exported function so it can run from:
 *   - the BackgroundFetch task (every 30 min when backgrounded)
 *   - the foreground (e.g. calendar tab mount) for users who haven't
 *     left the app idle long enough for iOS to wake the bg task
 *
 * Best-effort: caller's try/catch wraps any backend / native failure.
 */
export async function buildAndUploadSnapshot(): Promise<number> {
  const windowStart = new Date()
  const windowEnd = new Date(Date.now() + 60 * 24 * 60 * 60_000)
  const [events, reminders] = await Promise.all([
    readEvents({ windowStart, windowEnd }),
    readReminders({ windowStart, windowEnd }).catch(() => []),
  ])
  const payload: SnapshotEventPayload[] = [
    ...events.map((e) => ({
      origin: 'device' as const,
      sourceEventId: e.id,
      sourceCalendarName: e.source.title,
      sourceCalendarSource: e.source.source,
      sourceCalendarColor: e.source.color,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      allDay: e.allDay,
      location: e.location,
      notes: e.notes,
      alarms: e.alarms,
      contentHash: contentHash(`${e.id}|${e.title}|${e.startDate}|${e.endDate}|${e.location ?? ''}`),
    })),
    ...reminders.map((r) => ({
      origin: 'reminder' as const,
      sourceEventId: r.id,
      sourceCalendarName: r.source.title,
      sourceCalendarSource: r.source.source,
      sourceCalendarColor: r.source.color,
      title: r.title,
      startDate: r.startDate,
      endDate: r.endDate,
      allDay: r.allDay,
      location: r.location,
      notes: r.notes,
      alarms: r.alarms,
      completed: r.completed,
      contentHash: contentHash(`${r.id}|${r.title}|${r.startDate}|${!!r.completed}`),
    })),
  ]
  if (payload.length === 0) return 0
  const result = await uploadCalendarSnapshot(payload, new Date().toISOString())
  return result.written
}

try {
  if (!TaskManager.isTaskDefined(CALENDAR_SYNC_TASK)) {
    TaskManager.defineTask(CALENDAR_SYNC_TASK, async () => {
      try {
        const written = await buildAndUploadSnapshot().catch(() => 0)
        return written > 0
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed
      }
    })
  }
} catch {
  // Native bridge not ready at module load — silently skip. See header.
}

/**
 * Ask the OS to run the sync task at least every 15 minutes. Idempotent;
 * safe to call repeatedly (e.g. from the calendar screen mount).
 */
export async function registerCalendarSync(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync()
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied
        || status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
      return
    }
    await BackgroundFetch.registerTaskAsync(CALENDAR_SYNC_TASK, {
      minimumInterval: 30 * 60, // 30 minutes — iOS treats as hint (Ken's spec)
      stopOnTerminate: false,
      startOnBoot: true,
    })
  } catch {
    // Best-effort; foreground refresh still works.
  }
}

/**
 * Unregister the sync task. Called when the user revokes calendar
 * permission so we stop waking the app on a feature that's now off.
 */
export async function unregisterCalendarSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(CALENDAR_SYNC_TASK)
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(CALENDAR_SYNC_TASK)
    }
  } catch {
    // Swallow — best-effort cleanup.
  }
}
