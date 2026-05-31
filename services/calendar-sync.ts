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
import { readEvents } from './calendar'

export const CALENDAR_SYNC_TASK = 'csh-calendar-sync-v1'

/**
 * Module-load registration. Must run synchronously at import time so the
 * native side knows about the task before any background wake delivery.
 * The body itself is what runs when iOS/Android wakes us.
 */
try {
  if (!TaskManager.isTaskDefined(CALENDAR_SYNC_TASK)) {
    TaskManager.defineTask(CALENDAR_SYNC_TASK, async () => {
      try {
        const events = await readEvents()
        // For v1 we don't compute notifications inside the background
        // task itself — the foreground hook handles scheduling. Returning
        // NewData lets the OS know it was worth waking us (so iOS doesn't
        // back off the schedule).
        return events.length > 0
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
      minimumInterval: 15 * 60, // 15 minutes — iOS treats as hint
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
